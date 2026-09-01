// Adaptador Postgres de lectura de los retiros APLICADOS.
//
// Mismo criterio que repositorio-conceptos-postgres.js, y por la misma razón de
// disponibilidad: SOLO LECTURA, sin ejecutar db/schema.sql y sin pg_advisory_lock. Esta
// consulta ocurre al PRINCIPIO de la corrida, antes de escribir noticias.json; si tomara
// el candado del esquema y un backend estuviera reiniciándose, la corrida de las 08:00
// quedaría colgada hasta que el `timeout -s KILL 55m` la matara SIN escribir el boletín.
//
// Fail-open con un matiz importante respecto de los conceptos: si esta lectura falla, el
// collector sigue SIN filtro de retiros, así que una nota retirada podría volver a
// archivarse. No es una fuga hacia el público —el filtro de LECTURA del backend la sigue
// ocultando— pero sí conviene que quede en el resumen de la corrida.

import pg from 'pg'

export const SQL_RETIROS_APLICADOS = `
  SELECT ambito, clave
  FROM retiros
  WHERE estado = 'aplicado'
`

export function crearRepositorioRetirosPostgres(config) {
  const pool = new pg.Pool({
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
    connectionTimeoutMillis: config.connectionTimeoutMillis ?? 5_000,
    statement_timeout: config.statementTimeoutMs ?? 5_000,
    ssl: false,
  })

  return {
    async obtener() {
      const cliente = await pool.connect()
      try {
        const { rows } = await cliente.query(SQL_RETIROS_APLICADOS)
        return rows.map((fila) => ({ ambito: fila.ambito, clave: fila.clave }))
      } finally {
        cliente.release()
      }
    },

    async cerrar() {
      await pool.end()
    },
  }
}
