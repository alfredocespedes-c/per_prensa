#!/usr/bin/env node
// Migración de una sola pasada del rediseño de exposición legal.
//
// El esquema se migra solo (db/schema.sql lo aplica el collector en cada corrida); lo que
// este script hace es lo que el esquema NO puede: reescribir los DATOS ya archivados para
// que cumplan la política nueva, y responder qué medios necesitan revisión humana.
//
// Uso:
//   node scripts/migracion-privacidad.mjs              # SIMULACIÓN: informa, no escribe
//   node scripts/migracion-privacidad.mjs --aplicar    # escribe
//
// La simulación es el modo por defecto porque tres de los seis pasos destruyen texto de
// forma irreversible. Es idempotente: correrlo dos veces no cambia nada la segunda.
//
// Requiere las mismas DATABASE_* que el collector.

import { CAMPOS_ANALISIS_DE_TEXTO } from '../collector/src/dominio/retencion.js'
import { construirEvaluadorInclusion } from '../collector/src/dominio/inclusiones.js'
import { construirDetector } from '../collector/src/dominio/menciones.js'
import { MEDIOS, MEDIOS_SITEMAP } from '../collector/src/config/medios.js'
import {
  LARGO_EXTRACTO,
  RETENCION_EXTRACTO_DIAS,
} from '../collector/src/config/parametros.js'

const APLICAR = process.argv.includes('--aplicar')
const LOTE = 500

// `pg` vive en collector/node_modules, no en la raíz. Se importa de forma DIFERIDA para
// que el informe de medios —que no toca la base— funcione siempre, incluso al ejecutar
// el script desde la raíz del repo sin haber instalado nada.
async function crearPool() {
  const { default: pg } = await import('pg')
  return new pg.Pool({
    host: process.env.DATABASE_HOST,
    port: Number(process.env.DATABASE_PORT ?? 5432),
    database: process.env.DATABASE_NAME,
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    connectionTimeoutMillis: 10_000,
    ssl: false,
  })
}

const registro = []
const anotar = (linea) => {
  registro.push(linea)
  console.log(linea)
}

/** Recorta un extracto ya segmentado a `largo`, conservando la mención resaltada. */
export function recortarExtracto(segmentos, largo = LARGO_EXTRACTO) {
  if (!Array.isArray(segmentos) || segmentos.length === 0) return []
  const total = segmentos.reduce((n, s) => n + (s?.texto?.length ?? 0), 0)
  if (total <= largo) return segmentos

  // Se centra en la PRIMERA mención resaltada y no se corta desde el inicio: un recorte a
  // ciegas dejaría extractos de 500 caracteres sin ningún <mark>, o sea sin lo único que
  // justifica que la noticia esté en el boletín.
  const inicioMencion = (() => {
    let acumulado = 0
    for (const segmento of segmentos) {
      if (segmento?.resaltado) return acumulado
      acumulado += segmento?.texto?.length ?? 0
    }
    return 0
  })()

  const desde = Math.max(0, Math.min(inicioMencion - Math.floor(largo * 0.3), total - largo))
  const hasta = desde + largo

  const salida = []
  let cursor = 0
  for (const segmento of segmentos) {
    const texto = segmento?.texto ?? ''
    const fin = cursor + texto.length
    if (fin > desde && cursor < hasta) {
      salida.push({
        texto: texto.slice(Math.max(0, desde - cursor), Math.max(0, hasta - cursor)),
        resaltado: Boolean(segmento?.resaltado),
      })
    }
    cursor = fin
  }
  if (desde > 0) salida.unshift({ texto: '(...) ', resaltado: false })
  if (hasta < total) salida.push({ texto: ' (...)', resaltado: false })
  return salida.filter((s) => s.texto.length > 0)
}

async function paso1y2_extractos(cliente) {
  anotar('\n[1] Extractos que exceden ' + LARGO_EXTRACTO + ' caracteres')
  const { rows } = await cliente.query(
    `SELECT id, extracto FROM noticias
     WHERE jsonb_array_length(extracto) > 0
       AND length(extracto::text) > $1`,
    [LARGO_EXTRACTO],
  )
  const largos = rows.filter(
    (f) => f.extracto.reduce((n, s) => n + (s?.texto?.length ?? 0), 0) > LARGO_EXTRACTO,
  )
  anotar(`    ${largos.length} noticias por recortar`)

  if (APLICAR) {
    for (let i = 0; i < largos.length; i += LOTE) {
      for (const fila of largos.slice(i, i + LOTE)) {
        await cliente.query('UPDATE noticias SET extracto = $2::jsonb WHERE id = $1', [
          fila.id,
          JSON.stringify(recortarExtracto(fila.extracto)),
        ])
      }
    }
    anotar(`    recortadas ${largos.length}`)
  }
}

