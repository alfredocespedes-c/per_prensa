// Aplicación idempotente de db/schema.sql, compartida por los adaptadores Postgres.
//
// Vive aparte porque ahora hay DOS procesos Node que conectan a la base (el archivador
// de la corrida horaria y el purgador de la corrida diaria) y ambos deben usar el MISMO
// candado. Con dos copias del número, un cambio en uno y no en el otro haría que dos
// contenedores arrancando a la vez se pisen creando las tablas — que es justo lo que el
// candado existe para evitar.

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Debe coincidir con la constante documentada en el header de db/schema.sql y con
// backend/app/db/bootstrap.py.
export const CANDADO_ESQUEMA = 487200917

export const RUTA_ESQUEMA_POR_DEFECTO = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../db/schema.sql',
)

export function rutaEsquema(rutaExplicita) {
  return rutaExplicita ?? process.env.SCHEMA_SQL_PATH ?? RUTA_ESQUEMA_POR_DEFECTO
}

/** Ejecuta db/schema.sql bajo el advisory lock. El llamador cachea si ya lo hizo. */
export async function aplicarEsquema(cliente, ruta) {
  const sql = await readFile(rutaEsquema(ruta), 'utf8')
  await cliente.query(`SELECT pg_advisory_lock(${CANDADO_ESQUEMA})`)
  try {
    // Sin parámetros: protocolo simple, admite varias sentencias `;`-separadas.
    await cliente.query(sql)
  } finally {
    await cliente.query(`SELECT pg_advisory_unlock(${CANDADO_ESQUEMA})`)
  }
}
