import { describe, expect, it } from 'vitest'
import { fusionar } from '../src/dominio/ventana.js'

let contador = 0
function noticia({ fecha, deteccion, id, medioId = 'm1' } = {}) {
  contador += 1
  return {
    id: id ?? `https://m.cl/${contador}`,
    medioId,
    titular: `Titular ${id ?? contador}`,
    fecha: fecha ?? '2026-07-13T10:00:00.000Z',
    fechaDeteccion: deteccion ?? fecha ?? '2026-07-13T10:00:00.000Z',
  }
}

function fechaIso(horasDesdeBase) {
  return new Date(Date.parse('2026-07-01T00:00:00.000Z') + horasDesdeBase * 3600_000).toISOString()
}

describe('fusionar', () => {
  it('respeta el tope y expulsa las más antiguas', () => {
    const previas = Array.from({ length: 90 }, (_, i) => noticia({ fecha: fechaIso(i) }))
    const nuevas = Array.from({ length: 20 }, (_, i) => noticia({ fecha: fechaIso(200 + i) }))
    const resultado = fusionar(previas, nuevas, 100)
    expect(resultado).toHaveLength(100)
    // Las 20 nuevas (más recientes) están, y salieron las 10 previas más antiguas.
    expect(resultado.filter((n) => Date.parse(n.fecha) >= Date.parse(fechaIso(200)))).toHaveLength(20)
    expect(resultado.some((n) => n.fecha === fechaIso(0))).toBe(false)
    expect(resultado.some((n) => n.fecha === fechaIso(9))).toBe(false)
    expect(resultado.some((n) => n.fecha === fechaIso(10))).toBe(true)
  })

  it('una noticia previa que ya no viene en el feed permanece', () => {
    const vieja = noticia({ fecha: fechaIso(1), id: 'https://m.cl/vieja' })
    const nuevas = [noticia({ fecha: fechaIso(5) })]
    const resultado = fusionar([vieja], nuevas, 100)
    expect(resultado.some((n) => n.id === 'https://m.cl/vieja')).toBe(true)
  })

  it('ante colisión de URL conserva la versión previa (idempotencia)', () => {
    const previa = { ...noticia({ fecha: fechaIso(1), id: 'https://m.cl/x' }), extracto: 'original' }
    const reFetcheada = { ...noticia({ fecha: fechaIso(1), id: 'https://m.cl/x' }), extracto: 'recalculado', fechaDeteccion: fechaIso(9) }
    const resultado = fusionar([previa], [reFetcheada], 100)
    expect(resultado).toHaveLength(1)
    expect(resultado[0].extracto).toBe('original')
  })

  it('re-fusionar la salida con las mismas nuevas no cambia nada (idempotencia)', () => {
    const previas = [noticia({ fecha: fechaIso(3) }), noticia({ fecha: fechaIso(2) })]
    const nuevas = [noticia({ fecha: fechaIso(4) })]
    const primera = fusionar(previas, nuevas, 100)
    const segunda = fusionar(primera, nuevas, 100)
    expect(JSON.stringify(segunda)).toBe(JSON.stringify(primera))
  })

  it('ordena por fecha descendente', () => {
    const resultado = fusionar(
      [noticia({ fecha: fechaIso(1) })],
      [noticia({ fecha: fechaIso(3) }), noticia({ fecha: fechaIso(2) })],
      100,
    )
    const fechas = resultado.map((n) => n.fecha)
    expect(fechas).toEqual([...fechas].sort().reverse())
  })

  it('sin fecha del medio ordena por fecha de detección', () => {
    const sinFecha = { ...noticia({}), fecha: null, fechaDeteccion: fechaIso(10) }
    const conFecha = noticia({ fecha: fechaIso(5) })
    const resultado = fusionar([], [sinFecha, conFecha], 100)
    expect(resultado[0].fecha).toBe(fechaIso(5))
  })

  it('desempata de forma determinista sin importar el orden de entrada', () => {
    const a = noticia({ fecha: fechaIso(1), id: 'https://m.cl/a' })
    const b = noticia({ fecha: fechaIso(1), id: 'https://m.cl/b' })
    const directo = fusionar([], [a, b], 100).map((n) => n.id)
    const invertido = fusionar([], [b, a], 100).map((n) => n.id)
    expect(directo).toEqual(invertido)
  })
})
