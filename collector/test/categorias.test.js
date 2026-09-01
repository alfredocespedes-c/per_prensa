import { describe, expect, it } from 'vitest'
import { CATEGORIAS_TAXONOMIA, clasificarCategorias } from '../src/dominio/categorias.js'

describe('clasificarCategorias', () => {
  it('un texto claramente de incendios cae en "incendios-forestales"', () => {
    const cats = clasificarCategorias('El incendio avanzó y el fuego arrasó con llamas en el sector')
    expect(cats[0]).toBe('incendios-forestales')
  })

  it('una keyword de peso fuerte gana sobre varias débiles de otra categoría', () => {
    // "emergencia" pesa 3 en Emergencias; "parque" + "reserva" suman solo 2 en
    // Parques y ASP. La ponderación evita que muchas señales débiles tapen una fuerte.
    const cats = clasificarCategorias('emergencia en el parque y la reserva')
    expect(cats[0]).toBe('emergencias')
    expect(cats).toEqual(['emergencias', 'parques-asp'])
  })

  it('texto sin ninguna keyword devuelve lista vacía (no asigna "otro" por sí solo)', () => {
    // Caracterización: la taxonomía define la categoría "otro" como comodín, pero
    // clasificarCategorias nunca la devuelve (su lista de keywords está vacía y solo
    // entran categorías con puntaje > 0). Asignar "otro" queda a cargo del consumidor.
    expect(CATEGORIAS_TAXONOMIA.otro).toBeDefined()
    expect(clasificarCategorias('texto totalmente ajeno al rubro forestal')).toEqual([])
  })

  it('la detección es insensible a mayúsculas y tildes', () => {
    expect(clasificarCategorias('EVACUACIÓN masiva')).toEqual(['emergencias'])
    expect(clasificarCategorias('evacuacion masiva')).toEqual(['emergencias'])
  })

  it('devuelve como máximo maxCategorias, ordenadas por puntaje descendente', () => {
    const texto = 'incendio emergencia prevención quema ley fiscalización'
    expect(clasificarCategorias(texto)).toEqual(['incendios-forestales', 'emergencias', 'prevención'])
    expect(clasificarCategorias(texto, 2)).toEqual(['incendios-forestales', 'emergencias'])
  })

  it('el mismo texto produce siempre la misma clasificación (determinismo)', () => {
    // La página se regenera cada hora: una noticia no debe "saltar" de categoría
    // entre corridas si su texto no cambió.
    const texto = 'incendio forestal obligó a la evacuación del parque'
    const primera = clasificarCategorias(texto)
    for (let i = 0; i < 5; i++) {
      expect(clasificarCategorias(texto)).toEqual(primera)
    }
  })

  it('entrada vacía, null o no-string devuelve lista vacía sin lanzar', () => {
    expect(clasificarCategorias('')).toEqual([])
    expect(clasificarCategorias(null)).toEqual([])
    expect(clasificarCategorias(undefined)).toEqual([])
    expect(clasificarCategorias(123)).toEqual([])
  })
})
