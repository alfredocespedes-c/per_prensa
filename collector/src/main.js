// Composición (arquitectura hexagonal): el único archivo que une dominio,
// puertos, adaptadores y configuración. Para la v2 con base de datos basta
// cambiar aquí el adaptador de repositorio.
//
// Uso: node src/main.js [--entrada ruta.json] [--salida ruta.json]
// (por defecto lee y escribe ./datos/noticias.json)

import { parseArgs } from 'node:util'
import { pathToFileURL } from 'node:url'
import { crearArchivadorPostgres } from './adaptadores/archivador-postgres.js'
import { crearClienteHttp } from './adaptadores/cliente-http.js'
import { crearPoliticaRobots } from './adaptadores/politica-robots.js'
import { crearExtractorContenido } from './adaptadores/extractor-contenido.js'
import { crearFuenteGoogleNews } from './adaptadores/fuente-google-news.js'
import { crearFuenteRss } from './adaptadores/fuente-rss.js'
import { crearFuenteSitemapNews } from './adaptadores/fuente-sitemap-news.js'
import { crearRepositorioConceptosPostgres } from './adaptadores/repositorio-conceptos-postgres.js'
import { crearRepositorioRetirosPostgres } from './adaptadores/repositorio-retiros-postgres.js'
import { crearRepositorioJson } from './adaptadores/repositorio-json.js'
import { crearResolutorGoogleNews } from './adaptadores/resolver-google-news.js'
import { mapaConLimite } from './adaptadores/util-concurrencia.js'
import { CONCEPTOS } from './config/conceptos.js'
import { MEDIOS, MEDIOS_SITEMAP } from './config/medios.js'
import { acotarConsulta } from './dominio/conceptos.js'
import {
  CONCEPTOS_DESDE_BD,
  CRAWL_DELAY_MAXIMO_MS,
  CRAWL_DELAY_POR_DEFECTO_MS,
  DOMINIOS_EXCLUIDOS,
  ENRIQUECIMIENTO_ACTIVO,
  GOOGLE_NEWS_ACTIVO,
  GOOGLE_NEWS_MAX_LARGO_CONSULTA,
  GOOGLE_NEWS_PARAMS,
  HISTORICO_MAX_DIAS,
  LARGO_EXTRACTO,
  MAX_DESCARGAS_POR_CORRIDA,
  MAX_DESCARGAS_SITEMAP_POR_CORRIDA,
  MAX_RESOLUCIONES_POR_CORRIDA,
  POSTGRES_ACTIVO,
  RETENCION_EJECUCIONES_DIAS,
  RETENCION_EXTRACTO_DIAS,
  RETENCION_METADATOS_DIAS,
  ROBOTS_ACTIVO,
  ROBOTS_EXENTOS,
  ROBOTS_TTL_HORAS,
  SITEMAP_ACTIVO,
  TAMANO_VENTANA,
  TIMEOUT_FEED_MS,
  UMBRAL_DUPLICADO,
  UMBRAL_EVENTO,
  USER_AGENT,
  VENTANA_EVENTO_DIAS,
  VERSION_ANALISIS,
} from './config/parametros.js'
import { actualizarHistorico } from './dominio/historico.js'
import { esDominioExtranjero } from './dominio/ambito.js'
import { asignarEventos } from './dominio/eventos.js'
import {
  construirEvaluadorExclusion,
  marcarExclusiones,
  resumenDeExclusiones,
} from './dominio/exclusiones.js'
import {
  construirEvaluadorInclusion,
  marcarConceptos,
  resumenDeInclusiones,
} from './dominio/inclusiones.js'
import { construirDetector, recortarTexto } from './dominio/menciones.js'
import { crearNoticia, limpiarCamposObsoletos } from './dominio/noticia.js'
import { aplicarRetencionEnVentana, calcularCortes } from './dominio/retencion.js'
import { construirFiltroDeRetiros, quitarRetiradas } from './dominio/retiros.js'
import { enriquecerNoticia } from './dominio/enriquecimiento.js'
import { SECCIONES, validarTipoDeMedio } from './dominio/secciones.js'
import { fusionar } from './dominio/ventana.js'

