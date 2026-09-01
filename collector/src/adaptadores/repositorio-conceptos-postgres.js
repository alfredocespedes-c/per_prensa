// Adaptador Postgres del puerto repositorio-de-conceptos.
//
// SOLO LECTURA y deliberadamente MÍNIMO: a diferencia de archivador-postgres.js,
// este adaptador NO ejecuta db/schema.sql ni toma pg_advisory_lock.
//
// La razón es de disponibilidad, no de estilo. Hoy toda la I/O con Postgres del
// collector ocurre DESPUÉS de escribir noticias.json (ver main.js), y por eso el
// sumidero puede fallar sin costo. Los conceptos, en cambio, se leen al PRINCIPIO.
// Si esa lectura ejecutara el esquema, tomaría pg_advisory_lock(487200917) — que
// espera INDEFINIDAMENTE, no es pg_try_advisory_lock — y un backend reiniciándose
// con el candado tomado colgaría la corrida de las 08:00 hasta que el
// `timeout -s KILL 55m` del crontab la mate, SIN escribir el JSON. Es decir: el
// boletín no se actualizaría, que es justo lo que hay que evitar.
//
// En el primer arranque, cuando la tabla todavía no existe, la consulta simplemente
// falla y main.js cae al fallback de config/conceptos.js — que es idéntico a la
// semilla del schema.sql, así que el resultado es el mismo sin necesidad de DDL.

import pg from 'pg'
import { sanearConceptos } from '../dominio/conceptos.js'

// Exportada para poder testearla sin base de datos (mismo criterio que
// COLUMNAS_EJECUCION / valoresDeEjecucion en archivador-postgres.js).
//
// ORDER BY orden, creado_en, id: manda el orden que el admin define arrastrando en
// /#/configuracion, con la fecha de creación como desempate.
//
// Ese orden gobierna DOS cosas a la vez, y por eso importa que sea el del admin y no el
// de inserción: (a) el nivel 1 de la jerarquía del boletín —qué concepto es el principal
// de una noticia que menciona varios—, y (b) qué conceptos sobreviven cuando
// dominio/conceptos.js recorta la consulta a Google News por presupuesto de URL.
export const SQL_CONCEPTOS_ACTIVOS = `
  SELECT texto, tipo
  FROM conceptos
  WHERE activo
  ORDER BY orden, creado_en, id
`

export function crearRepositorioConceptosPostgres(config) {
  const pool = new pg.Pool({
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
    connectionTimeoutMillis: config.connectionTimeoutMillis ?? 5_000,
    // Acota la consulta a nivel servidor: connectionTimeoutMillis solo acota tomar la
    // conexión, no la consulta. Sin esto, una base lenta bloquearía la corrida antes
    // de que se escriba el JSON.
    statement_timeout: config.statementTimeoutMs ?? 5_000,
    // sslmode=disable, igual que archivador-postgres.js.
    ssl: false,
  })

  return {
    async obtener() {
      const cliente = await pool.connect()
      try {
        const { rows } = await cliente.query(SQL_CONCEPTOS_ACTIVOS)
        // El saneo, el orden y los límites viven en el dominio, no acá.
        return sanearConceptos(rows)
      } finally {
        cliente.release()
      }
    },

    async cerrar() {
      await pool.end()
    },
  }
}
