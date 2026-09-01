import { useMemo, useState } from 'react'
import { useDatos } from '../contexto/ProveedorDatos.jsx'
import { useSesion } from '../contexto/ProveedorSesion.jsx'
import BoletinContratado from '../componentes/BoletinContratado.jsx'
import Seccion from '../componentes/Seccion.jsx'
import { esHoy, esHoyOAyer } from '../utilidades/fechas.js'

const MENSAJES_VACIO = {
  todas: 'Aún no hay noticias con menciones en la ventana actual.',
  hoy: 'Todavía no entran noticias hoy. Pruebe con «Hoy y ayer» o «Todas».',
  'hoy-ayer': 'No hay noticias de hoy ni de ayer. Pruebe con «Todas».',
}

/** Ancla estable para un concepto: sin tildes, sin espacios, apta para id de elemento. */
function anclaDe(concepto) {
  return `concepto-${String(concepto)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')}`
}

/**
 * Desplaza hasta el bloque del concepto.
 *
 * No se usa `href="#…"` a secas porque la app va en HashRouter: un ancla con `#` cambiaría
 * la ruta y sacaría al usuario de la portada. Por eso el salto es programático.
 */
function irA(concepto) {
  document.getElementById(anclaDe(concepto))?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

/**
 * Envoltorio comun a los TRES puntos de retorno de la portada.
 *
 * No es simetria estetica. `Portada` retorna temprano cuando el boletin propio esta
 * cargando y cuando falla; un bloque puesto solo en el JSX principal desapareceria
 * justo el dia en que /api/noticias se cae, que es exactamente el dia en que SECOM mas
 * necesita el boletin del servicio contratado. Y el fallo seria invisible en desarrollo,
 * porque en desarrollo el recolector anda.
 *
 * Va a nivel de MODULO y no dentro de Portada(): definido dentro, cada render crearia un
 * tipo de componente nuevo y React desmontaria y volveria a montar BoletinContratado, que
 * pediria el enlace en cada render.
 */
function MarcoPortada({ children }) {
  return (
    <div className="app">
      <main className="contenido">
        <BoletinContratado />
        {children}
      </main>
    </div>
  )
}

function normalizarTitular(titular) {
  return String(titular ?? '')
    .replace(/\[.*?\]/g, '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9ñ]/g, '')
}

// La misma historia suele llegar por dos vías (dos medios del mismo grupo, o el
// feed curado + Google News). Mostrar titulares idénticos lado a lado es uno de
// los errores declarados inaceptables por SECOM: se colapsa al más reciente.
function quitarTitularesDuplicados(lista) {
  const elegidoPorTitular = new Map()
  for (const noticia of lista) {
    const clave = normalizarTitular(noticia.titular)
    if (!clave) continue
    const previo = elegidoPorTitular.get(clave)
    if (!previo || new Date(noticia.fecha) > new Date(previo.fecha)) {
      elegidoPorTitular.set(clave, noticia)
    }
  }
  const elegidos = new Set(elegidoPorTitular.values())
  return lista.filter((noticia) => !normalizarTitular(noticia.titular) || elegidos.has(noticia))
}

export default function Portada() {
  const { noticias, secciones, conceptos, cargando, error } = useDatos()
  const { fase } = useSesion()
  // Abre en HOY, no en TODAS. SECOM revisa el boletín a las 08:00 y lo que necesita ver
  // primero es lo del día; la ventana arrastra ~900 noticias de semanas, así que empezar
  // en "Todas" obliga a filtrar cada mañana antes de poder trabajar.
  // Los otros dos períodos siguen a un clic.
  const [periodo, setPeriodo] = useState('hoy')

  // La portada es la ÚNICA vista que se renderiza en las dos superficies: para un
  // anónimo es el boletín público y para un autenticado es la portada interna. El
  // backend ya decide qué campos manda; esto decide qué se pinta con lo que llegó.
  const superficie = fase === 'autenticado' ? 'interna' : 'publica'

  const sinDuplicados = useMemo(
    () => (noticias ? quitarTitularesDuplicados(noticias) : []),
    [noticias],
  )

  const conteos = useMemo(() => ({
    todas: sinDuplicados.length,
    hoy: sinDuplicados.filter((n) => esHoy(n.fecha)).length,
    'hoy-ayer': sinDuplicados.filter((n) => esHoyOAyer(n.fecha)).length,
  }), [sinDuplicados])

  const noticiasFiltradas = useMemo(() => {
    if (periodo === 'hoy') return sinDuplicados.filter((n) => esHoy(n.fecha))
    if (periodo === 'hoy-ayer') return sinDuplicados.filter((n) => esHoyOAyer(n.fecha))
    return sinDuplicados
  }, [sinDuplicados, periodo])

  if (cargando) {
    return (
      <MarcoPortada>
        <p className="estado">Cargando noticias…</p>
      </MarcoPortada>
    )
  }
  if (error) {
    return (
      <MarcoPortada>
        <p className="estado estado-error">
          No se pudieron cargar las noticias: {error}. Intente recargar la página.
        </p>
      </MarcoPortada>
    )
  }

  const seccionesOrdenadas = [...secciones].sort((a, b) => a.orden - b.orden)

  // Nivel 1 de la jerarquía: los bloques salen de la LISTA DE CONCEPTOS configurada en
  // /#/configuracion, en su orden, no de lo que traigan los datos. Con 100 conceptos
  // configurados, el boletín usa esos 100 y ese orden.
  //
  // NO existe un bloque "Otras menciones", y su ausencia es la decisión: una noticia que
  // el sistema no pudo atribuir a ningún concepto es un DEFECTO de atribución, no una
  // categoría del boletín. El collector lo cuenta y lo reporta como [FALLO] en el resumen
  // de la corrida (ver dominio/inclusiones.js); acomodarlo con un cajón de sastre lo
  // volvería invisible.
  //
  // Los conceptos sin noticias no pintan un título huérfano: el backend solo envía los que
  // tienen cobertura en la ventana.
  const bloques = [...conceptos].sort((a, b) => a.orden - b.orden)

  const opciones = [
    { id: 'todas', etiqueta: 'Todas' },
    { id: 'hoy', etiqueta: 'Hoy' },
    { id: 'hoy-ayer', etiqueta: 'Hoy y ayer' },
  ]

  return (
    <MarcoPortada>
      <div className="barra-filtros">
          <div className="filtro-periodo" role="group" aria-label="Filtrar por fecha">
            {opciones.map((opcion) => (
              <button
                key={opcion.id}
                type="button"
                className={`filtro-periodo-boton ${periodo === opcion.id ? 'activo' : ''}`}
                aria-pressed={periodo === opcion.id}
                onClick={() => setPeriodo(opcion.id)}
              >
                {opcion.etiqueta}
                <span className="filtro-periodo-conteo">{conteos[opcion.id]}</span>
              </button>
            ))}
          </div>
          {/* El tono no existe en la portada pública: es una estimación automática no
              validada y atribuirla a la cobertura de un medio identificado excede lo que
              corresponde publicar sin sesión. */}
          {superficie === 'interna' && (
            <div
              className="leyenda-sentimiento"
              title="Tono estimado automáticamente, sin validación humana. El borde izquierdo de cada tarjeta lo indica."
            >
              <span className="leyenda-item"><span className="leyenda-punto positiva" />Positiva</span>
              <span className="leyenda-item"><span className="leyenda-punto neutra" />Neutra</span>
              <span className="leyenda-item"><span className="leyenda-punto negativa" />Negativa</span>
              <span className="leyenda-item"><span className="leyenda-punto mixta" />Mixta</span>
              <span className="leyenda-aviso">estimación automática, no validada</span>
            </div>
          )}
        </div>
        {/* Índice de conceptos: con muchos conceptos configurados, llegar a los de más
            abajo obligaba a recorrer cientos de tarjetas. Cada chip salta a su bloque y
            muestra cuántas noticias tiene, así que también sirve para ver de un vistazo
            dónde hay cobertura y dónde no. Se oculta con un solo concepto: ahí no hay
            nada que navegar. */}
        {bloques.length > 1 && noticiasFiltradas.length > 0 && (
          <nav className="indice-conceptos" aria-label="Ir a un concepto">
            {bloques.map((bloque) => {
              const cuantas = noticiasFiltradas.filter(
                (n) => n.conceptoPrincipal === bloque.texto,
              ).length
              if (cuantas === 0) return null
              return (
                <a key={bloque.texto} className="indice-chip" href={`#/${anclaDe(bloque.texto)}`}
                   onClick={(e) => { e.preventDefault(); irA(bloque.texto) }}>
                  {bloque.texto}
                  <span className="indice-cuenta">{cuantas}</span>
                </a>
              )
            })}
          </nav>
        )}

        {noticiasFiltradas.length === 0 ? (
          <p className="estado">{MENSAJES_VACIO[periodo]}</p>
        ) : (
          bloques.map((bloque) => {
            const delConcepto = noticiasFiltradas.filter(
              (noticia) => noticia.conceptoPrincipal === bloque.texto,
            )
            if (delConcepto.length === 0) return null
            return (
              <section
                key={bloque.texto}
                id={anclaDe(bloque.texto)}
                className="bloque-concepto"
                aria-label={`Menciones de ${bloque.texto}`}
              >
                {/* Solo se rotula el concepto cuando hay más de uno: con un único
                    concepto de búsqueda, un encabezado «CONAF» sobre todo el boletín es
                    ruido, y el boletín antiguo tampoco lo tenía. */}
                {bloques.length > 1 && <h2 className="titulo-concepto">{bloque.texto}</h2>}
                {seccionesOrdenadas.map((seccion) => (
                  <Seccion
                    key={seccion.id}
                    seccion={seccion}
                    noticias={delConcepto.filter((noticia) => noticia.seccionId === seccion.id)}
                    superficie={superficie}
                    // Con el filtro «Hoy» activo, TODAS las tarjetas serían de hoy: la
                    // marca dejaría de distinguir nada y sería ruido repetido 900 veces.
                    // Solo sirve cuando se mira una ventana mixta.
                    marcarHoy={periodo !== 'hoy'}
                  />
                ))}
              </section>
            )
          })
        )}
    </MarcoPortada>
  )
}
