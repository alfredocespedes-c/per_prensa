// La semilla de conceptos está escrita DOS veces: en db/schema.sql (que la inserta
// cuando la tabla está vacía) y en collector/src/config/conceptos.js (que es el
// fallback del collector si la base no responde). Es una duplicación deliberada —
// el fallback no puede depender de la base—, pero si divergen tendríamos dos
// verdades distintas y el comportamiento dependería de si Postgres respondió.
//
// Este test hace imposible olvidarlo: falla `npm test`, que es compuerta del deploy
// (ver .github/workflows/deploy-prod.yml).

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { CONCEPTOS } from '../src/config/conceptos.js'

const RUTA_ESQUEMA = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../db/schema.sql',
)

/** Extrae los literales del bloque VALUES del INSERT de semilla de conceptos. */
function semillaDelEsquema(sql) {
  const insert = sql.slice(sql.indexOf('INSERT INTO conceptos'))
  const values = insert.slice(insert.indexOf('(VALUES'), insert.indexOf(') AS semilla'))
  return [...values.matchAll(/\('((?:[^']|'')*)'\)/g)].map((m) => m[1].replace(/''/g, "'"))
}

describe('semilla de conceptos', () => {
  const sql = readFileSync(RUTA_ESQUEMA, 'utf8')

  it('db/schema.sql tiene el INSERT de semilla', () => {
    expect(sql).toContain('INSERT INTO conceptos')
  })

  it('la semilla del SQL coincide con CONCEPTOS de config/conceptos.js', () => {
    expect(new Set(semillaDelEsquema(sql))).toEqual(new Set(CONCEPTOS))
  })

  it('siembra solo con la tabla vacía, nunca fila por fila', () => {
    // Con ON CONFLICT DO NOTHING por fila, renombrar un concepto desde la web libera
    // su clave única y el original RESUCITA en la corrida siguiente.
    const insert = sql.slice(sql.indexOf('INSERT INTO conceptos'))
    expect(insert).toContain('WHERE NOT EXISTS (SELECT 1 FROM conceptos)')
    expect(insert.slice(0, insert.indexOf(';'))).not.toContain('ON CONFLICT')
  })
})
