import { describe, expect, it } from 'vitest'
import { agruparEventos, buscarEvento, sentimientoPredominante } from './eventos.js'

const noticia = (id, extra = {}) => ({
  id,
  url: `https://medio.cl/${id}`,
  titular: `Titular ${id}`,
  medioNombre: 'Medio A',
  fecha: '2026-08-01T10:00:00Z',
  fechaDeteccion: '2026-08-01T10:05:00Z',
  ...extra,
})

describe('agruparEventos', () => {
  it('ignora las noticias sin eventId', () => {
    expect(agruparEventos([noticia('a'), noticia('b')])).toEqual([])
  })

  it('devuelve [] con entrada vacía o nula', () => {
    expect(agruparEventos([])).toEqual([])
    expect(agruparEventos(null)).toEqual([])
    expect(agruparEventos(undefined)).toEqual([])
  })

  it('agrupa por eventId y cuenta medios distintos', () => {
    const eventos = agruparEventos([
      noticia('a', { eventId: 'evt:https://medio.cl/a', medioNombre: 'Emol' }),
      noticia('b', { eventId: 'evt:https://medio.cl/a', medioNombre: 'La Tercera' }),
      noticia('c', { eventId: 'evt:https://medio.cl/a', medioNombre: 'Emol' }),
    ])

    expect(eventos).toHaveLength(1)
    expect(eventos[0].noticias).toHaveLength(3)
    expect(eventos[0].medios).toEqual(['Emol', 'La Tercera'])
  })

  it('ordena las noticias del evento con la más reciente arriba', () => {
    const eventos = agruparEventos([
      noticia('vieja', { eventId: 'evt:x', fecha: '2026-08-01T08:00:00Z' }),
      noticia('nueva', { eventId: 'evt:x', fecha: '2026-08-03T08:00:00Z' }),
      noticia('media', { eventId: 'evt:x', fecha: '2026-08-02T08:00:00Z' }),
    ])

    expect(eventos[0].noticias.map((n) => n.id)).toEqual(['nueva', 'media', 'vieja'])
  })

  it('toma como título y fecha del evento los de su noticia más reciente', () => {
    const eventos = agruparEventos([
      noticia('vieja', { eventId: 'evt:x', fecha: '2026-08-01T08:00:00Z', titular: 'Primer reporte' }),
      noticia('nueva', { eventId: 'evt:x', fecha: '2026-08-03T08:00:00Z', titular: 'Último reporte' }),
    ])

    expect(eventos[0].titulo).toBe('Último reporte')
    expect(eventos[0].fecha).toBe('2026-08-03T08:00:00Z')
  })

  it('ordena los eventos por última actividad, el más reciente primero', () => {
    const eventos = agruparEventos([
      noticia('a', { eventId: 'evt:viejo', fecha: '2026-08-01T08:00:00Z' }),
      noticia('b', { eventId: 'evt:nuevo', fecha: '2026-08-05T08:00:00Z' }),
    ])

    expect(eventos.map((e) => e.eventId)).toEqual(['evt:nuevo', 'evt:viejo'])
  })

  it('toma la importancia máxima del grupo y cuenta los sentimientos', () => {
    const eventos = agruparEventos([
      noticia('a', { eventId: 'evt:x', analisis: { importancia: 40, sentimiento: 'negativa' } }),
      noticia('b', { eventId: 'evt:x', analisis: { importancia: 75, sentimiento: 'negativa' } }),
      noticia('c', { eventId: 'evt:x', analisis: { importancia: 10, sentimiento: 'neutra' } }),
    ])

    expect(eventos[0].importancia).toBe(75)
    expect(eventos[0].sentimientos).toEqual({ negativa: 2, neutra: 1 })
  })

  it('no se cae con noticias sin analisis ni fecha', () => {
    const eventos = agruparEventos([
      noticia('a', { eventId: 'evt:x', fecha: null, analisis: null }),
      noticia('b', { eventId: 'evt:x' }),
    ])

    expect(eventos[0].noticias).toHaveLength(2)
    expect(eventos[0].importancia).toBe(0)
  })

  it('conserva titulares casi idénticos (no deduplica dentro del evento)', () => {
    const eventos = agruparEventos([
      noticia('a', { eventId: 'evt:x', titular: 'Incendio en Ñuble', medioNombre: 'Emol' }),
      noticia('b', { eventId: 'evt:x', titular: 'Incendio en Ñuble', medioNombre: 'La Tercera' }),
    ])

    expect(eventos[0].noticias).toHaveLength(2)
  })
})

describe('buscarEvento', () => {
  const eventos = agruparEventos([noticia('a', { eventId: 'evt:https://medio.cl/a?ref=1' })])

  it('encuentra el evento por su id literal, con caracteres raros incluidos', () => {
    expect(buscarEvento(eventos, 'evt:https://medio.cl/a?ref=1')?.eventId).toBe('evt:https://medio.cl/a?ref=1')
  })

  it('devuelve null si el evento ya no está en la ventana', () => {
    expect(buscarEvento(eventos, 'evt:inexistente')).toBeNull()
    expect(buscarEvento(eventos, '')).toBeNull()
    expect(buscarEvento(eventos, null)).toBeNull()
  })
})

describe('sentimientoPredominante', () => {
  it('exige mayoría absoluta', () => {
    expect(sentimientoPredominante({ positiva: 3, neutra: 1 })).toBe('positiva')
    expect(sentimientoPredominante({ negativa: 3, positiva: 1 })).toBe('negativa')
  })

  it('devuelve neutra cuando la cobertura está dividida', () => {
    expect(sentimientoPredominante({ positiva: 2, negativa: 2 })).toBe('neutra')
    expect(sentimientoPredominante({})).toBe('neutra')
    expect(sentimientoPredominante(null)).toBe('neutra')
  })
})
