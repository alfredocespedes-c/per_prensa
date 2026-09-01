import { describe, expect, it, vi } from 'vitest'
import { purgar } from '../src/purga.js'
import {
  RETENCION_EJECUCIONES_DIAS,
  RETENCION_EXTRACTO_DIAS,
  RETENCION_METADATOS_DIAS,
} from '../src/config/parametros.js'

const AHORA = new Date('2026-08-11T06:30:00Z')

function purgadorFalso({ extractos = 0, noticias = 0, ejecuciones = 0 } = {}) {
  const llamadas = []
  return {
    llamadas,
    purgarExtractos: vi.fn(async (corte, opciones) => {
      llamadas.push({ operacion: 'extractos', corte, opciones })
      return extractos
    }),
    purgarNoticias: vi.fn(async (corte, opciones) => {
      llamadas.push({ operacion: 'noticias', corte, opciones })
      return noticias
    }),
    purgarEjecuciones: vi.fn(async (corte, opciones) => {
      llamadas.push({ operacion: 'ejecuciones', corte, opciones })
      return ejecuciones
    }),
    registrarPurga: vi.fn(async () => {}),
    cerrar: vi.fn(async () => {}),
  }
}

const dias = (fecha) => Math.round((AHORA - fecha) / 86_400_000)

describe('purgar (composición)', () => {
  it('purga el texto ANTES de borrar filas', async () => {
    // Al revés, las filas que cruzan los 400 días se borrarían primero y el contador de
    // extractos purgados mentiría por defecto: habría contado como "texto purgado" filas
    // que en realidad desaparecieron enteras.
    const purgador = purgadorFalso()
    await purgar({ ahora: AHORA, purgador, simulacion: true })

    expect(purgador.llamadas.map((l) => l.operacion)).toEqual([
      'extractos',
      'noticias',
      'ejecuciones',
    ])
  })

  it('aplica a cada operación el corte que le corresponde', async () => {
    const purgador = purgadorFalso()
    await purgar({ ahora: AHORA, purgador, simulacion: true })

    const corteDe = (operacion) => purgador.llamadas.find((l) => l.operacion === operacion).corte
    expect(dias(corteDe('extractos'))).toBe(RETENCION_EXTRACTO_DIAS)
    expect(dias(corteDe('noticias'))).toBe(RETENCION_METADATOS_DIAS)
    expect(dias(corteDe('ejecuciones'))).toBe(RETENCION_EJECUCIONES_DIAS)
  })

  it('propaga el modo simulación a las tres operaciones', async () => {
    // Si una sola no lo recibiera, un --dry-run borraría de verdad.
    const purgador = purgadorFalso()
    await purgar({ ahora: AHORA, purgador, simulacion: true })

    expect(purgador.llamadas.every((l) => l.opciones.simulacion === true)).toBe(true)
  })

  it('devuelve los conteos y un resumen coherente', async () => {
    const purgador = purgadorFalso({ extractos: 120, noticias: 7, ejecuciones: 24 })
    const resultado = await purgar({ ahora: AHORA, purgador, simulacion: false })

    expect(resultado.extractosPurgados).toBe(120)
    expect(resultado.noticiasBorradas).toBe(7)
    expect(resultado.ejecucionesBorradas).toBe(24)
    expect(resultado.exito).toBe(true)
    expect(resultado.simulacion).toBe(false)
    expect(resultado.iniciadaEn).toBe(AHORA.toISOString())
    expect(resultado.resumen.join('\n')).toContain('120')
  })

  it('no toca la base si la configuración de retención es incoherente', async () => {
    // calcularCortes valida ANTES de la primera operación: con parámetros malos el
    // proceso muere sin haber borrado nada.
    const purgador = purgadorFalso()
    const fechaInvalida = new Date('no-es-fecha')

    await expect(purgar({ ahora: fechaInvalida, purgador, simulacion: false })).rejects.toThrow()
    expect(purgador.purgarExtractos).not.toHaveBeenCalled()
    expect(purgador.purgarNoticias).not.toHaveBeenCalled()
  })
})
