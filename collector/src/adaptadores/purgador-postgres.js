// Adaptador Postgres del puerto purgador-de-noticias.
//
// El único componente del sistema con permiso para borrar. Todo va POR LOTES sobre la
// clave primaria: una sola sentencia sobre cientos de miles de filas mantendría un lock
// largo sobre `noticias` mientras la portada la lee.
//
// El corte se hace por `fecha_deteccion` y no por `fecha`: `fecha` es la que declara el
// medio (es NULLable y a veces viene mal), mientras que `fecha_deteccion` es NOT NULL y
// es cuándo ESTE sistema empezó a guardar el dato — que es lo que la política de
// retención mide. Además ya tiene índice (idx_noticias_deteccion).

import pg from 'pg'
import { CAMPOS_ANALISIS_DE_TEXTO } from '../dominio/retencion.js'
import { aplicarEsquema } from './esquema-postgres.js'

// Espejo en SQL de dominio/retencion.js:limpiarAnalisis. Se hace en la base y no en Node
// para no traerse el JSONB de decenas de miles de filas por la red en la primera corrida.
// Los nombres de campo NO van escritos acá: llegan como parámetro desde la constante del
// dominio, que sigue siendo la única definición de "qué se considera texto".
//
//   analisis - $keys::text[]  elimina esas claves del objeto
//   el CASE reproduce la regla "si solo queda `version`, el objeto es hueco -> NULL"
const ANALISIS_LIMPIO = `
  CASE
    WHEN analisis IS NULL THEN NULL
    WHEN (
      SELECT count(*) FROM jsonb_object_keys(analisis - $2::text[]) AS clave
      WHERE clave <> 'version'
    ) = 0 THEN NULL
    ELSE analisis - $2::text[]
  END`

// Una fila necesita purga de texto si le queda extracto O alguna clave de texto en
// `analisis`. `?|` es "el jsonb contiene alguna de estas claves de nivel superior".
// Espejo de dominio/retencion.js:yaPurgada — es lo que hace la purga idempotente.
const NECESITA_PURGA = `(jsonb_array_length(extracto) > 0 OR analisis ?| $2::text[])`

export function crearPurgadorPostgres(config) {
  const pool = new pg.Pool({
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
    connectionTimeoutMillis: config.connectionTimeoutMillis ?? 10_000,
    ssl: false,
  })

  let esquemaListo = false
  async function asegurarEsquema(cliente) {
    if (esquemaListo) return
    await aplicarEsquema(cliente, config.rutaEsquema)
    esquemaListo = true
  }

  /**
   * Repite `operacion` en lotes hasta que deje de afectar filas.
   *
   * El tope de vueltas no es decorativo: si una operación devolviera siempre >0 sin
   * avanzar (por un predicado mal escrito), esto giraría para siempre dentro del cron.
   */
  async function porLotes(cliente, operacion, tamanoLote) {
    let total = 0
    let vueltas = 0
    const MAX_VUELTAS = 100_000
    for (;;) {
      const afectadas = await operacion(cliente, tamanoLote)
      total += afectadas
      if (afectadas === 0) return total
      if (++vueltas > MAX_VUELTAS) {
        throw new Error(`Purga sin converger tras ${MAX_VUELTAS} lotes (${total} filas)`)
      }
    }
  }

  async function conCliente(fn) {
    const cliente = await pool.connect()
    try {
      await asegurarEsquema(cliente)
      return await fn(cliente)
    } finally {
      cliente.release()
    }
  }

  return {
    async purgarExtractos(corte, { tamanoLote = 500, simulacion = false } = {}) {
      return conCliente(async (cliente) => {
        if (simulacion) {
          const { rows } = await cliente.query(
            `SELECT count(*)::int AS total FROM noticias
             WHERE fecha_deteccion < $1 AND ${NECESITA_PURGA}`,
            [corte, CAMPOS_ANALISIS_DE_TEXTO],
          )
          return rows[0]?.total ?? 0
        }

        return porLotes(
          cliente,
          async (c, lote) => {
            const { rowCount } = await c.query(
              `UPDATE noticias SET
                 extracto = '[]'::jsonb,
                 analisis = ${ANALISIS_LIMPIO},
                 actualizada_en = now()
               WHERE id IN (
                 SELECT id FROM noticias
                 WHERE fecha_deteccion < $1 AND ${NECESITA_PURGA}
                 ORDER BY fecha_deteccion
                 LIMIT $3
               )`,
              [corte, CAMPOS_ANALISIS_DE_TEXTO, lote],
            )
            return rowCount ?? 0
          },
          tamanoLote,
        )
      })
    },

    async purgarNoticias(corte, { tamanoLote = 500, simulacion = false } = {}) {
      return conCliente(async (cliente) => {
        if (simulacion) {
          const { rows } = await cliente.query(
            'SELECT count(*)::int AS total FROM noticias WHERE fecha_deteccion < $1',
            [corte],
          )
          return rows[0]?.total ?? 0
        }

        return porLotes(
          cliente,
          async (c, lote) => {
            const { rowCount } = await c.query(
              `DELETE FROM noticias WHERE id IN (
                 SELECT id FROM noticias
                 WHERE fecha_deteccion < $1
                 ORDER BY fecha_deteccion
                 LIMIT $2
               )`,
              [corte, lote],
            )
            return rowCount ?? 0
          },
          tamanoLote,
        )
      })
    },

    async purgarEjecuciones(corte, { tamanoLote = 500, simulacion = false } = {}) {
      return conCliente(async (cliente) => {
        if (simulacion) {
          const { rows } = await cliente.query(
            'SELECT count(*)::int AS total FROM colecta_ejecuciones WHERE iniciada_en < $1',
            [corte],
          )
          return rows[0]?.total ?? 0
        }

        return porLotes(
          cliente,
          async (c, lote) => {
            const { rowCount } = await c.query(
              `DELETE FROM colecta_ejecuciones WHERE id IN (
                 SELECT id FROM colecta_ejecuciones
                 WHERE iniciada_en < $1
                 ORDER BY iniciada_en
                 LIMIT $2
               )`,
              [corte, lote],
            )
            return rowCount ?? 0
          },
          tamanoLote,
        )
      })
    },

    // El "log de ejecución" que exige el rediseño. Aditivo y con su propio try/catch en
    // el llamador: que no se pueda registrar la purga no debe hacer fallar la purga.
    async registrarPurga(resultado) {
      return conCliente(async (cliente) => {
        await cliente.query(
          `INSERT INTO purga_ejecuciones
             (iniciada_en, duracion_ms, exito, simulacion, extractos_purgados,
              noticias_borradas, ejecuciones_borradas, resumen)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            resultado.iniciadaEn,
            Math.max(0, Math.round(Number(resultado.duracionMs) || 0)),
            Boolean(resultado.exito),
            Boolean(resultado.simulacion),
            resultado.extractosPurgados ?? 0,
            resultado.noticiasBorradas ?? 0,
            resultado.ejecucionesBorradas ?? 0,
            JSON.stringify(resultado.resumen ?? []),
          ],
        )
      })
    },

    async cerrar() {
      await pool.end()
    },
  }
}
