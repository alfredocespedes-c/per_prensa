#!/usr/bin/env node
// Reproceso de una sola pasada: limpia los falsos positivos de mención ya ingeridos.
//
// POR QUÉ HACE FALTA UN SCRIPT Y NO BASTA CON ARREGLAR EL EXTRACTOR:
//
// La atribución de conceptos se recalcula cada hora, pero SIEMPRE sobre campos
// PERSISTIDOS: titular + extracto guardado + slug de URL (dominio/inclusiones.js). El
// cuerpo de la nota no se vuelve a mirar nunca. Así que una noticia cuyo extracto quedó
// contaminado con titulares de OTRAS notas —el defecto que corrigió
// adaptadores/limpieza-html.js— se REAFIRMA en su concepto equivocado en cada corrida,
// hasta que la ventana la expulse o la retención de 180 días le vacíe el texto.
//
// Arreglar la extracción evita falsos positivos NUEVOS. Este script limpia los viejos.
//
// LA TRAMPA: el archivador hace upsert horario de TODAS las columnas desde el estado JSON
// (adaptadores/archivador-postgres.js). Un UPDATE hecho solo en Postgres se revierte en
// menos de una hora. Y borrar solo del JSON deja la fila viva en Postgres, porque el
// archivador es aditivo y nunca borra. Por eso hay que tocar LOS DOS.
//
// Uso:
//   node scripts/reprocesar-menciones.mjs                  # SIMULA: informa, no escribe
//   node scripts/reprocesar-menciones.mjs --aplicar        # escribe JSON y borra en Postgres
//   node scripts/reprocesar-menciones.mjs --estado ruta.json
//   node scripts/reprocesar-menciones.mjs --solo-json      # omite Postgres
//
// CORRER PRIMERO EN SIMULACIÓN Y LEER EL INFORME. Si propone borrar muchas más noticias de
// las esperadas, la extracción nueva es demasiado agresiva: revisarla, no aplicar.
//
// Requiere las mismas DATABASE_* que el collector (salvo con --solo-json).

import { parseArgs } from 'node:util'
import { crearRepositorioJson } from '../collector/src/adaptadores/repositorio-json.js'
import { crearClienteHttp } from '../collector/src/adaptadores/cliente-http.js'
import { crearPoliticaRobots } from '../collector/src/adaptadores/politica-robots.js'
import { crearExtractorContenido } from '../collector/src/adaptadores/extractor-contenido.js'
import { mapaConLimite } from '../collector/src/adaptadores/util-concurrencia.js'
import { construirDetector } from '../collector/src/dominio/menciones.js'
import { CONCEPTOS } from '../collector/src/config/conceptos.js'
import {
  CRAWL_DELAY_MAXIMO_MS,
  CRAWL_DELAY_POR_DEFECTO_MS,
  LARGO_EXTRACTO,
  ROBOTS_ACTIVO,
  ROBOTS_EXENTOS,
  ROBOTS_TTL_HORAS,
  USER_AGENT,
} from '../collector/src/config/parametros.js'

const { values } = parseArgs({
  options: {
    aplicar: { type: 'boolean', default: false },
    estado: { type: 'string' },
    'solo-json': { type: 'boolean', default: false },
    concurrencia: { type: 'string' },
  },
})
const APLICAR = values.aplicar
const SOLO_JSON = values['solo-json']
const RUTA_ESTADO = values.estado ?? './datos/noticias.json'
const CONCURRENCIA = Number(values.concurrencia ?? 4)

// Los conceptos de la semilla del código. Si la base manda (CONCEPTOS_DESDE_BD), el
// detector real puede diferir; se informa para que nadie lo dé por equivalente en silencio.
const detector = construirDetector(CONCEPTOS)

function textoDeExtracto(extracto) {
  return Array.isArray(extracto) ? extracto.map((s) => s?.texto ?? '').join('') : ''
}

