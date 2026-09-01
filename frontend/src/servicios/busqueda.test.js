// Tests del buscador (MiniSearch). Antes hubo aquí una caracterización de un
// bug real (fields como objetos {name, weight} → índice vacío → toda búsqueda
// devolvía []); busqueda.js ya usa fields de strings + boost y estos tests
// exigen resultados reales.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { construirIndice, buscar, obtenerFacetas, filtrarNoticias } from './busqueda.js'

function noticia(extra = {}) {
  return {
    id: 'a',
    titular: 'CONAF combate incendio en Valparaíso',
    medioId: 'mercurio',
    medioNombre: 'El Mercurio',
    fecha: '2026-01-15T10:00:00Z',
    seccionId: 'nacional',
    analisis: {
      sentimiento: 'negativa',
      riesgo: 'alto',
      keywords: ['brigadas'],
      categorias: ['incendios-forestales'],
      regiones: ['valparaiso'],
      organizaciones: ['CONAF'],
      personas: [],
      lugares: [],
    },
    ...extra,
  }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('buscar', () => {
  beforeEach(() => {
    construirIndice([
      noticia(),
      noticia({ id: 'b', titular: 'Nueva ley de bosques avanza', analisis: null }),
    ])
  })

  it('consulta vacía o solo espacios devuelve lista vacía sin consultar el índice', () => {
    expect(buscar('')).toEqual([])
    expect(buscar('   ')).toEqual([])
  })

  it('consulta sin coincidencias devuelve lista vacía', () => {
    expect(buscar('astronomía')).toEqual([])
  })

  it('encuentra por palabra del titular, sin distinguir mayúsculas y con prefijo', () => {
    expect(buscar('incendio').map((r) => r.id)).toEqual(['a'])
    expect(buscar('INCENDIO').map((r) => r.id)).toEqual(['a'])
    expect(buscar('incend').map((r) => r.id)).toEqual(['a']) // prefix: true
  })

  it('encuentra por keywords del análisis y pondera el titular por encima', () => {
    expect(buscar('brigadas').map((r) => r.id)).toEqual(['a'])
    expect(buscar('bosques').map((r) => r.id)).toEqual(['b'])
  })

  it('reindexar con un dataset nuevo reemplaza el índice sin arrastrar el anterior', () => {
    // analisis: null para que el único término indexado sea el titular.
    construirIndice([noticia({ id: 'z', titular: 'Reforestación en Aysén', analisis: null })])
    expect(buscar('incendio')).toEqual([]) // lo del índice anterior ya no está
    expect(buscar('reforestación').map((r) => r.id)).toEqual(['z'])
  })
})

describe('obtenerFacetas', () => {
  it('cuenta por sección, medio y campos de análisis con un fixture mixto', () => {
    const facetas = obtenerFacetas([
      noticia(),
      noticia({ id: 'b', seccionId: 'regional', medioId: 'biobio', analisis: null }),
      noticia({ id: 'c' }),
    ])
    expect(facetas.secciones).toEqual({ nacional: 2, regional: 1 })
    expect(facetas.medios).toEqual({ mercurio: 2, biobio: 1 })
    expect(facetas.sentimientos).toEqual({ negativa: 2 })
    expect(facetas.riesgos).toEqual({ alto: 2 })
    expect(facetas.categorias).toEqual({ 'incendios-forestales': 2 })
    expect(facetas.regiones).toEqual({ valparaiso: 2 })
  })

  it('una noticia sin análisis solo aporta a sección y medio, sin lanzar', () => {
    const facetas = obtenerFacetas([noticia({ analisis: null })])
    expect(facetas.secciones).toEqual({ nacional: 1 })
    expect(facetas.sentimientos).toEqual({})
    expect(facetas.categorias).toEqual({})
  })

  it('lista vacía produce todas las facetas vacías', () => {
    expect(obtenerFacetas([])).toEqual({
      secciones: {},
      medios: {},
      sentimientos: {},
      categorias: {},
      regiones: {},
      riesgos: {},
    })
  })
})

describe('filtrarNoticias', () => {
  const lista = [
    noticia(),
    noticia({ id: 'b', seccionId: 'regional', medioId: 'biobio', analisis: null }),
  ]

  it('sin filtros devuelve todo tal cual', () => {
    expect(filtrarNoticias(lista)).toHaveLength(2)
    expect(filtrarNoticias(lista, {})).toHaveLength(2)
  })

  it('cada filtro activo descarta lo que no calza; filtrar por análisis excluye a las noticias sin análisis', () => {
    expect(filtrarNoticias(lista, { seccion: 'nacional' }).map(n => n.id)).toEqual(['a'])
    expect(filtrarNoticias(lista, { medio: 'biobio' }).map(n => n.id)).toEqual(['b'])
    expect(filtrarNoticias(lista, { sentimiento: 'negativa' }).map(n => n.id)).toEqual(['a'])
    expect(filtrarNoticias(lista, { categoria: 'incendios-forestales' }).map(n => n.id)).toEqual(['a'])
    expect(filtrarNoticias(lista, { region: 'valparaiso' }).map(n => n.id)).toEqual(['a'])
  })

  it('el rango de fechas es inclusivo en los bordes exactos', () => {
    const filtrado = filtrarNoticias(lista, {
      fechaDesde: '2026-01-15T10:00:00Z',
      fechaHasta: '2026-01-15T10:00:00Z',
    })
    expect(filtrado).toHaveLength(2)
    expect(filtrarNoticias(lista, { fechaHasta: '2026-01-14T00:00:00Z' })).toEqual([])
  })

  it('el período rápido "hoy" usa el día calendario de Chile, no una ventana de 24 h', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-15T12:00:00Z')) // 15 ene 09:00 en Chile
    const ayerEnChile = noticia({ id: 'y', fecha: '2026-01-15T02:00:00Z' }) // 14 ene 23:00 Chile
    const conAyer = [...lista, ayerEnChile]

    expect(filtrarNoticias(conAyer, { periodo: 'hoy' }).map(n => n.id)).toEqual(['a', 'b'])
    expect(filtrarNoticias(conAyer, { periodo: 'hoy-ayer' }).map(n => n.id)).toEqual(['a', 'b', 'y'])
  })
})
