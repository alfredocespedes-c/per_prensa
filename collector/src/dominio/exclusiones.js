// Exclusión por MARCADO SUAVE: una noticia que menciona un concepto excluido se
// marca y se oculta, pero NUNCA se borra. Al quitar el concepto, reaparece.
//
// Puro: sin I/O. La reversibilidad no se logra guardando una decisión, sino
// RECALCULANDO el flag sobre toda la ventana en cada corrida (ver main.js). Si el
// admin borra un concepto, la noticia se desmarca sola en la corrida siguiente.

import { construirDetector } from './menciones.js'

/**
 * Texto contra el que se evalúa la exclusión: SIEMPRE titular + extracto.
 *
 * Nunca el cuerpo descargado, y esto es lo que hace que todo lo demás funcione. El
 * cuerpo solo existe en la corrida en que se bajó (crearNoticia no lo persiste): si
 * una noticia nueva se evaluara contra el cuerpo completo y en la corrida siguiente
 * contra el extracto, el flag OSCILARÍA entre corridas — noticias apareciendo y
 * desapareciendo solas, y `generadoEn` moviéndose cada hora sin motivo. Evaluar
 * siempre contra campos persistidos hace la función pura sobre el estado guardado:
 * f(estado, conceptos) da el mismo resultado N veces.
 *
 * Mismo criterio que el re-enriquecimiento sin red de main.js.
 *
 * Limitación conocida y conservadora: armarExtracto centra la ventana del extracto en
 * la primera mención de un concepto INCLUIDO, así que un concepto excluido que solo
 * aparezca fuera de esa ventana no se detecta. Es un falso negativo — muestra de más,
 * nunca de menos — que es la dirección correcta frente a "perder una noticia de un
 * medio grande".
 */
export function textoDeFiltro(noticia) {
  const extracto = Array.isArray(noticia?.extracto)
    ? noticia.extracto.map((segmento) => segmento?.texto ?? '').join('')
    : ''
  return `${noticia?.titular ?? ''}\n${extracto}`
}

/**
 * Un detector POR concepto, no una alternancia única: hace falta saber CUÁL matcheó
 * para poder mostrárselo al admin y para poder revertir sobre el archivo sin
 * re-evaluar texto.
 *
 * Con N conceptos y 1000 noticias son N×1000 tests de regex sobre ~3 KB: milisegundos.
 */
export function construirEvaluadorExclusion(conceptosExcluidos = []) {
  const limpios = [
    ...new Set(
      (conceptosExcluidos ?? [])
        .map((concepto) => String(concepto ?? '').trim())
        .filter((concepto) => concepto.length > 0),
    ),
  ].sort() // orden estable => `excluidaPor` determinista => JSON estable

  // Un concepto que no produzca patrón (solo puntuación) haría lanzar a
  // construirDetector; se descarta acá para que el evaluador nunca falle.
  const detectores = []
  for (const concepto of limpios) {
    try {
      detectores.push({ concepto, detector: construirDetector([concepto]) })
    } catch {
      // Concepto inválido que llegó igual: se ignora en vez de tumbar la corrida.
    }
  }

  return {
    conceptos: detectores.map(({ concepto }) => concepto),

    /** -> string[] ordenado alfabéticamente, sin repetidos */
    evaluar(texto) {
      if (detectores.length === 0) return []
      return detectores
        .filter(({ detector }) => detector.detecta(texto))
        .map(({ concepto }) => concepto)
    },
  }
}

/**
 * Marca la ventana completa. Muta en sitio (igual que la reclasificación y el
 * re-enriquecimiento de main.js) y devuelve el resumen para auditoría.
 *
 * Los campos SIEMPRE se asignan, nunca se borran con `delete`: JSON.stringify respeta
 * el orden de inserción, así que una previa cargada del estado conserva su orden de
 * claves entre corridas y la serialización queda estable.
 */
export function marcarExclusiones(noticias, evaluador) {
  const porConcepto = new Map(evaluador.conceptos.map((concepto) => [concepto, 0]))
  let ocultas = 0
  let cambiadas = 0

  for (const noticia of noticias ?? []) {
    const motivos = evaluador.evaluar(textoDeFiltro(noticia))
    const antes = (Array.isArray(noticia.excluidaPor) ? noticia.excluidaPor : []).join('|')
    if (antes !== motivos.join('|') || (noticia.excluida === true) !== (motivos.length > 0)) {
      cambiadas += 1
    }
    noticia.excluida = motivos.length > 0
    noticia.excluidaPor = motivos
    if (motivos.length > 0) ocultas += 1
    for (const motivo of motivos) porConcepto.set(motivo, (porConcepto.get(motivo) ?? 0) + 1)
  }

  const total = (noticias ?? []).length
  return { total, ocultas, visibles: total - ocultas, cambiadas, porConcepto }
}

/** Líneas [OK]/[FALLO] para lineasResumen (se persisten en colecta_ejecuciones.resumen). */
export function resumenDeExclusiones(resultado, evaluador) {
  const lineas = [
    `[OK] Exclusiones: ${resultado.ocultas}/${resultado.total} ocultas, ` +
      `${resultado.visibles} visibles (${evaluador.conceptos.length} conceptos)`,
  ]
  const porConcepto = [...resultado.porConcepto].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  for (const [concepto, cantidad] of porConcepto) {
    // Un concepto excluido que no oculta nada es inofensivo O está mal escrito, y en
    // ambos casos el admin quiere enterarse.
    lineas.push(
      `[OK] Exclusión «${concepto}»: oculta ${cantidad}${cantidad === 0 ? ' — ¿mal escrito?' : ''}`,
    )
  }
  if (resultado.total > 0 && resultado.ocultas / resultado.total > 0.5) {
    // Canal de alarma que ya existe: sube pasos_fallidos sin hacer fallar la corrida
    // (`exito` se calcula aparte, a partir de las fuentes).
    lineas.push(
      `[FALLO] Exclusiones ocultan el ${Math.round((100 * resultado.ocultas) / resultado.total)}% de la ventana`,
    )
  }
  return lineas
}
