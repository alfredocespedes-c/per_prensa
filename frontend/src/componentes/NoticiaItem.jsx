import { esHoy, tiempoRelativo } from '../utilidades/fechas.js'

// Indicador de sentimiento "filete lateral": el borde izquierdo de la tarjeta
// toma el color del tono. Sin análisis → neutra (ninguna tarjeta queda sin señal).
const ETIQUETAS_SENTIMIENTO = {
  positiva: 'Cobertura positiva',
  neutra: 'Cobertura neutra',
  negativa: 'Cobertura negativa',
  mixta: 'Cobertura mixta',
}

// Ámbito de la noticia (no del medio): un medio regional puede publicar una
// noticia nacional y un medio extranjero una noticia chilena.
const ETIQUETAS_AMBITO = {
  nacional: 'Nacional',
  regional: 'Regional',
  internacional: 'Internacional',
}

// Ajustes de corte a límite de palabra: un recorte a mitad de palabra
// ("ndo otro, aunque…") se ve descuidado.
function recortarInicioEnPalabra(texto) {
  const idx = texto.indexOf(' ')
  return idx > 0 && idx < 30 ? texto.slice(idx + 1) : texto
}

function recortarFinEnPalabra(texto) {
  const idx = texto.lastIndexOf(' ')
  return idx > 0 && texto.length - idx < 30 ? texto.slice(0, idx) : texto
}

function normalizarComparacion(texto) {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9ñ]/g, '')
}

// Muchos feeds repiten el titular como descripción: en ese caso la bajada no
// aporta nada y se ve como texto duplicado dentro de la tarjeta.
function extractoRedundante(extractoSegmentos, titular) {
  if (!extractoSegmentos?.length || !titular) return false
  const extracto = normalizarComparacion(extractoSegmentos.map((s) => s.texto).join(''))
  const tit = normalizarComparacion(titular)
  if (!extracto || !tit) return false
  if (extracto === tit || tit.startsWith(extracto)) return true
  // Extracto = titular + una cola mínima: también es redundante.
  return extracto.startsWith(tit) && extracto.length - tit.length < 30
}

function truncarExtracto(extractoSegmentos, maxChars = 500) {
  if (!extractoSegmentos?.length) return []

  const textoCompleto = extractoSegmentos.map(s => s.texto).join('')
  if (textoCompleto.length <= maxChars) return extractoSegmentos

  // Buscar la mención resaltada (más probable que sea cerca del inicio o centro)
  let posicionMencion = -1
  for (let i = 0; i < extractoSegmentos.length; i++) {
    if (extractoSegmentos[i].resaltado) {
      posicionMencion = extractoSegmentos.slice(0, i).reduce((sum, s) => sum + s.texto.length, 0)
      break
    }
  }

  // Si no hay mención, truncar desde el inicio
  if (posicionMencion === -1) {
    let count = 0
    const resultado = []
    for (const seg of extractoSegmentos) {
      if (count + seg.texto.length <= maxChars) {
        resultado.push(seg)
        count += seg.texto.length
      } else {
        const textoRestante = maxChars - count
        if (textoRestante > 0) {
          resultado.push({
            ...seg,
            texto: recortarFinEnPalabra(seg.texto.slice(0, textoRestante)) + '…',
          })
        }
        break
      }
    }
    return resultado
  }

  // Centrar la mención en la ventana de 500 caracteres
  const inicioOptimo = Math.max(0, posicionMencion - Math.floor(maxChars * 0.3))
  const finOptimo = inicioOptimo + maxChars

  let count = 0
  const resultado = []
  let encontradoInicio = false

  for (const seg of extractoSegmentos) {
    const lenSeg = seg.texto.length
    const finSeg = count + lenSeg

    // ¿Este segmento entra en la ventana?
    if (finSeg > inicioOptimo && count < finOptimo) {
      if (!encontradoInicio) {
        // Primer segmento: recortar desde inicioOptimo, a límite de palabra y con
        // marcador de corte para que nunca arranque a mitad de palabra.
        const offset = Math.max(0, inicioOptimo - count)
        const textoTrimmed = offset > 0
          ? '…' + recortarInicioEnPalabra(seg.texto.slice(offset))
          : seg.texto
        resultado.push({
          ...seg,
          texto: textoTrimmed,
        })
        encontradoInicio = true
      } else {
        // Segmentos intermedios: agregar completo
        resultado.push(seg)
      }

      // ¿Hemos alcanzado el fin?
      if (finSeg >= finOptimo) {
        const overflow = finSeg - finOptimo
        if (overflow > 0) {
          const ultimoIdx = resultado.length - 1
          const recortado = resultado[ultimoIdx].texto.slice(0, -overflow)
          resultado[ultimoIdx].texto = recortarFinEnPalabra(recortado) + '…'
        }
        break
      }
    }

    count += lenSeg
  }

  return resultado.length > 0 ? resultado : extractoSegmentos.slice(0, 1)
}

