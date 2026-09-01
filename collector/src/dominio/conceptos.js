// Reglas de los conceptos de búsqueda y exclusión. Puro: sin I/O, sin base de datos.
//
// Desde que un admin los teclea en un formulario, un concepto dejó de ser una
// constante del código y pasó a ser entrada de usuario que termina dentro de un
// RegExp (dominio/menciones.js) y dentro de una URL (adaptadores/fuente-google-news.js).
// Este módulo es el único lugar donde se valida y se normaliza.

export const LARGO_MIN = 3
export const LARGO_MAX = 80
export const MAX_PALABRAS = 8

// Cota superior del patrón que se compila: 100 × 80 caracteres, y cada vocal se
// expande a una clase de 4 (`[aá]`), da ~32 KB de fuente de regex. Medido en
// test/conceptos-limites.test.js, no adivinado.
export const MAX_ACTIVOS_POR_TIPO = 100

// Comillas dobles y tipográficas: fuente-google-news.js arma la consulta como
// `"${concepto}" OR ...`, así que una comilla dentro del texto rompe la sintaxis de
// búsqueda y tumba la red de seguridad de cobertura — con un [FALLO] que no tiene
// ninguna relación visible con lo que el admin tecleó en otra pantalla.
const COMILLAS = /["“”«»]/u

const ALFANUMERICO = /[\p{L}\p{N}]/u

/** Colapsa espacios internos y recorta. NFC es obligatorio, no cosmético. */
export function normalizarConcepto(texto) {
  // .normalize('NFC') primero: un texto pegado desde Word o macOS puede venir en NFD
  // ('á' = 'a' + U+0301). VARIANTES de menciones.js está indexado por caracteres
  // PRECOMPUESTOS, así que un concepto en NFD produce un patrón que no matchea nunca
  // y el concepto rinde CERO noticias en silencio, sin ningún error.
  return String(texto ?? '')
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Forma plegada para deduplicar. Espejo JS de conceptos.texto_normalizado (db/schema.sql). */
export function plegarConcepto(texto) {
  return normalizarConcepto(texto)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/gu, '') // marcas diacríticas combinantes
}

export function esConceptoValido(texto) {
  const limpio = normalizarConcepto(texto)
  if (limpio.length < LARGO_MIN || limpio.length > LARGO_MAX) return false
  if (limpio.split(' ').length > MAX_PALABRAS) return false
  if (COMILLAS.test(limpio)) return false
  // Sin esto, un concepto como '...' sobrevive al escapado de menciones.js y se
  // convierte en una alternativa literal con límites de palabra: ruido puro.
  if (!ALFANUMERICO.test(limpio)) return false
  return true
}

/**
 * Ordena para la ALTERNANCIA del regex: de más largo a más corto.
 *
 * No es cosmético. Cuando un concepto es PREFIJO de otro y ambos empiezan en la misma
 * posición, la alternancia de JS es leftmost-FIRST (no longest-match como POSIX), así
 * que gana el que aparezca antes en el patrón. Verificado:
 *   ['Parque', 'Parque Nacional'] sobre 'el Parque Nacional Torres del Paine'
 *      -> resalta solo "Parque"
 *   ['Parque Nacional', 'Parque'] -> resalta "Parque Nacional"
 * Ordenar por largo hace que el resaltado sea independiente del orden de inserción.
 */
function porLargoDescendente(a, b) {
  if (b.length !== a.length) return b.length - a.length
  return a < b ? -1 : a > b ? 1 : 0
}

/**
 * Sanea las filas de la base a las dos listas que consume main.js.
 *
 * filas: Array<{ texto: string, tipo: 'incluir' | 'excluir' }>
 * -> { incluir, excluir, incluirPorPrioridad, descartados }
 *
 * Se devuelven DOS órdenes del mismo conjunto, y mezclarlos es un error real:
 *   - `incluir` / `excluir`: por largo descendente, para la alternancia del regex.
 *   - `incluirPorPrioridad`: orden de llegada (la consulta los trae por creado_en,
 *     id: la semilla primero), para recortar la consulta de Google News.
 * Recortar por largo sacaría 'CONAF' (5 caracteres) antes que cualquier nombre de
 * parque — o sea, justo el concepto más importante.
 *
 * El truncado por MAX_ACTIVOS_POR_TIPO también respeta el orden de llegada, por la
 * misma razón: recortar por largo dejaría el detector sin 'CONAF'.
 */
export function sanearConceptos(filas, limites = {}) {
  const maxPorTipo = limites.maxActivosPorTipo ?? MAX_ACTIVOS_POR_TIPO
  const grupos = { incluir: [], excluir: [] }
  const vistos = new Set()
  let descartados = 0

  for (const fila of filas ?? []) {
    const tipo = fila?.tipo === 'excluir' ? 'excluir' : 'incluir'
    const texto = normalizarConcepto(fila?.texto)
    if (!esConceptoValido(texto)) {
      descartados += 1
      continue
    }
    // Dedup GLOBAL, no por tipo: espejo del índice único de db/schema.sql.
    const plegado = plegarConcepto(texto)
    if (vistos.has(plegado)) {
      descartados += 1
      continue
    }
    vistos.add(plegado)
    if (grupos[tipo].length >= maxPorTipo) {
      descartados += 1
      continue
    }
    grupos[tipo].push(texto)
  }

  return {
    incluir: [...grupos.incluir].sort(porLargoDescendente),
    excluir: [...grupos.excluir].sort(porLargoDescendente),
    // Copia sin ordenar: conserva el orden de creación para acotarConsulta().
    incluirPorPrioridad: [...grupos.incluir],
    descartados,
  }
}

/**
 * Recorta la lista que va a la consulta de Google News por presupuesto de caracteres.
 *
 * fuente-google-news.js arma `"a" OR "b" OR ...` y lo mete en un query string. Con
 * ~100 conceptos la URL codificada supera el límite de facto de ~2 KB que aplican
 * muchos intermediarios: Google respondería 4xx y se caería la red de seguridad de
 * cobertura — un fallo silencioso provocado por una acción del admin en otra pantalla.
 *
 * `prioridad` conserva el ORDEN DE ENTRADA, que es el de creación (semilla primero).
 * Deliberadamente NO se usa el largo: los conceptos más cortos son los más
 * importantes ('CONAF', 'CMPC') y serían los primeros en caer.
 */
export function acotarConsulta(conceptos, maxCaracteres) {
  const resultado = []
  let largo = 0
  for (const concepto of conceptos ?? []) {
    // '"x"' más ' OR ' entre términos.
    const costo = concepto.length + 2 + (resultado.length > 0 ? 4 : 0)
    if (resultado.length > 0 && largo + costo > maxCaracteres) break
    resultado.push(concepto)
    largo += costo
  }
  return resultado
}