async function paso3_retencion(cliente) {
  anotar(`\n[2] Texto con más de ${RETENCION_EXTRACTO_DIAS} días`)
  const { rows } = await cliente.query(
    `SELECT count(*)::int AS n FROM noticias
     WHERE fecha_deteccion < now() - ($1 || ' days')::interval
       AND (jsonb_array_length(extracto) > 0 OR analisis ?| $2::text[])`,
    [String(RETENCION_EXTRACTO_DIAS), CAMPOS_ANALISIS_DE_TEXTO],
  )
  anotar(`    ${rows[0].n} noticias por purgar`)
  if (APLICAR && rows[0].n > 0) {
    // Misma sentencia que la purga nocturna (adaptadores/purgador-postgres.js).
    const { rowCount } = await cliente.query(
      `UPDATE noticias SET extracto = '[]'::jsonb,
         analisis = CASE WHEN analisis IS NULL THEN NULL ELSE analisis - $2::text[] END,
         actualizada_en = now()
       WHERE fecha_deteccion < now() - ($1 || ' days')::interval
         AND (jsonb_array_length(extracto) > 0 OR analisis ?| $2::text[])`,
      [String(RETENCION_EXTRACTO_DIAS), CAMPOS_ANALISIS_DE_TEXTO],
    )
    anotar(`    purgadas ${rowCount}`)
  }
}

async function paso4_personas(cliente) {
  anotar('\n[3] Nombres de personas almacenados en `analisis`')
  const { rows } = await cliente.query(
    `SELECT count(*)::int AS n FROM noticias WHERE analisis ? 'personas'`,
  )
  anotar(`    ${rows[0].n} noticias con el campo`)
  if (APLICAR && rows[0].n > 0) {
    const { rowCount } = await cliente.query(
      `UPDATE noticias SET analisis = analisis - 'personas' WHERE analisis ? 'personas'`,
    )
    anotar(`    eliminado de ${rowCount}`)
  }
}

async function paso5_conceptos(cliente) {
  anotar('\n[4] Atribución por concepto (nivel 1 del boletín)')
  const { rows: conceptos } = await cliente.query(
    `SELECT texto FROM conceptos WHERE activo AND tipo = 'incluir' ORDER BY orden, creado_en, id`,
  )
  const evaluador = construirEvaluadorInclusion(conceptos.map((c) => c.texto))
  anotar(`    conceptos activos, en orden: ${evaluador.conceptos.join(' > ')}`)

  const { rows } = await cliente.query(
    `SELECT id, titular, extracto FROM noticias
     WHERE concepto_principal IS NULL AND jsonb_array_length(extracto) > 0`,
  )
  anotar(`    ${rows.length} noticias con extracto y sin concepto asignado`)

  let asignadas = 0
  for (const fila of rows) {
    const texto = `${fila.titular}\n${fila.extracto.map((s) => s?.texto ?? '').join('')}`
    const detectados = evaluador.evaluar(texto)
    if (detectados.length === 0) continue
    asignadas += 1
    if (APLICAR) {
      await cliente.query(
        'UPDATE noticias SET conceptos_detectados = $2, concepto_principal = $3 WHERE id = $1',
        [fila.id, detectados, detectados[0]],
      )
    }
  }
  anotar(`    ${asignadas} clasificables${APLICAR ? ' (asignadas)' : ''}`)
  anotar(
    `    ${rows.length - asignadas} quedan sin concepto: entraron por la búsqueda de ` +
      'Google sin la palabra literal. Se muestran en el bloque "Otras menciones".',
  )
}

function paso6_tiposDeMedio() {
  anotar('\n[5] Revisión de `tipo_medio` (informe, no modifica nada)')
  const todos = [...MEDIOS, ...MEDIOS_SITEMAP]
  const porTipo = new Map()
  for (const medio of todos) {
    porTipo.set(medio.tipo, [...(porTipo.get(medio.tipo) ?? []), medio.nombre])
  }

  anotar(`    ${todos.length} medios configurados. Todos tienen tipo asignado.`)
  for (const [tipo, medios] of [...porTipo].sort((a, b) => b[1].length - a[1].length)) {
    anotar(`      ${tipo.padEnd(14)} ${String(medios.length).padStart(3)}`)
  }

  // `otros` no es un tipo de medio: es el cajón donde caen los que no encajaban en la
  // taxonomía del boletín antiguo. Con la jerarquía de dos niveles, cada uno de estos
  // debería reclasificarse a mano en collector/src/config/medios.js.
  const sinClasificar = porTipo.get('otros') ?? []
  if (sinClasificar.length > 0) {
    anotar(`\n    REVISIÓN MANUAL — ${sinClasificar.length} medios en el cajón "otros":`)
    for (const nombre of sinClasificar) anotar(`      - ${nombre}`)
    anotar('    Reclasificar en collector/src/config/medios.js (escrita/regional/radio/digital/tv).')
  }
}

async function main() {
  console.log(
    APLICAR
      ? '=== MIGRACIÓN DE PRIVACIDAD — MODO APLICAR (escribe en la base) ==='
      : '=== MIGRACIÓN DE PRIVACIDAD — SIMULACIÓN (no escribe nada) ===',
  )

  // El informe de medios no toca la base: se emite aunque no haya conexión.
  paso6_tiposDeMedio()

  if (!process.env.DATABASE_HOST) {
    anotar('\nSin DATABASE_HOST: se omiten los pasos que tocan la base.')
    return
  }

  const pool = await crearPool()
  const cliente = await pool.connect()
  try {
    await paso1y2_extractos(cliente)
    await paso3_retencion(cliente)
    await paso4_personas(cliente)
    await paso5_conceptos(cliente)
  } finally {
    cliente.release()
    await pool.end()
  }

  if (!APLICAR) {
    console.log('\nNada se modificó. Repetir con --aplicar para ejecutar.')
  }
}

main().catch((error) => {
  console.error(`Error fatal en la migración: ${error.stack ?? error}`)
  process.exitCode = 1
})
