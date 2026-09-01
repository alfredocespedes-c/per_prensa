import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { crearPurgadorPostgres } from '../src/adaptadores/purgador-postgres.js'
import { CAMPOS_ANALISIS_DE_TEXTO } from '../src/dominio/retencion.js'

// Mismo doble de `pg` que archivador-postgres.test.js: el adaptador nunca abre una
// conexión real desde los tests. Se captura cada query para asertar el contrato SQL.
const pgFalso = vi.hoisted(() => ({ cliente: null }))

vi.mock('pg', () => {
  class PoolFalso {
    constructor(config) {
      this.config = config
      this.end = vi.fn(async () => {})
    }

    async connect() {
      return pgFalso.cliente
    }
  }
  return { default: { Pool: PoolFalso } }
})

const CORTE = new Date('2026-02-12T00:00:00Z')
let rutaEsquema

beforeEach(async () => {
  const dir = await mkdtemp(join(tmpdir(), 'purga-'))
  rutaEsquema = join(dir, 'schema.sql')
  await writeFile(rutaEsquema, 'SELECT 1;')
})

/** Cliente falso: `respuestas` es una cola de resultados para las queries no-DDL. */
function clienteFalso(respuestas) {
  const queries = []
  const cola = [...respuestas]
  pgFalso.cliente = {
    queries,
    release: vi.fn(),
    query: vi.fn(async (sql, params) => {
      queries.push({ sql, params })
      if (/pg_advisory|SELECT 1/.test(sql)) return { rows: [], rowCount: 0 }
      return cola.shift() ?? { rows: [{ total: 0 }], rowCount: 0 }
    }),
  }
  return pgFalso.cliente
}

const crear = () => crearPurgadorPostgres({ host: 'x', rutaEsquema })
const sqlDeNegocio = (cliente) =>
  cliente.queries.filter((q) => !/pg_advisory|SELECT 1/.test(q.sql))

describe('purgarExtractos', () => {
  it('en simulación CUENTA y no escribe nada', async () => {
    const cliente = clienteFalso([{ rows: [{ total: 42 }] }])

    const total = await crear().purgarExtractos(CORTE, { simulacion: true })

    expect(total).toBe(42)
    const sql = sqlDeNegocio(cliente).map((q) => q.sql).join('\n')
    expect(sql).toMatch(/SELECT count/i)
    expect(sql).not.toMatch(/UPDATE|DELETE/i)
  })

  it('purga por LOTES hasta que no queda nada', async () => {
    // Un UPDATE de una sola sentencia sobre cientos de miles de filas mantendría un lock
    // largo sobre `noticias` justo mientras la portada la lee.
    const cliente = clienteFalso([{ rowCount: 500 }, { rowCount: 500 }, { rowCount: 13 }, { rowCount: 0 }])

    const total = await crear().purgarExtractos(CORTE, { tamanoLote: 500 })

    expect(total).toBe(1013)
    expect(sqlDeNegocio(cliente)).toHaveLength(4)
    expect(sqlDeNegocio(cliente)[0].params[2]).toBe(500)
  })

  it('los nombres de los campos de texto vienen del DOMINIO, no escritos en el SQL', async () => {
    // Si estuvieran escritos en la consulta, agregar un campo derivado del texto al
    // análisis lo dejaría fuera de la purga sin que nadie se enterara.
    const cliente = clienteFalso([{ rowCount: 0 }])

    await crear().purgarExtractos(CORTE, {})

    const consulta = sqlDeNegocio(cliente)[0]
    expect(consulta.params[1]).toEqual(CAMPOS_ANALISIS_DE_TEXTO)
    for (const campo of CAMPOS_ANALISIS_DE_TEXTO) {
      expect(consulta.sql).not.toContain(campo)
    }
  })

  it('corta por fecha_deteccion, no por la fecha que declara el medio', async () => {
    const cliente = clienteFalso([{ rowCount: 0 }])
    await crear().purgarExtractos(CORTE, {})

    const consulta = sqlDeNegocio(cliente)[0]
    expect(consulta.sql).toContain('fecha_deteccion < $1')
    expect(consulta.params[0]).toBe(CORTE)
  })
})

describe('purgarNoticias', () => {
  it('borra por lotes y devuelve el total', async () => {
    const cliente = clienteFalso([{ rowCount: 7 }, { rowCount: 0 }])

    expect(await crear().purgarNoticias(CORTE, { tamanoLote: 100 })).toBe(7)
    expect(sqlDeNegocio(cliente)[0].sql).toMatch(/DELETE FROM noticias/i)
  })

  it('en simulación no borra', async () => {
    const cliente = clienteFalso([{ rows: [{ total: 3 }] }])

    expect(await crear().purgarNoticias(CORTE, { simulacion: true })).toBe(3)
    expect(sqlDeNegocio(cliente).map((q) => q.sql).join()).not.toMatch(/DELETE/i)
  })
})

describe('purgarEjecuciones', () => {
  it('poda colecta_ejecuciones por iniciada_en', async () => {
    const cliente = clienteFalso([{ rowCount: 24 }, { rowCount: 0 }])

    expect(await crear().purgarEjecuciones(CORTE, {})).toBe(24)
    expect(sqlDeNegocio(cliente)[0].sql).toMatch(/DELETE FROM colecta_ejecuciones/i)
    expect(sqlDeNegocio(cliente)[0].sql).toContain('iniciada_en < $1')
  })
})

describe('registrarPurga', () => {
  it('escribe una fila en purga_ejecuciones con los contadores', async () => {
    const cliente = clienteFalso([{ rowCount: 1 }])

    await crear().registrarPurga({
      iniciadaEn: '2026-08-11T06:30:00.000Z',
      duracionMs: 1234.7,
      exito: true,
      simulacion: false,
      extractosPurgados: 12,
      noticiasBorradas: 3,
      ejecucionesBorradas: 24,
      resumen: ['[OK] Purga de texto'],
    })

    const consulta = sqlDeNegocio(cliente)[0]
    expect(consulta.sql).toMatch(/INSERT INTO purga_ejecuciones/i)
    expect(consulta.params[1]).toBe(1235) // duración redondeada
    expect(consulta.params.slice(4, 7)).toEqual([12, 3, 24])
  })

  it('tolera un resultado incompleto sin lanzar', async () => {
    clienteFalso([{ rowCount: 1 }])
    await expect(
      crear().registrarPurga({ iniciadaEn: 'x', duracionMs: NaN, exito: false }),
    ).resolves.toBeUndefined()
  })
})

describe('convergencia', () => {
  it('aborta si la purga no converge en vez de girar para siempre en el cron', async () => {
    // Un predicado mal escrito que devolviera siempre >0 haría un bucle infinito dentro
    // de la corrida diaria.
    pgFalso.cliente = {
      release: vi.fn(),
      query: vi.fn(async (sql) =>
        /pg_advisory|SELECT 1/.test(sql) ? { rows: [] } : { rowCount: 1 },
      ),
    }

    await expect(crear().purgarNoticias(CORTE, { tamanoLote: 1 })).rejects.toThrow(/converger/i)
  })
})
