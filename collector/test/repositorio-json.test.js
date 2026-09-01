import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { crearRepositorioJson } from '../src/adaptadores/repositorio-json.js'

// Persistencia real en un directorio temporal por test: el contrato del adaptador es
// contra el filesystem (escritura atómica .tmp + rename), no tiene gracia mockearlo.
describe('crearRepositorioJson', () => {
  let dir
  let ruta

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'repo-json-'))
    ruta = join(dir, 'noticias.json')
  })

  afterEach(() => rm(dir, { recursive: true, force: true }))

  it('guardar y cargar hacen round-trip del estado', async () => {
    const repo = crearRepositorioJson(ruta)
    const estado = { generadoEn: '2026-08-01T08:00:00.000Z', noticias: [{ id: 'n1', titular: 'CONAF' }] }

    await repo.guardar(estado)

    expect(await repo.cargar()).toEqual(estado)
  })

  it('cargar de un archivo inexistente devuelve null (primera corrida, sin estado previo)', async () => {
    expect(await crearRepositorioJson(join(dir, 'no-existe.json')).cargar()).toBe(null)
  })

  it('un JSON corrupto en disco hace fallar cargar (error fatal: no se pisan datos buenos)', async () => {
    await writeFile(ruta, '{esto no es json', 'utf8')
    await expect(crearRepositorioJson(ruta).cargar()).rejects.toThrow()
  })

  it('tras guardar no queda archivo .tmp residual (la escritura es atómica)', async () => {
    await crearRepositorioJson(ruta).guardar({ noticias: [] })
    expect(await readdir(dir)).toEqual(['noticias.json'])
  })

  it('guardar sobreescribe el contenido previo por completo', async () => {
    const repo = crearRepositorioJson(ruta)
    await repo.guardar({ noticias: [{ id: 'vieja' }] })
    await repo.guardar({ noticias: [{ id: 'nueva' }] })

    expect(await repo.cargar()).toEqual({ noticias: [{ id: 'nueva' }] })
  })

  it('crea los directorios intermedios de la ruta de salida si no existen', async () => {
    const anidada = join(dir, 'sub', 'carpeta', 'salida.json')
    await crearRepositorioJson(anidada).guardar({ ok: true })
    expect(JSON.parse(await readFile(anidada, 'utf8'))).toEqual({ ok: true })
  })

  it('lee de la ruta de entrada y escribe en la de salida cuando difieren', async () => {
    const salida = join(dir, 'salida.json')
    await writeFile(ruta, JSON.stringify({ origen: 'entrada' }), 'utf8')
    const repo = crearRepositorioJson(ruta, salida)

    expect(await repo.cargar()).toEqual({ origen: 'entrada' })
    await repo.guardar({ origen: 'salida' })

    // La entrada no se toca; la salida recibe el nuevo estado.
    expect(JSON.parse(await readFile(ruta, 'utf8'))).toEqual({ origen: 'entrada' })
    expect(JSON.parse(await readFile(salida, 'utf8'))).toEqual({ origen: 'salida' })
  })

  it('por defecto escribe pretty-print con salto final (diffs legibles en la rama data)', async () => {
    await crearRepositorioJson(ruta).guardar({ a: 1 })
    expect(await readFile(ruta, 'utf8')).toBe('{\n  "a": 1\n}\n')
  })

  it('con {compacto: true} escribe JSON compacto (historico.json ligero)', async () => {
    await crearRepositorioJson(ruta, ruta, { compacto: true }).guardar({ a: 1 })
    expect(await readFile(ruta, 'utf8')).toBe('{"a":1}')
  })
})
