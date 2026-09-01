// Atribución por concepto: QUÉ concepto de búsqueda hizo entrar cada noticia.
//
// Espejo deliberado de exclusiones.js, que ya resolvía el problema simétrico ("qué
// concepto la ocultó"). Hasta ahora el detector era una sola alternancia regex y
// devolvía un booleano: servía para decidir si la noticia entraba, pero no para saber
// por cuál de los siete conceptos, así que agrupar el boletín por concepto era imposible.
//
// Igual que las exclusiones, esto se RECALCULA sobre la ventana completa en cada corrida
// y se evalúa siempre contra campos PERSISTIDOS (titular + extracto, ver textoDeFiltro).
// Por eso renombrar, reordenar o agregar un concepto reagrupa el boletín en la corrida
// siguiente sin volver a pedir nada a los medios, y por eso el resultado es estable entre
// corridas en vez de oscilar.

import { construirDetector } from './menciones.js'
import { textoDeFiltro } from './exclusiones.js'

/**
 * Texto contra el que se atribuye el concepto: titular + extracto + LA URL.
 *
 * La URL entra porque el slug de una nota casi siempre repite su titular
 * ("…/conaf-extiende-el-cierre-preventivo-de-las-areas-protegidas"), y es la única señal
 * disponible cuando el extracto viene vacío —lo que ocurre con los ítems que entran por la
 * búsqueda de Google, que no entrega cuerpo—. Sin ella, esas noticias quedaban sin
 * concepto y había que inventarles un bloque "Otras menciones" en el boletín.
 *
 * Los guiones del slug se convierten en espacios: el detector exige límites de palabra, y
 * "conaf-extiende" no casaría con «CONAF» tal cual.
 *
 * Sigue evaluándose SOLO contra campos persistidos, que es lo que hace estable la
 * reevaluación horaria (ver el comentario de textoDeFiltro en exclusiones.js).
 */
export function textoDeAtribucion(noticia) {
  const desdeUrl = String(noticia?.url ?? '')
    .replace(/^https?:\/\/[^/]+/i, '') // el dominio no es contenido: "conaf.cl" no cuenta
    .replace(/[-_/+.]/g, ' ')
  return `${textoDeFiltro(noticia)}\n${desdeUrl}`
}

/**
 * Un detector POR concepto (no una alternancia única), en el ORDEN de presentación que
 * define el admin. Ese orden es el que decide cuál es el concepto principal.
 *
 * @param {string[]} conceptosOrdenados ya ordenados por `conceptos.orden`
 */
export function construirEvaluadorInclusion(conceptosOrdenados = []) {
  const vistos = new Set()
  const detectores = []

  for (const bruto of conceptosOrdenados ?? []) {
    const concepto = String(bruto ?? '').trim()
    if (!concepto || vistos.has(concepto)) continue
    vistos.add(concepto)
    try {
      detectores.push({ concepto, detector: construirDetector([concepto]) })
    } catch {
      // Concepto que no produce patrón (solo puntuación): se ignora en vez de tumbar la
      // corrida, igual que en construirEvaluadorExclusion.
    }
  }

  return {
    conceptos: detectores.map(({ concepto }) => concepto),

    /**
     * @returns {string[]} conceptos detectados EN ORDEN DE PRIORIDAD (el primero es el
     *   principal). No se ordena alfabéticamente: el orden es la información.
     */
    evaluar(texto) {
      if (detectores.length === 0) return []
      return detectores
        .filter(({ detector }) => detector.detecta(texto))
        .map(({ concepto }) => concepto)
    },
  }
}

/**
 * Marca la ventana completa. Muta en sitio, como marcarExclusiones.
 *
 * Una noticia sin ningún concepto detectado queda con `conceptoPrincipal: null`, y eso es
 * un DEFECTO, no una categoría: el boletín se organiza por concepto y no existe un bloque
 * "otras". Toda noticia entró por algún concepto; si el sistema no puede decir cuál, el
 * problema es de atribución y hay que verlo, no acomodarlo con un cajón de sastre.
 *
 * `sinConcepto` es el contador de ese defecto y sale en el resumen de la corrida.
 */
export function marcarConceptos(noticias, evaluador) {
  const porConcepto = new Map(evaluador.conceptos.map((concepto) => [concepto, 0]))
  let sinConcepto = 0

  for (const noticia of noticias ?? []) {
    const detectados = evaluador.evaluar(textoDeAtribucion(noticia))
    noticia.conceptosDetectados = detectados
    noticia.conceptoPrincipal = detectados[0] ?? null
    if (detectados.length === 0) sinConcepto += 1
    for (const concepto of detectados) {
      porConcepto.set(concepto, (porConcepto.get(concepto) ?? 0) + 1)
    }
  }

  return { total: (noticias ?? []).length, sinConcepto, porConcepto }
}

/** Líneas [OK]/[FALLO] para lineasResumen. */
export function resumenDeInclusiones(resultado) {
  const lineas = []
  for (const [concepto, cantidad] of resultado.porConcepto) {
    lineas.push(`[OK] Concepto «${concepto}»: ${cantidad} noticias en la ventana`)
  }
  if (resultado.sinConcepto > 0) {
    // [FALLO] y no [OK]: el boletín se organiza por concepto y no tiene bloque "otras",
    // así que una noticia sin atribuir NO SE MUESTRA. Es pérdida de cobertura silenciosa
    // —el error que SECOM declaró inaceptable— y tiene que subir `pasos_fallidos`.
    lineas.push(
      `[FALLO] Sin concepto identificado: ${resultado.sinConcepto}/${resultado.total} ` +
        'noticias no se pudieron atribuir y NO aparecerán en el boletín',
    )
  }
  return lineas
}