// La tarjeta es de SOLO TEXTO, y esa ausencia es la medida.
//
// Hasta ahora había un bloque visual —miniatura enlazada al servidor del medio en la
// portada, imagen mayor en la vista interna, monograma con la inicial cuando faltaba—.
// El departamento legal resolvió que las imágenes de noticias desaparecen de las dos
// superficies, así que se eliminó la cadena entera: el collector ya no extrae el
// og:image, la columna salió de la base y el modelo del backend no tiene el campo.
//
// No reponer un <img> acá. Aunque una noticia llegara con `imagen` (dato de una versión
// vieja, o de un adaptador que alguien reintroduzca), esta tarjeta no debe pintarlo:
// NoticiaItem.test.jsx pasa una noticia CON imagen y afirma que el DOM no contiene
// ningún <img>.
//
// OJO con el alcance: esta tarjeta es el punto de pintado de las vistas de boletín, pero
// NO el único del proyecto. `vistas/Historico.jsx` arma su propia fila con <article> y no
// delega acá, así que tiene su propia guarda en Historico.test.jsx. Cualquier vista nueva
// que pinte noticias sin pasar por este componente necesita la suya.

/**
 * `superficie`: 'publica' | 'interna'. Gobierna qué se pinta, pero NO es el control de
 * acceso: en la superficie pública el backend directamente no envía `extracto` ni
 * `analisis` (ver backend/app/servicios/mapeo.py). Acá solo se evita pintar un hueco.
 */
export default function NoticiaItem({ noticia, superficie = 'interna', marcarHoy = true }) {
  const esPublica = superficie === 'publica'

  const extractoTruncado =
    esPublica || extractoRedundante(noticia.extracto, noticia.titular)
      ? []
      : truncarExtracto(noticia.extracto)

  // El tono es una estimación automática no validada, así que en la portada pública no
  // se muestra en ninguna forma: ni como filete lateral, ni como tooltip.
  const sentimiento = ETIQUETAS_SENTIMIENTO[noticia.analisis?.sentimiento]
    ? noticia.analisis.sentimiento
    : 'neutra'
  const ambito = !esPublica && ETIQUETAS_AMBITO[noticia.analisis?.ambito]

  // La portada abre filtrada en «Hoy», así que la marca NO se pinta ahí: si todas las
  // tarjetas son de hoy, un distintivo que las señale a todas no distingue nada. Sirve al
  // cambiar a «Hoy y ayer» o «Todas», donde la ventana es mixta y arrastra semanas.
  const deHoy = marcarHoy && esHoy(noticia.fecha)

  const clases = [
    'tarjeta',
    esPublica ? 'tarjeta-publica' : `sentimiento-${sentimiento}`,
    deHoy ? 'tarjeta-de-hoy' : '',
  ].join(' ').trim()

  return (
    <article className={clases} title={esPublica ? undefined : ETIQUETAS_SENTIMIENTO[sentimiento]}>
      <div className="tarjeta-cuerpo">
        <div className="tarjeta-meta">
          <span className="chip-medio">{noticia.medioNombre}</span>
          <span className="tarjeta-meta-derecha">
            {/* Texto, no solo color: un distintivo cromático deja fuera a quien no lo
                distingue y desaparece en una proyección.
                Va en el bloque DERECHO, junto a la fecha, y no al lado del medio: puesto
                ahí le robaba espacio al nombre del medio, que se truncaba a "LA TERC…".
                La atribución al medio es lo que no puede degradarse. */}
            {deHoy && <span className="chip-hoy">HOY</span>}
            {ambito && (
              <span className={`chip-ambito ambito-${noticia.analisis.ambito}`}>
                {ETIQUETAS_AMBITO[noticia.analisis.ambito]}
              </span>
            )}
            <span className="tarjeta-fecha">{tiempoRelativo(noticia.fecha)}</span>
          </span>
        </div>
        <a
          className="tarjeta-titular"
          href={noticia.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          {noticia.titular}
        </a>
        {/* El autor se muestra SOLO en la superficie interna.
            Es una decisión con dos fuerzas en tensión: nombrar a quien firma es el
            derecho de paternidad del autor, y omitirlo mientras se muestra su titular no
            es gratuito. Pero un nombre propio en una página abierta a público
            indeterminado es otra cosa que el mismo nombre en una herramienta de trabajo
            de SECOM. Se resolvió a favor de no exponerlo en la portada pública.
            El dato sigue almacenado: lo necesitan el registro de retiros y el endpoint de
            derechos del titular. Nunca se filtra ni se agrega por él. */}
        {!esPublica && noticia.autor && <p className="tarjeta-autor">Por {noticia.autor}</p>}
        {extractoTruncado.length > 0 && (
          <p className="tarjeta-extracto">
            {extractoTruncado.map((segmento, indice) =>
              segmento.resaltado ? (
                <mark key={indice}>{segmento.texto}</mark>
              ) : (
                <span key={indice}>{segmento.texto}</span>
              ),
            )}
          </p>
        )}
      </div>
    </article>
  )
}
