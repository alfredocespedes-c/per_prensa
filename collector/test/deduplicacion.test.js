import { describe, expect, it } from 'vitest'
import { deduplicar } from '../src/dominio/deduplicacion.js'

function noticia(medioId, titular, id) {
  return { medioId, titular, id }
}

describe('deduplicar', () => {
  it('misma URL dos veces deja una (la primera)', () => {
    const a = noticia('m1', 'Titular A', 'https://m1.cl/a')
    const b = noticia('m1', 'Titular A bis', 'https://m1.cl/a')
    expect(deduplicar([a, b])).toEqual([a])
  })

  it('mismo medio + mismo titular (normalizado) con URL distinta deja una', () => {
    const a = noticia('m1', 'Incendio en Ñuble', 'https://m1.cl/a')
    const b = noticia('m1', '  incendio   en ñuble ', 'https://m1.cl/b')
    expect(deduplicar([a, b])).toEqual([a])
  })

  it('titulares que difieren solo en tildes cuentan como duplicados', () => {
    const a = noticia('m1', 'Fiscalización de leña', 'https://m1.cl/a')
    const b = noticia('m1', 'Fiscalizacion de lena', 'https://m1.cl/b')
    expect(deduplicar([a, b])).toHaveLength(1)
  })

  it('el mismo titular en medios DISTINTOS se conserva en ambos', () => {
    const a = noticia('el-dia', 'Vuelve el Desafío Trail en Fray Jorge', 'https://eldia.cl/x')
    const b = noticia('el-ovallino', 'Vuelve el Desafío Trail en Fray Jorge', 'https://ovallino.cl/y')
    expect(deduplicar([a, b])).toEqual([a, b])
  })

  it('lista vacía queda vacía', () => {
    expect(deduplicar([])).toEqual([])
  })
})
