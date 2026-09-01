import { afterAll, beforeAll, beforeEach, describe, it, expect, vi } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  COLUMNAS_EJECUCION,
  COLUMNAS_NOTICIA,
  crearArchivadorPostgres,
  valoresDeEjecucion,
  valoresDeNoticia,
} from '../src/adaptadores/archivador-postgres.js'

// Doble del módulo pg: el adaptador jamás debe abrir una conexión real desde los tests.
// Se captura cada query (SQL + parámetros) para asertar el contrato con la base.
const pgFalso = vi.hoisted(() => ({ cliente: null, pool: null }))

vi.mock('pg', () => {
  class PoolFalso {
    constructor(config) {
      this.config = config
      this.end = vi.fn(async () => {})
      pgFalso.pool = this
    }

    async connect() {
      return pgFalso.cliente
    }
  }
  return { default: { Pool: PoolFalso } }
})

// La tabla colecta_ejecuciones registra una fila por corrida del cron (auditoría de
// activaciones, ver db/schema.sql). valoresDeEjecucion es el mapeo puro objeto->fila;
// su orden DEBE coincidir con COLUMNAS_EJECUCION o el INSERT quedaría descolocado.
describe('valoresDeEjecucion', () => {
  it('mapea los campos en el mismo orden que COLUMNAS_EJECUCION', () => {
    const valores = valoresDeEjecucion({
      iniciadaEn: '2026-08-01T08:00:00.000Z',
      duracionMs: 1234,
      exito: true,
      noticiasPublicadas: 100,
      noticiasNuevas: 5,
      noticiasPrevias: 95,
      pasosOk: 12,
      pasosFallidos: 1,
      resumen: ['[OK] La Tercera: 30 ítems', '[FALLO] Google News: timeout'],
    })

    expect(valores).toHaveLength(COLUMNAS_EJECUCION.length)
    expect(valores[COLUMNAS_EJECUCION.indexOf('iniciada_en')]).toBe('2026-08-01T08:00:00.000Z')
    expect(valores[COLUMNAS_EJECUCION.indexOf('duracion_ms')]).toBe(1234)
    expect(valores[COLUMNAS_EJECUCION.indexOf('exito')]).toBe(true)
    expect(valores[COLUMNAS_EJECUCION.indexOf('noticias_publicadas')]).toBe(100)
    expect(valores[COLUMNAS_EJECUCION.indexOf('noticias_nuevas')]).toBe(5)
    expect(valores[COLUMNAS_EJECUCION.indexOf('noticias_previas')]).toBe(95)
    expect(valores[COLUMNAS_EJECUCION.indexOf('pasos_ok')]).toBe(12)
    expect(valores[COLUMNAS_EJECUCION.indexOf('pasos_fallidos')]).toBe(1)
    // resumen se serializa a JSON (columna JSONB, se pasa como texto al driver).
    expect(valores[COLUMNAS_EJECUCION.indexOf('resumen')]).toBe(
      JSON.stringify(['[OK] La Tercera: 30 ítems', '[FALLO] Google News: timeout']),
    )
  })

  it('aplica defaults seguros ante campos ausentes (nunca inserta null en columnas NOT NULL)', () => {
    const valores = valoresDeEjecucion({ iniciadaEn: '2026-08-01T09:00:00.000Z', duracionMs: 0, exito: false })

    expect(valores).toHaveLength(COLUMNAS_EJECUCION.length)
    expect(valores[COLUMNAS_EJECUCION.indexOf('noticias_publicadas')]).toBe(0)
    expect(valores[COLUMNAS_EJECUCION.indexOf('pasos_ok')]).toBe(0)
    expect(valores[COLUMNAS_EJECUCION.indexOf('pasos_fallidos')]).toBe(0)
    expect(valores[COLUMNAS_EJECUCION.indexOf('resumen')]).toBe('[]')
  })

  it('normaliza duracion_ms a un entero no negativo', () => {
    expect(valoresDeEjecucion({ duracionMs: 1234.9 })[COLUMNAS_EJECUCION.indexOf('duracion_ms')]).toBe(1235)
    expect(valoresDeEjecucion({ duracionMs: -5 })[COLUMNAS_EJECUCION.indexOf('duracion_ms')]).toBe(0)
    expect(valoresDeEjecucion({})[COLUMNAS_EJECUCION.indexOf('duracion_ms')]).toBe(0)
  })
})

