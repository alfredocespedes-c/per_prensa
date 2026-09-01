// Tests de caracterización del histórico local (localStorage).
// Regla de negocio: acumular toda noticia vista sin duplicar, sobrevivir a
// datos corruptos (nunca romper la página por el histórico) y acotar el
// tamaño para no chocar con la cuota del localStorage.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  actualizarHistoricoLocal,
  obtenerHistoricoLocal,
  limpiarHistoricoLocal,
} from './historico-local.js'

const CLAVE = 'coipo-historico-local'

function noticia(id, extra = {}) {
  return {
    id,
    url: `https://ejemplo.cl/${id}`,
    medioId: 'mercurio',
    medioNombre: 'El Mercurio',
    seccionId: 'nacional',
    titular: `Titular ${id}`,
    fecha: '2026-01-15T10:00:00Z',
    analisis: null,
    ...extra,
  }
}

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('historico-local', () => {
  it('guarda y lee round-trip, sellando primeraVista y ultimaVista', () => {
    actualizarHistoricoLocal([noticia('a'), noticia('b')])
    const registros = obtenerHistoricoLocal()
    expect(registros).toHaveLength(2)
    const a = registros.find(r => r.id === 'a')
    expect(a).toMatchObject({
      id: 'a',
      url: 'https://ejemplo.cl/a',
      titular: 'Titular a',
      seccionId: 'nacional',
    })
    expect(a.primeraVista).toBe(a.ultimaVista)
  })

  it('ver de nuevo la misma noticia NO duplica: actualiza ultimaVista y conserva primeraVista', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-15T10:00:00Z'))
    actualizarHistoricoLocal([noticia('a')])
    vi.setSystemTime(new Date('2026-01-15T12:00:00Z'))
    actualizarHistoricoLocal([noticia('a')])

    const registros = obtenerHistoricoLocal()
    expect(registros).toHaveLength(1)
    expect(registros[0].primeraVista).toBe('2026-01-15T10:00:00.000Z')
    expect(registros[0].ultimaVista).toBe('2026-01-15T12:00:00.000Z')
  })

  it('si la noticia gana análisis después de entrar al histórico, lo incorpora', () => {
    actualizarHistoricoLocal([noticia('a')]) // entra sin análisis
    actualizarHistoricoLocal([
      noticia('a', { analisis: { sentimiento: 'negativa', riesgo: 'alto', categorias: ['emergencias'], importancia: 'alta' } }),
    ])
    const [registro] = obtenerHistoricoLocal()
    expect(registro.sentimiento).toBe('negativa')
    expect(registro.riesgo).toBe('alto')
  })

  it('la lectura devuelve lo más recientemente visto primero', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-15T10:00:00Z'))
    actualizarHistoricoLocal([noticia('vieja')])
    vi.setSystemTime(new Date('2026-01-15T12:00:00Z'))
    actualizarHistoricoLocal([noticia('nueva')])
    expect(obtenerHistoricoLocal().map(r => r.id)).toEqual(['nueva', 'vieja'])
  })

  it('JSON corrupto en la clave no lanza: se parte de un histórico vacío', () => {
    localStorage.setItem(CLAVE, '{esto no es json')
    expect(obtenerHistoricoLocal()).toEqual([])
    // Y se puede volver a escribir encima sin arrastrar la corrupción.
    actualizarHistoricoLocal([noticia('a')])
    expect(obtenerHistoricoLocal()).toHaveLength(1)
  })

  it('una versión de esquema desconocida se descarta y se parte de cero', () => {
    localStorage.setItem(CLAVE, JSON.stringify({ version: 99, noticias: { x: { id: 'x' } } }))
    expect(obtenerHistoricoLocal()).toEqual([])
  })

  it('migra el esquema v1: renombra el typo "ultimalVista" a "ultimaVista"', () => {
    localStorage.setItem(
      CLAVE,
      JSON.stringify({
        version: 1,
        noticias: {
          x: { id: 'x', titular: 'Vieja', primeraVista: '2026-01-01T00:00:00.000Z', ultimalVista: '2026-01-02T00:00:00.000Z' },
        },
      })
    )
    const [registro] = obtenerHistoricoLocal()
    expect(registro.ultimaVista).toBe('2026-01-02T00:00:00.000Z')
    expect(registro).not.toHaveProperty('ultimalVista')
  })

  it('respeta el tope de 2000 registros podando lo visto hace más tiempo', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-15T10:00:00Z'))
    const lote = Array.from({ length: 2000 }, (_, i) => noticia(`n${i}`))
    actualizarHistoricoLocal(lote)
    vi.setSystemTime(new Date('2026-01-15T12:00:00Z'))
    actualizarHistoricoLocal([noticia('extra')])

    const registros = obtenerHistoricoLocal()
    expect(registros).toHaveLength(2000) // no crece más allá del tope
    expect(registros[0].id).toBe('extra') // la recién vista sobrevive a la poda
  })

  it('limpiar borra todo el histórico', () => {
    actualizarHistoricoLocal([noticia('a')])
    limpiarHistoricoLocal()
    expect(obtenerHistoricoLocal()).toEqual([])
    expect(localStorage.getItem(CLAVE)).toBeNull()
  })

  it('lista vacía o nula no toca lo guardado', () => {
    actualizarHistoricoLocal([noticia('a')])
    actualizarHistoricoLocal([])
    actualizarHistoricoLocal(null)
    expect(obtenerHistoricoLocal()).toHaveLength(1)
  })
})
