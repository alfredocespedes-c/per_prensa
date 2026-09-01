// Detección de menciones de conceptos en texto plano.
// Regla fijada en docs/REQUISITOS.md (pregunta 7, supuesto de trabajo):
// insensible a mayúsculas y tildes, con límites de palabra Unicode —
// "CONAFE" o "CONAFé" NO son menciones de "CONAF".

// \b de JavaScript es solo-ASCII: con tildes da límites falsos. Se usan
// lookarounds con clases Unicode, soportados por Node >= 22.
const SIN_LETRA_ANTES = '(?<![\\p{L}\\p{N}])'
const SIN_LETRA_DESPUES = '(?![\\p{L}\\p{N}])'

// Cada vocal (con o sin tilde en el concepto) acepta ambas formas en el texto.
const VARIANTES = {
  a: '[aá]', e: '[eé]', i: '[ií]', o: '[oó]', u: '[uúü]',
  á: '[aá]', é: '[eé]', í: '[ií]', ó: '[oó]', ú: '[uúü]', ü: '[uúü]',
  ñ: '[nñ]',
}

function escaparRegex(texto) {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function patronDeConcepto(concepto) {
  const limpio = escaparRegex(concepto.trim().replace(/\s+/g, ' '))
  let patron = ''
  for (const caracter of limpio) {
    if (caracter === ' ') {
      patron += '\\s+'
      continue
    }
    patron += VARIANTES[caracter.toLowerCase()] ?? caracter
  }
  return patron
}

export function construirDetector(conceptos) {
  if (!Array.isArray(conceptos) || conceptos.length === 0) {
    throw new Error('Se requiere al menos un concepto de búsqueda')
  }
  // Un concepto vacío o de solo espacios produce una alternativa VACÍA: el patrón
  // `(?<!\p{L}\p{N})(?:)(?!\p{L}\p{N})` casa la cadena vacía dondequiera que haya dos
  // no-alfanuméricos adyacentes, así que detecta() devuelve true para casi cualquier
  // texto con puntuación y el boletín se llena de ruido (error inaceptable de SECOM).
  // Antes era latente porque la lista era un archivo fuente; ahora la teclea un admin
  // en un formulario y un campo en blanco basta.
  const patrones = conceptos
    .filter((concepto) => typeof concepto === 'string')
    .map(patronDeConcepto)
    .filter((patron) => patron.length > 0)
  if (patrones.length === 0) {
    throw new Error('Se requiere al menos un concepto de búsqueda no vacío')
  }
  const alternativas = patrones.join('|')
  const fuente = `${SIN_LETRA_ANTES}(?:${alternativas})${SIN_LETRA_DESPUES}`
  const regexPrueba = new RegExp(fuente, 'iu')

  return {
    detecta(texto) {
      return typeof texto === 'string' && regexPrueba.test(texto)
    },

    // Devuelve el extracto como segmentos [{texto, resaltado}] centrado en la
    // primera mención, o null si el texto no menciona ningún concepto.
    // Una mención jamás queda cortada por el borde del extracto.
    extraerExtracto(texto, largoMax = 280) {
      if (typeof texto !== 'string' || texto.length === 0) return null
      const menciones = [...texto.matchAll(new RegExp(fuente, 'giu'))]
      if (menciones.length === 0) return null

      const primera = menciones[0]
      const holgura = Math.max(0, largoMax - primera[0].length)
      let inicio = Math.max(
        0,
        Math.min(primera.index - Math.floor(holgura / 2), texto.length - largoMax),
      )
      let fin = Math.min(texto.length, inicio + largoMax)

      // No cortar palabras en los bordes (sin invadir la primera mención).
      if (inicio > 0) {
        const espacio = texto.indexOf(' ', inicio)
        if (espacio !== -1 && espacio < primera.index) inicio = espacio + 1
      }
      if (fin < texto.length) {
        const espacio = texto.lastIndexOf(' ', fin)
        if (espacio > primera.index + primera[0].length) fin = espacio
      }

      // Menciones parcialmente fuera de la ventana: se excluyen completas.
      for (const mencion of menciones) {
        const desde = mencion.index
        const hasta = mencion.index + mencion[0].length
        if (desde < inicio && hasta > inicio) inicio = hasta
        if (desde < fin && hasta > fin) fin = desde
      }

      const segmentos = []
      let cursor = inicio
      for (const mencion of menciones) {
        const desde = mencion.index
        const hasta = mencion.index + mencion[0].length
        if (desde < inicio || hasta > fin) continue
        if (desde > cursor) segmentos.push({ texto: texto.slice(cursor, desde), resaltado: false })
        segmentos.push({ texto: mencion[0], resaltado: true })
        cursor = hasta
      }
      if (cursor < fin) segmentos.push({ texto: texto.slice(cursor, fin), resaltado: false })

      // Marcas de recorte, como el boletín antiguo.
      if (inicio > 0) segmentos.unshift({ texto: '(...) ', resaltado: false })
      if (fin < texto.length) segmentos.push({ texto: ' (...)', resaltado: false })
      return segmentos
    },
  }
}

// Recorte simple para textos sin mención (fallback cuando la mención está solo
// en el titular): corta en límite de palabra y marca la continuación.
export function recortarTexto(texto, largoMax = 280) {
  if (typeof texto !== 'string') return ''
  const limpio = texto.trim()
  if (limpio.length <= largoMax) return limpio
  const espacio = limpio.lastIndexOf(' ', largoMax)
  return `${limpio.slice(0, espacio > 0 ? espacio : largoMax)} (...)`
}