async function main() {
  console.log(APLICAR ? '=== MODO APLICAR: se escribirá ===' : '=== SIMULACIÓN: no se escribe nada ===')
  console.log(`estado: ${RUTA_ESTADO}`)
  console.log(`conceptos del detector: ${CONCEPTOS.join(', ')}\n`)

  const repositorio = crearRepositorioJson(RUTA_ESTADO)
  const estado = await repositorio.cargar()
  if (!estado?.noticias?.length) {
    console.error('El estado no tiene noticias. Nada que reprocesar.')
    process.exitCode = 1
    return
  }

  // Mismos adaptadores que la corrida real: robots.txt, Crawl-delay y exenciones incluidos.
  // No es una ruta de red paralela, es LA ruta de red del proyecto.
  const politica = ROBOTS_ACTIVO
    ? crearPoliticaRobots({
        userAgent: USER_AGENT,
        ttlHoras: ROBOTS_TTL_HORAS,
        crawlDelayPorDefectoMs: CRAWL_DELAY_POR_DEFECTO_MS,
        crawlDelayMaximoMs: CRAWL_DELAY_MAXIMO_MS,
        cachePrevia: estado.robotsCache ?? {},
        exentos: ROBOTS_EXENTOS,
      })
    : null
  const cliente = crearClienteHttp({ politica, userAgent: USER_AGENT, timeoutMs: 20_000 })
  const extractor = crearExtractorContenido({ userAgent: USER_AGENT, cliente })

  const total = estado.noticias.length
  console.log(`re-descargando ${total} noticias (concurrencia ${CONCURRENCIA})…\n`)

  let hechas = 0
  const resultados = await mapaConLimite(estado.noticias, CONCURRENCIA, async (noticia) => {
    let contenido = null
    let error = null
    try {
      contenido = await extractor.obtenerContenido(noticia.url)
    } catch (e) {
      error = String(e?.message ?? e).slice(0, 60)
    }
    hechas += 1
    if (hechas % 50 === 0) console.log(`  … ${hechas}/${total}`)

    // FAIL-SAFE: sin descarga buena no se decide nada. Borrar por un 404 perdería noticias
    // legítimas cuyo medio reorganizó sus URL, y perder una noticia de un medio grande es
    // el error inaceptable nº 2 de SECOM. Solo se elimina lo que se pudo LEER y NO menciona.
    if (!contenido || typeof contenido.texto !== 'string' || contenido.texto.trim() === '') {
      return { noticia, veredicto: 'sin-lectura', detalle: error ?? 'sin cuerpo' }
    }

    const cuerpo = contenido.texto
    if (!detector.detecta(`${noticia.titular}\n${cuerpo}`)) {
      return { noticia, veredicto: 'sin-mencion' }
    }

    const nuevo = detector.extraerExtracto(cuerpo, LARGO_EXTRACTO)
    const cambia = nuevo && textoDeExtracto(nuevo) !== textoDeExtracto(noticia.extracto)
    return { noticia, veredicto: cambia ? 'extracto-cambia' : 'igual', extracto: nuevo }
  })

  const por = (v) => resultados.filter((r) => r.veredicto === v)
  const sinMencion = por('sin-mencion')
  const cambian = por('extracto-cambia')
  const sinLectura = por('sin-lectura')

  console.log('\n================ INFORME ================')
  console.log(`total en la ventana      : ${total}`)
  console.log(`conservadas, sin cambio  : ${por('igual').length}`)
  console.log(`extracto recalculado     : ${cambian.length}`)
  console.log(`SIN MENCIÓN → a eliminar : ${sinMencion.length}`)
  console.log(`sin lectura → conservadas: ${sinLectura.length}  (fail-safe)`)

  if (sinMencion.length) {
    const porMedio = {}
    for (const r of sinMencion) {
      const m = r.noticia.medioNombre ?? '(sin medio)'
      ;(porMedio[m] ??= []).push(r.noticia)
    }
    console.log('\n--- a eliminar, por medio ---')
    // El desglose por medio es el dato que dice si el defecto era de un medio concreto o
    // está repartido; sin él no se puede juzgar si la corrección fue suficiente.
    for (const [medio, lista] of Object.entries(porMedio).sort((a, b) => b[1].length - a[1].length)) {
      console.log(`  ${medio}: ${lista.length}`)
      for (const n of lista.slice(0, 5)) {
        console.log(`     · [${n.conceptoPrincipal ?? '—'}] ${String(n.titular).slice(0, 70)}`)
        console.log(`       ${n.url}`)
      }
      if (lista.length > 5) console.log(`     … y ${lista.length - 5} más`)
    }
  }

  if (!APLICAR) {
    console.log('\nSimulación: no se escribió nada. Revisar el informe y, si cuadra, --aplicar.')
    return
  }

  const aEliminar = new Set(sinMencion.map((r) => r.noticia.id))
  for (const r of cambian) r.noticia.extracto = r.extracto

  estado.noticias = estado.noticias.filter((n) => !aEliminar.has(n.id))
  await repositorio.guardar(estado)
  console.log(`\n[OK] JSON reescrito: ${estado.noticias.length} noticias (${aEliminar.size} eliminadas)`)

  if (SOLO_JSON || aEliminar.size === 0) {
    if (SOLO_JSON) console.log('[--solo-json] Postgres sin tocar.')
    return
  }

  // Postgres: DELETE explícito. El archivador es aditivo y nunca borra, así que quitarlas
  // del JSON no las saca de la base — seguirían saliendo por la API.
  const { default: pg } = await import('../collector/node_modules/pg/lib/index.js')
  const pool = new pg.Pool({
    host: process.env.DATABASE_HOST,
    port: Number(process.env.DATABASE_PORT ?? 5432),
    database: process.env.DATABASE_NAME,
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    connectionTimeoutMillis: 10_000,
    ssl: false,
  })
  try {
    const ids = [...aEliminar]
    const r = await pool.query('DELETE FROM noticias WHERE id = ANY($1::text[])', [ids])
    console.log(`[OK] Postgres: ${r.rowCount} filas eliminadas`)
  } finally {
    await pool.end()
  }
}

await main()