// Mismo criterio: el orden de valoresDeNoticia debe coincidir con COLUMNAS_NOTICIA, y
// las columnas de exclusión son NOT NULL, así que una noticia de un estado viejo (sin
// los campos) no puede producir null.
describe('valoresDeNoticia — columnas de exclusión', () => {
  const base = {
    id: 'https://medio.cl/n', url: 'https://medio.cl/n', medioId: 'm', medioNombre: 'M',
    seccionId: 'escrita', titular: 'T', fecha: null, fechaDeteccion: '2026-08-01T00:00:00.000Z',
    extracto: [],
  }

  it('mapea excluida y excluida_por en su posición', () => {
    const valores = valoresDeNoticia({ ...base, excluida: true, excluidaPor: ['CMPC'] })
    expect(valores).toHaveLength(COLUMNAS_NOTICIA.length)
    expect(valores[COLUMNAS_NOTICIA.indexOf('excluida')]).toBe(true)
    expect(valores[COLUMNAS_NOTICIA.indexOf('excluida_por')]).toEqual(['CMPC'])
  })

  it('una noticia sin los campos da false y [], nunca null', () => {
    const valores = valoresDeNoticia(base)
    expect(valores[COLUMNAS_NOTICIA.indexOf('excluida')]).toBe(false)
    expect(valores[COLUMNAS_NOTICIA.indexOf('excluida_por')]).toEqual([])
  })

  it('tolera excluidaPor con un valor no-array', () => {
    const valores = valoresDeNoticia({ ...base, excluidaPor: 'CMPC' })
    expect(valores[COLUMNAS_NOTICIA.indexOf('excluida_por')]).toEqual([])
  })

  it('no existe la columna imagen y una noticia que la traiga no la cuela al INSERT', () => {
    // Guarda del emparejamiento POSICIONAL alrededor del hueco que dejó la eliminación
    // de imágenes: COLUMNAS_NOTICIA y valoresDeNoticia deben haber perdido su entrada
    // A LA VEZ. La comprobación de longitud de arriba no distingue "quitaron las dos"
    // de "quitaron dos cosas distintas"; esta sí: mapea una noticia completa y verifica
    // campo a campo que cada valor cayó en SU columna, con la URL de una imagen presente
    // en la entrada para confirmar que no aparece en ninguna posición.
    expect(COLUMNAS_NOTICIA).not.toContain('imagen')

    const valores = valoresDeNoticia({
      ...base,
      titular: 'Titular de control',
      autor: 'Autora de Control',
      imagen: 'https://medio.cl/og-de-un-estado-viejo.jpg',
      excluida: true,
      excluidaPor: ['CMPC'],
      conceptosDetectados: ['CONAF'],
      conceptoPrincipal: 'CONAF',
    })

    expect(valores[COLUMNAS_NOTICIA.indexOf('titular')]).toBe('Titular de control')
    expect(valores[COLUMNAS_NOTICIA.indexOf('autor')]).toBe('Autora de Control')
    expect(valores[COLUMNAS_NOTICIA.indexOf('concepto_principal')]).toBe('CONAF')
    // La URL de la imagen no puede estar en NINGUNA posición: si alguien quitara la
    // columna de la lista pero no el valor (o al revés), todo lo posterior se descoloca
    // y esta aserción (junto con las tres de arriba) se pone roja.
    expect(valores).not.toContain('https://medio.cl/og-de-un-estado-viejo.jpg')
  })
})
describe('crearArchivadorPostgres', () => {
  let dirTemporal
  let rutaEsquema

  const noticiaEjemplo = {
    id: 'n-1',
    url: 'https://medio.cl/nota-conaf',
    medioId: 'medio',
    medioNombre: 'El Medio',
    seccionId: 'nacionales',
    titular: "CONAF anuncia plan; comillas ' peligrosas",
    fecha: '2026-08-01T10:00:00.000Z',
    fechaDeteccion: '2026-08-01T11:00:00.000Z',
    extracto: [{ texto: 'CONAF', resaltado: true }],
  }

  const estadoEjemplo = {
    generadoEn: '2026-08-01T12:00:00.000Z',
    tamanoVentana: 100,
    secciones: [{ id: 'nacionales', nombre: 'Medios nacionales', orden: 1 }],
    noticias: [noticiaEjemplo],
  }

  beforeAll(async () => {
    // Esquema de prueba en disco: asegurarEsquema lo lee con readFile real. Sin
    // sentencias destructivas, igual que el db/schema.sql verdadero.
    dirTemporal = await mkdtemp(join(tmpdir(), 'archivador-pg-'))
    rutaEsquema = join(dirTemporal, 'schema.sql')
    await writeFile(rutaEsquema, '-- esquema de prueba\nSELECT 1;\n', 'utf8')
  })

  afterAll(() => rm(dirTemporal, { recursive: true, force: true }))

  beforeEach(() => {
    pgFalso.cliente = { query: vi.fn(async () => ({ rows: [] })), release: vi.fn() }
    pgFalso.pool = null
  })

  function crearArchivador() {
    return crearArchivadorPostgres({ host: 'db', port: 5432, database: 'coipo', user: 'u', password: 'p', rutaEsquema })
  }

  function sqlsEjecutados() {
    return pgFalso.cliente.query.mock.calls.map(([sql]) => String(sql))
  }

  it('archivar es un sumidero aditivo: INSERT ... ON CONFLICT, jamás DELETE ni TRUNCATE', async () => {
    await crearArchivador().archivar(estadoEjemplo)

    const todoElSql = sqlsEjecutados().join('\n')
    // Regla de diseño del adaptador: nunca borra; el JSON sigue siendo la fuente de verdad.
    expect(todoElSql).not.toMatch(/\b(DELETE|TRUNCATE|DROP)\b/i)
    expect(sqlsEjecutados().find((s) => s.includes('INSERT INTO noticias'))).toMatch(/ON CONFLICT \(id\) DO UPDATE/)
    expect(sqlsEjecutados().find((s) => s.includes('INSERT INTO secciones'))).toMatch(/ON CONFLICT \(id\) DO UPDATE/)
    expect(sqlsEjecutados().find((s) => s.includes('INSERT INTO coleccion_metadatos'))).toMatch(/ON CONFLICT/)
    // Todo dentro de una transacción: o entra la corrida completa o no entra nada.
    expect(todoElSql).toContain('BEGIN')
    expect(todoElSql).toContain('COMMIT')
    expect(pgFalso.cliente.release).toHaveBeenCalled()
  })

  it('archivar pasa las noticias como parámetros $n, nunca interpoladas en el SQL', async () => {
    await crearArchivador().archivar(estadoEjemplo)

    const [sql, valores] = pgFalso.cliente.query.mock.calls.find(([s]) => String(s).includes('INSERT INTO noticias'))
    // El SQL solo lleva placeholders; los datos (con comillas incluidas) van aparte.
    expect(sql).toContain('$1')
    expect(sql).not.toContain(noticiaEjemplo.titular)
    expect(valores).toContain(noticiaEjemplo.titular)
    expect(valores).toContain(noticiaEjemplo.url)
    // El extracto segmentado viaja serializado (columna JSONB).
    expect(valores).toContain(JSON.stringify(noticiaEjemplo.extracto))
  })

  it('registrarEjecucion inserta una fila de auditoría con los campos mapeados', async () => {
    await crearArchivador().registrarEjecucion({
      iniciadaEn: '2026-08-01T08:00:00.000Z',
      duracionMs: 2500,
      exito: true,
      noticiasPublicadas: 100,
      noticiasNuevas: 3,
      noticiasPrevias: 97,
      pasosOk: 10,
      pasosFallidos: 0,
      resumen: ['[OK] todo bien'],
    })

    const llamada = pgFalso.cliente.query.mock.calls.find(([s]) => String(s).includes('INSERT INTO colecta_ejecuciones'))
    expect(llamada).toBeDefined()
    const [sql, valores] = llamada
    // Un placeholder por columna, en el mismo orden que COLUMNAS_EJECUCION.
    expect(sql).toContain(COLUMNAS_EJECUCION.join(', '))
    expect(sql).toContain(`$${COLUMNAS_EJECUCION.length}`)
    expect(valores).toHaveLength(COLUMNAS_EJECUCION.length)
    expect(valores[COLUMNAS_EJECUCION.indexOf('iniciada_en')]).toBe('2026-08-01T08:00:00.000Z')
    expect(valores[COLUMNAS_EJECUCION.indexOf('exito')]).toBe(true)
    expect(valores[COLUMNAS_EJECUCION.indexOf('resumen')]).toBe(JSON.stringify(['[OK] todo bien']))
    expect(pgFalso.cliente.release).toHaveBeenCalled()
  })

  it('cerrar() cierra el pool de conexiones', async () => {
    const archivador = crearArchivador()
    await archivador.cerrar()
    expect(pgFalso.pool.end).toHaveBeenCalled()
  })

  it('un error de query se propaga al llamador tras el ROLLBACK (main.js decide, no el adaptador)', async () => {
    pgFalso.cliente.query = vi.fn(async (sql) => {
      if (String(sql).includes('INSERT INTO noticias')) throw new Error('falla simulada de la base')
      return { rows: [] }
    })

    await expect(crearArchivador().archivar(estadoEjemplo)).rejects.toThrow('falla simulada de la base')
    // La transacción se revierte y la conexión vuelve al pool, pero el error NO se traga.
    expect(sqlsEjecutados()).toContain('ROLLBACK')
    expect(sqlsEjecutados()).not.toContain('COMMIT')
    expect(pgFalso.cliente.release).toHaveBeenCalled()
  })

  it('aplica el esquema una sola vez por instancia, bajo advisory lock', async () => {
    const archivador = crearArchivador()
    await archivador.archivar(estadoEjemplo)
    await archivador.registrarEjecucion({ iniciadaEn: '2026-08-01T08:00:00.000Z', duracionMs: 1, exito: true })

    const conCandado = sqlsEjecutados().filter((s) => s.includes('pg_advisory_lock'))
    expect(conCandado).toHaveLength(1) // la segunda operación no re-aplica el esquema
    expect(sqlsEjecutados()).toContain('-- esquema de prueba\nSELECT 1;\n')
  })
})