function dominioDe(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

// Credenciales de Postgres desde el entorno. Un solo lugar: lo usan el repositorio de
// conceptos (al principio de la corrida) y el archivador (al final).
function configPostgresDesdeEnv() {
  return {
    host: process.env.DATABASE_HOST,
    port: Number(process.env.DATABASE_PORT ?? 5432),
    database: process.env.DATABASE_NAME,
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
  }
}

export async function main() {
  const inicioMs = Date.now()
  const { values } = parseArgs({
    options: {
      entrada: { type: 'string' },
      salida: { type: 'string' },
      historico: { type: 'string' },
    },
  })
  const rutaEntrada = values.entrada ?? './datos/noticias.json'
  const rutaSalida = values.salida ?? rutaEntrada
  const rutaHistorico = values.historico ?? './datos/historico.json'

  for (const medio of MEDIOS) validarTipoDeMedio(medio.tipo)
  for (const medio of MEDIOS_SITEMAP) validarTipoDeMedio(medio.tipo)

  // `lineasResumen` se declara acá arriba (y no junto a `nuevas`, más abajo) porque el
  // bloque de conceptos ya necesita reportar en él.
  const lineasResumen = []

  const repositorio = crearRepositorioJson(rutaEntrada, rutaSalida)
  const repositorioHistorico = crearRepositorioJson(rutaHistorico, rutaHistorico, { compacto: true })

  const estadoPrevio = await repositorio.cargar()
  const previas = estadoPrevio?.noticias ?? []
  // Se congela la serialización de las previas ANTES de que nadie las mute.
  // `previas` es la MISMA referencia de array que estadoPrevio.noticias, y deduplicar()
  // empuja las mismas referencias de objeto a la ventana fusionada. Como varios pasos
  // mutan en sitio (reclasificación, re-enriquecimiento, eventId y ahora el marcado de
  // exclusión), comparar estadoPrevio.noticias contra noticias al final compararía
  // ambos lados YA mutados: siempre iguales. `generadoEn` se quedaría congelado y la
  // cabecera mostraría una hora vieja justo en la corrida en que el boletín cambió.
  const previasSerializadas = JSON.stringify(estadoPrevio?.noticias ?? null)

  // --- Política de rastreo y cliente HTTP único ---
  // TODO lo que sale a la red pasa por acá. La política se construye con la caché
  // persistida del estado para no re-pedir el robots.txt de 60 dominios cada hora.
  const politicaRobots = ROBOTS_ACTIVO
    ? crearPoliticaRobots({
        userAgent: USER_AGENT,
        ttlHoras: ROBOTS_TTL_HORAS,
        crawlDelayPorDefectoMs: CRAWL_DELAY_POR_DEFECTO_MS,
        crawlDelayMaximoMs: CRAWL_DELAY_MAXIMO_MS,
        cachePrevia: estadoPrevio?.robotsCache ?? {},
        exentos: ROBOTS_EXENTOS,
      })
    : null
  const clienteHttp = crearClienteHttp({
    politica: politicaRobots,
    userAgent: USER_AGENT,
    timeoutMs: TIMEOUT_FEED_MS,
  })

  const fuenteRss = crearFuenteRss({
    timeoutMs: TIMEOUT_FEED_MS,
    userAgent: USER_AGENT,
    cliente: clienteHttp,
  })

  // UNA sola instancia del extractor para toda la corrida. Antes había dos —una para la
  // fuente sitemap y otra para el enriquecimiento— con argumentos idénticos; unificarlas
  // permite que el contador de muros de pago sea uno solo y salga entero en el resumen.
  const extractor = crearExtractorContenido({
    timeoutMs: 15000,
    userAgent: USER_AGENT,
    cliente: clienteHttp,
  })

  // --- Conceptos: la base manda, config/conceptos.js es semilla y red de seguridad ---
  // Fail-open con el mismo espíritu que el sumidero Postgres del final: un problema de
  // base de datos NUNCA debe dejar sin boletín a las 8:00.
  let conceptosIncluir = CONCEPTOS
  // Fallback de los EXCLUIDOS: la última lista efectivamente aplicada, persistida en
  // el estado (hermana de resolucionesGoogle). Nunca lista vacía: un hipo de red
  // des-ocultaría toda la ventana por una hora y movería `generadoEn`.
  let conceptosExcluir = estadoPrevio?.conceptosExcluidos ?? []
  let conceptosPorPrioridad = CONCEPTOS
  if (CONCEPTOS_DESDE_BD) {
    let repoConceptos = null
    try {
      // El constructor va DENTRO del try: si falla (config inválida), su excepción
      // escaparía a main().catch y mataría la corrida sin escribir el JSON.
      repoConceptos = crearRepositorioConceptosPostgres(configPostgresDesdeEnv())
      const { incluir, excluir, incluirPorPrioridad, descartados } = await repoConceptos.obtener()
      if (incluir.length > 0) {
        conceptosIncluir = incluir
        conceptosExcluir = excluir
        conceptosPorPrioridad = incluirPorPrioridad
        lineasResumen.push(
          `[OK] Conceptos: ${incluir.length} de búsqueda, ${excluir.length} de exclusión (Postgres` +
            `${descartados ? `, ${descartados} descartados por validación` : ''})`,
        )
      } else {
        // Tabla vaciada a mano: sin conceptos de inclusión no hay boletín posible.
        lineasResumen.push(
          `[FALLO] Conceptos: la tabla no tiene conceptos de búsqueda activos; ` +
            `usando la semilla de config/conceptos.js (${CONCEPTOS.length})`,
        )
      }
    } catch (error) {
      lineasResumen.push(
        `[FALLO] Conceptos: ${error.message}; usando la semilla de config/conceptos.js`,
      )
    } finally {
      // Cerrar el pool YA: nada debe quedar vivo el resto de la corrida.
      if (repoConceptos) await repoConceptos.cerrar().catch(() => {})
    }
  }

  // --- Retiros aplicados: contenido que su dueño pidió que dejemos de tener ---
  // Se lee junto a los conceptos, al principio y con el mismo fail-open. Si la lectura
  // falla se sigue SIN filtro: el backend igual oculta lo retirado en la lectura, así
  // que no hay fuga hacia el público, pero conviene que quede en el resumen.
  let filtroRetiros = construirFiltroDeRetiros([])
  if (POSTGRES_ACTIVO) {
    let repoRetiros = null
    try {
      repoRetiros = crearRepositorioRetirosPostgres(configPostgresDesdeEnv())
      filtroRetiros = construirFiltroDeRetiros(await repoRetiros.obtener())
      if (filtroRetiros.total > 0) {
        lineasResumen.push(`[OK] Retiros: ${filtroRetiros.total} claves aplicadas`)
      }
    } catch (error) {
      lineasResumen.push(`[FALLO] Retiros: ${error.message}; la corrida sigue sin filtro`)
    } finally {
      if (repoRetiros) await repoRetiros.cerrar().catch(() => {})
    }
  }

  let detector
  try {
    detector = construirDetector(conceptosIncluir)
  } catch (error) {
    // Conjunto patológico (regex demasiado grande, todos inválidos): antes de caerse,
    // la semilla. construirDetector es lo único de este archivo que puede lanzar antes
    // de tocar una sola fuente.
    lineasResumen.push(
      `[FALLO] Detector con los conceptos de la base: ${error.message}; usando la semilla`,
    )
    detector = construirDetector(CONCEPTOS)
    conceptosPorPrioridad = CONCEPTOS
  }

  const evaluadorExclusion = construirEvaluadorExclusion(conceptosExcluir)
  const historicoAnterior = await repositorioHistorico.cargar()
  const ahora = new Date().toISOString()

  // Extracto con la mención resaltada: se busca en el cuerpo; si la mención solo
  // está en el titular, se resalta ahí. Sin cuerpo y sin mención en el titular
  // (típico de Google News) se deja vacío para no duplicar el titular.
  const armarExtracto = (item) => {
    const cuerpo = item.texto?.trim() ? item.texto : ''
    const delCuerpo = cuerpo ? detector.extraerExtracto(cuerpo, LARGO_EXTRACTO) : null
    if (delCuerpo) return delCuerpo
    const delTitular = detector.extraerExtracto(item.titular, LARGO_EXTRACTO)
    if (delTitular) return delTitular
    return cuerpo ? [{ texto: recortarTexto(cuerpo, LARGO_EXTRACTO), resaltado: false }] : []
  }
  const armarNoticia = (item, medio) =>
    crearNoticia({
      medio,
      titular: item.titular,
      url: item.url,
      fechaMedio: item.fecha,
      fechaDeteccion: ahora,
      extracto: armarExtracto(item),
    })

  const nuevas = []

  // --- Fuente 1: feeds RSS de los medios curados (links directos) ---
  const resultados = await Promise.allSettled(MEDIOS.map((medio) => fuenteRss.obtener(medio)))
  resultados.forEach((resultado, indice) => {
    const medio = MEDIOS[indice]
    if (resultado.status === 'rejected') {
      lineasResumen.push(`[FALLO] ${medio.nombre}: ${resultado.reason?.message ?? resultado.reason}`)
      return
    }
    let conMencion = 0
    for (const item of resultado.value) {
      // Solo la fuente curada se filtra con nuestro detector (los feeds traen de todo).
      if (!detector.detecta(`${item.titular}\n${item.texto}`)) continue
      const noticia = armarNoticia(item, medio)
      if (noticia) {
        nuevas.push(noticia)
        conMencion += 1
      }
    }
    lineasResumen.push(`[OK] ${medio.nombre}: ${resultado.value.length} ítems, ${conMencion} con mención`)
  })

  // --- Fuente 2: Google News (red de seguridad; ya viene filtrado por la búsqueda) ---
  // Se agrega DESPUÉS de la curada: ante la misma URL, gana la versión curada
  // (mejor extracto y sección real) en la deduplicación.
  // Un medio de la lista curada que llegue por Google (porque su feed propio ya
  // rotó la noticia) se clasifica en SU sección real, no en "Otros medios".
  // Incluye los medios sitemap: una nota de Meganoticias vía Google cae en 'tv'.
  const medioPorDominio = new Map(
    [
      ...MEDIOS.map((medio) => [dominioDe(medio.feedUrl), medio]),
      ...MEDIOS_SITEMAP.map((medio) => [dominioDe(medio.sitemapUrl), medio]),
    ].filter(([dom]) => dom),
  )
  const clasificar = (dom, fuente) => {
    const curado = medioPorDominio.get(dom)
    if (curado) {
      return { medioId: curado.id, medioNombre: curado.nombre, seccionId: curado.tipo }
    }
    // Los medios extranjeros no se mezclan con la prensa chilena no curada.
    return { medioId: dom, medioNombre: fuente, seccionId: esDominioExtranjero(dom) ? 'internacional' : 'otros' }
  }

  // Reclasificación retroactiva sobre "Otros medios": (a) una previa cuyo medio
  // se curó después adopta su medio y sección reales (ej.: CNN Chile → TV);
  // (b) una previa de medio extranjero pasa a "Medios internacionales".
  // Solo se tocan noticias en 'otros': tras la primera pasada queda idempotente.
  let reclasificadas = 0
  for (const noticia of previas) {
    if (noticia.seccionId !== 'otros') continue
    const dominio = dominioDe(noticia.url)
    const curado = medioPorDominio.get(dominio)
    if (curado) {
      // Los medios curados con tipo 'otros' (El Mostrador, etc.) ya están bien.
      if (noticia.medioId === curado.id && noticia.seccionId === curado.tipo) continue
      noticia.medioId = curado.id
      noticia.medioNombre = curado.nombre
      noticia.seccionId = curado.tipo
      reclasificadas += 1
    } else if (esDominioExtranjero(dominio)) {
      noticia.seccionId = 'internacional'
      reclasificadas += 1
    }
  }
  if (reclasificadas > 0) {
    lineasResumen.push(`[OK] Reclasificadas: ${reclasificadas} noticias de "Otros" a su sección real`)
  }

  const cachePrevia = new Map(Object.entries(estadoPrevio?.resolucionesGoogle ?? {}))
  let cacheGoogle = cachePrevia
  if (GOOGLE_NEWS_ACTIVO) {
    try {
      // La consulta se acota por presupuesto de caracteres: con muchos conceptos la
      // URL supera el límite de facto (~2 KB) y Google responde 4xx, cayéndose la red
      // de seguridad de cobertura. Se recorta por orden de creación (la semilla
      // primero), NO por largo: los conceptos cortos ('CONAF', 'CMPC') son los más
      // importantes y serían los primeros en caer.
      const conceptosParaGoogle = acotarConsulta(
        conceptosPorPrioridad,
        GOOGLE_NEWS_MAX_LARGO_CONSULTA,
      )
      if (conceptosParaGoogle.length < conceptosPorPrioridad.length) {
        lineasResumen.push(
          `[OK] Google News: consulta acotada a ${conceptosParaGoogle.length}/${conceptosPorPrioridad.length} conceptos (límite de largo de URL)`,
        )
      }
      const fuenteGoogle = crearFuenteGoogleNews({
        conceptos: conceptosParaGoogle,
        resolutor: crearResolutorGoogleNews({ userAgent: USER_AGENT, cliente: clienteHttp }),
        params: GOOGLE_NEWS_PARAMS,
        maxResoluciones: MAX_RESOLUCIONES_POR_CORRIDA,
        cachePrevia,
        dominiosExcluidos: DOMINIOS_EXCLUIDOS,
        clasificar,
        userAgent: USER_AGENT,
        cliente: clienteHttp,
      })
      const { items, cache } = await fuenteGoogle.obtener()
      cacheGoogle = cache
      let agregadas = 0
      for (const item of items) {
        const medio = { id: item.medioId, nombre: item.medioNombre, tipo: item.seccionId }
        const noticia = armarNoticia(item, medio)
        if (noticia) {
          nuevas.push(noticia)
          agregadas += 1
        }
      }
      lineasResumen.push(`[OK] Google News: ${items.length} resueltas, ${agregadas} agregadas`)
    } catch (error) {
      // Google falló: seguimos con lo curado y conservamos la caché previa.
      lineasResumen.push(`[FALLO] Google News: ${error.message}`)
    }
  }

  // --- Fuente 3: sitemaps de noticias (medios sin RSS) ---
  // Se agrega DESPUÉS de Google: ante la misma URL, la deduplicación de fusionar
  // conserva previas > RSS curado > Google > sitemap. La caché de URLs ya
  // procesadas (sitemapVisto) se persiste en el estado, hermana de resolucionesGoogle.
  const sitemapVistoPrevio = estadoPrevio?.sitemapVisto ?? {}
  const sitemapVisto = {}
  if (SITEMAP_ACTIVO) {
    for (const medio of MEDIOS_SITEMAP) {
      try {
        const fuenteSitemap = crearFuenteSitemapNews({
          extractor,
          cachePrevia: new Set(sitemapVistoPrevio[medio.id] ?? []),
          maxDescargas: MAX_DESCARGAS_SITEMAP_POR_CORRIDA,
          timeoutMs: TIMEOUT_FEED_MS,
          userAgent: USER_AGENT,
          cliente: clienteHttp,
        })
        const { items, cache } = await fuenteSitemap.obtener(medio)
        sitemapVisto[medio.id] = [...cache].sort()
        let conMencion = 0
        for (const item of items) {
          // Mismo filtro que la fuente curada: el sitemap trae de todo.
          if (!detector.detecta(`${item.titular}\n${item.texto}`)) continue
          const noticia = armarNoticia(item, medio)
          if (noticia) {
            nuevas.push(noticia)
            conMencion += 1
          }
        }
        lineasResumen.push(
          `[OK] Sitemap ${medio.nombre}: ${items.length} nuevas procesadas, ${conMencion} con mención, ${cache.size} en caché`,
        )
      } catch (error) {
        // No se vio el sitemap actual: conservar la caché previa SIN podar.
        sitemapVisto[medio.id] = sitemapVistoPrevio[medio.id] ?? []
        lineasResumen.push(`[FALLO] Sitemap ${medio.nombre}: ${error.message}`)
      }
    }
  } else {
    // Desactivado: conservar la caché tal cual para no re-procesar al reactivar.
    Object.assign(sitemapVisto, sitemapVistoPrevio)
  }

  // --- Punto A: Enriquecimiento por noticia ---
  // Descarga de contenido + análisis NLP: solo noticias nuevas (las previas conservan
  // su enriquecimiento por incrementalidad de fusionar). Fallos → analisis: null (fail-open).
  if (ENRIQUECIMIENTO_ACTIVO && nuevas.length > 0) {
    const ineditas = nuevas.filter((n) => !previas.some((p) => p.id === n.id))
    let presupuesto = MAX_DESCARGAS_POR_CORRIDA
    let enriquecidas = 0

    await mapaConLimite(ineditas, 6, async (noticia) => {
      if (presupuesto <= 0) {
        noticia.analisis = null
        return
      }
      presupuesto -= 1

      const contenido = await extractor.obtenerContenido(noticia.url)
      if (!contenido) {
        noticia.analisis = null
        return
      }

      // Propagación de campos. Sin imagen: el extractor ya no la produce.
      noticia.autor = contenido.autor
      noticia.fechaReal = contenido.fechaPublicacion

      // Enriquecimiento: usar texto descargado, o RSS, o titular como fallback
      const textoParaAnalisis = contenido.texto || noticia.extracto.map((s) => s.texto).join('') || noticia.titular
      const config = { VERSION_ANALISIS }
      noticia.analisis = enriquecerNoticia(noticia, textoParaAnalisis, config)
      if (noticia.analisis) enriquecidas += 1
    })

    lineasResumen.push(`[OK] Enriquecimiento: ${enriquecidas}/${ineditas.length} noticias nuevas analizadas`)
  }

  // Muros de pago blandos: notas cuyo medio declaró `isAccessibleForFree: false` y de las
  // que, por eso, no se extrajo el cuerpo. Se reporta SIEMPRE, incluso en cero: un cero
  // explícito responde "no hay medios de pago entre las fuentes", mientras que la ausencia
  // de la línea no distingue eso de "la comprobación no corrió".
  const { omitidasPorMuro } = extractor.estadisticas()
  lineasResumen.push(
    `[OK] Muros de pago: ${omitidasPorMuro} notas sin cuerpo (el medio declara acceso no libre)`,
  )

  // Re-enriquecimiento sin red: previas con análisis nulo o de versión anterior se
  // recalculan con titular + extracto (determinista: una segunda corrida no cambia nada).
  if (ENRIQUECIMIENTO_ACTIVO) {
    let reanalizadas = 0
    for (const noticia of previas) {
      if (noticia.analisis && noticia.analisis.version >= VERSION_ANALISIS) continue
      const texto = noticia.extracto?.map((s) => s.texto).join('') || noticia.titular
      noticia.analisis = enriquecerNoticia(noticia, texto, { VERSION_ANALISIS })
      if (noticia.analisis) reanalizadas += 1
    }
    if (reanalizadas > 0) {
      lineasResumen.push(`[OK] Re-enriquecimiento: ${reanalizadas} noticias previas actualizadas a v${VERSION_ANALISIS}`)
    }
  }

  const fusionadas = quitarRetiradas(fusionar(previas, nuevas, TAMANO_VENTANA), filtroRetiros)

  // --- Limpieza de campos que el sistema dejó de producir ---
  // Va aquí, sobre la ventana YA fusionada, porque el arrastre viene de las PREVIAS: se
  // releen del estado en disco tal cual, y cortar la producción de un dato no lo borra de
  // un archivo que se reescribe cada hora. Mismo motivo que la retención de abajo.
  // Hoy limpia `imagen`, de antes de la decisión del departamento legal.
  const { noticias, limpiadas } = limpiarCamposObsoletos(fusionadas)
  if (limpiadas > 0) {
    lineasResumen.push(
      `[OK] Limpieza: ${limpiadas} noticias previas arrastraban campos ya eliminados ` +
        `y se depuraron del estado`,
    )
  }

  // --- Retención del texto sobre la ventana ---
  // Va ANTES de las exclusiones y del guardado, y es lo que impide que la corrida
  // horaria deshaga la purga nocturna: el archivador hace upsert de la ventana completa,
  // así que una noticia vieja que siguiera acá con su extracto se lo devolvería a la
  // base todas las noches. Ver dominio/retencion.js.
  const { corteExtracto } = calcularCortes(new Date(), {
    retencionExtractoDias: RETENCION_EXTRACTO_DIAS,
    retencionMetadatosDias: RETENCION_METADATOS_DIAS,
    retencionEjecucionesDias: RETENCION_EJECUCIONES_DIAS,
  })
  const purgadasEnVentana = aplicarRetencionEnVentana(noticias, corteExtracto)
  if (purgadasEnVentana > 0) {
    lineasResumen.push(
      `[OK] Retención: ${purgadasEnVentana} noticias de la ventana superaron ` +
        `${RETENCION_EXTRACTO_DIAS} días y perdieron su texto`,
    )
  }

  // --- Marcado suave de exclusión (reversible) ---
  // Va acá a propósito: después de fusionar (el array ya es previas + nuevas
  // deduplicadas, un solo recorrido cubre TODO) y antes de eventos, histórico y
  // guardado. Se recalcula sobre la ventana COMPLETA en cada corrida, nunca se
  // persiste la decisión: por eso, al borrar un concepto, las noticias se desmarcan
  // solas en la corrida siguiente.
  //
  // Ninguna de las 3 fuentes descarta en la ingesta: descartar rompería la
  // reversibilidad (al quitar el concepto, la noticia solo volvería si el feed todavía
  // la tiene, y los feeds rotan en horas). Las excluidas entran a la ventana, ocupan
  // cupo y se archivan en Postgres — así el archivo prueba que nada se perdió.
  const resumenExclusion = marcarExclusiones(noticias, evaluadorExclusion)
  lineasResumen.push(...resumenDeExclusiones(resumenExclusion, evaluadorExclusion))

  // --- Atribución por concepto (nivel 1 del boletín) ---
  // Mismo criterio que las exclusiones: se recalcula sobre la ventana COMPLETA contra
  // campos persistidos, así que reordenar o renombrar conceptos reagrupa el boletín en la
  // corrida siguiente sin volver a pedir nada a los medios.
  const evaluadorInclusion = construirEvaluadorInclusion(conceptosPorPrioridad)
  lineasResumen.push(...resumenDeInclusiones(marcarConceptos(noticias, evaluadorInclusion)))

  // --- Punto B: Eventos e histórico (Fase 2) ---
  // Clustering: agrupa noticias sobre el mismo hecho (ver dominio/eventos.js). Un
  // eventId ya asignado en una corrida previa queda congelado; solo se acuña uno
  // nuevo cuando una segunda noticia se une a una semilla sin evento.
  // Las excluidas se sacan del clustering (un evento inflado por 8 notas ocultas es
  // ruido), pero CONSERVAN su eventId ya asignado: ponerles null rompería el
  // congelamiento y haría que la reversión no devolviera exactamente el estado previo.
  const visibles = noticias.filter((noticia) => !noticia.excluida)
  const eventos = asignarEventos(visibles, {
    umbralEvento: UMBRAL_EVENTO,
    ventanaEventoDias: VENTANA_EVENTO_DIAS,
    umbralDuplicado: UMBRAL_DUPLICADO,
  })
  for (const noticia of noticias) {
    if (noticia.excluida) {
      noticia.eventId = noticia.eventId ?? null // congelado
      continue
    }
    noticia.eventId = eventos.get(noticia.id) ?? null
  }
  const conEvento = visibles.filter((n) => n.eventId).length
  if (conEvento > 0) {
    lineasResumen.push(`[OK] Eventos: ${eventos.size} noticias con evento asignado (${new Set(eventos.values()).size} eventos)`)
  }

  const historico = actualizarHistorico(historicoAnterior, noticias, HISTORICO_MAX_DIAS)
  const historicoIgual =
    historicoAnterior != null &&
    JSON.stringify(historicoAnterior.registros) === JSON.stringify(historico.registros)

  if (!historicoIgual) {
    historico.actualizadoEn = ahora
    await repositorioHistorico.guardar(historico)
  } else if (historicoAnterior) {
    // Si el contenido no cambió, conservar el timestamp anterior
    historico.actualizadoEn = historicoAnterior.actualizadoEn
  }

  // Caché de resolución serializada de forma estable (ordenada) para que un mero
  // reordenamiento del feed de Google no genere un commit espurio.
  const resolucionesGoogle = Object.fromEntries([...cacheGoogle].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))

  // `generadoEn` cambia solo si cambiaron las noticias: una corrida sin novedades
  // no altera la fecha mostrada al usuario.
  const noticiasIguales = estadoPrevio != null && previasSerializadas === JSON.stringify(noticias)
  const estado = {
    generadoEn: noticiasIguales ? estadoPrevio.generadoEn : ahora,
    tamanoVentana: TAMANO_VENTANA,
    secciones: SECCIONES,
    noticias,
    // Lista de exclusión efectivamente APLICADA en esta corrida. Sirve de fallback si
    // la próxima lectura de la base falla; no afecta `noticiasIguales`, que solo
    // serializa `noticias`.
    conceptosExcluidos: evaluadorExclusion.conceptos,
    resolucionesGoogle,
    sitemapVisto,
    // Caché de robots.txt por origen, con su marca de tiempo. Evita re-pedir el archivo
    // de ~60 dominios en cada corrida horaria; se revalida solo al vencer el TTL.
    robotsCache: politicaRobots ? politicaRobots.instantanea() : (estadoPrevio?.robotsCache ?? {}),
  }
  await repositorio.guardar(estado)

  const curadasOk = resultados.filter((resultado) => resultado.status === 'fulfilled').length
  const exito = !(curadasOk === 0 && nuevas.length === 0)

  // --- Sumidero Postgres (v2), en paralelo al JSON: nunca debe impedir que el JSON
  // se haya escrito (ya ocurrió más arriba) ni hacer fallar la corrida.
  if (POSTGRES_ACTIVO) {
    const archivador = crearArchivadorPostgres(configPostgresDesdeEnv())
    try {
      await archivador.archivar(estado)
      lineasResumen.push(`[OK] Postgres: ${noticias.length} noticias archivadas`)
    } catch (error) {
      lineasResumen.push(`[FALLO] Postgres: ${error.message}`)
    }

    // Registro de la activación: una fila por corrida del cron (auditoría de que el
    // collector se activó cada hora y qué recolectó, ver colecta_ejecuciones en
    // db/schema.sql). Fail-open igual que el resto del sumidero: su propio try/catch,
    // nunca hace fallar la corrida. Se ejecuta aunque archivar() haya fallado.
    try {
      const pasosOk = lineasResumen.filter((linea) => linea.startsWith('[OK]')).length
      const pasosFallidos = lineasResumen.filter((linea) => linea.startsWith('[FALLO]')).length
      await archivador.registrarEjecucion({
        iniciadaEn: ahora,
        duracionMs: Date.now() - inicioMs,
        exito,
        noticiasPublicadas: noticias.length,
        noticiasNuevas: nuevas.length,
        noticiasPrevias: previas.length,
        pasosOk,
        pasosFallidos,
        resumen: [...lineasResumen],
      })
    } catch (error) {
      lineasResumen.push(`[FALLO] Registro de ejecución: ${error.message}`)
    } finally {
      await archivador.cerrar()
    }
  }

  console.log(lineasResumen.join('\n'))
  console.log(
    `Ventana: ${previas.length} previas + ${nuevas.length} detectadas -> ${noticias.length} publicadas (tope ${TAMANO_VENTANA})`,
  )

  if (!exito) {
    // No se obtuvo nada de ninguna fuente: fallar evita desplegar una
    // "actualización" vacía y delata el problema.
    console.error('Ninguna fuente entregó datos; corrida marcada como fallida.')
    process.exitCode = 1
  }
}

// Autoejecución solo cuando el archivo se invoca como script (`node src/main.js`),
// no al importarlo desde un test.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`Error fatal: ${error.stack ?? error}`)
    process.exitCode = 1
  })
}
