// Tests de caracterización de las agregaciones de analytics.
// Regla de negocio: los conteos alimentan Dashboard/Estadísticas y deben
// tolerar noticias sin análisis (analisis null) sin lanzar.

import { describe, it, expect, afterEach, vi } from 'vitest'
import {
  calcularKpis,
  agruparPorDia,
  agruparPorMedio,
  agruparPorCategoria,
  agruparPorSentimiento,
  topRegiones,
  promedios,
} from './agregaciones.js'

const AHORA = '2026-01-15T12:00:00Z'

afterEach(() => {
  vi.useRealTimers()
})

// Fixture: 5 noticias, una sin análisis (el enriquecimiento puede fallar o
// llegar después) y fechas repartidas en día/semana/mes.
const NOTICIAS = [
  {
    id: 'a',
    medioId: 'mercurio',
    medioNombre: 'El Mercurio',
    fecha: '2026-01-15T10:00:00Z', // hace 2 h
    analisis: {
      sentimiento: 'negativa',
      riesgo: 'alto',
      categorias: ['incendios-forestales'],
      regiones: ['valparaiso'],
      cantidadPalabras: 400,
      cantidadParrafos: 8,
      tiempoLectura: 2,
    },
  },
  {
    id: 'b',
    medioId: 'mercurio',
    medioNombre: 'El Mercurio',
    fecha: '2026-01-14T10:00:00Z', // hace ~1 día
    analisis: {
      sentimiento: 'positiva',
      riesgo: 'bajo',
      categorias: ['incendios-forestales', 'prevención'],
      regiones: ['valparaiso', 'biobio'],
      cantidadPalabras: 200,
      cantidadParrafos: 4,
      tiempoLectura: 1,
    },
  },
  {
    id: 'c',
    medioId: 'biobio',
    medioNombre: 'Radio Biobío',
    fecha: '2026-01-12T10:00:00Z', // dentro de la semana
    analisis: {
      sentimiento: 'neutra',
      riesgo: 'medio',
      categorias: ['parques-asp'],
      regiones: ['biobio'],
      cantidadPalabras: 300,
      cantidadParrafos: 6,
      tiempoLectura: 3,
    },
  },
  {
    id: 'd',
    medioId: 'biobio',
    medioNombre: 'Radio Biobío',
    fecha: '2025-12-25T10:00:00Z', // dentro del mes, fuera de la semana
    analisis: null, // sin análisis: no debe romper ninguna agregación
  },
  {
    id: 'e',
    medioId: 'tercera',
    medioNombre: 'La Tercera',
    fecha: '2025-11-01T10:00:00Z', // fuera del mes
    analisis: { sentimiento: 'negativa', riesgo: 'alto', categorias: [], regiones: [] },
  },
]

describe('calcularKpis', () => {
  it('cuenta noticias por ventana móvil de 24 h / 7 d / 30 d y medios distintos', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(AHORA))
    const kpis = calcularKpis(NOTICIAS)
    expect(kpis).toEqual({
      hoy: 1, // solo 'a' cae dentro de las últimas 24 h
      semana: 3, // a, b, c
      mes: 4, // + d
      criticas: 2, // riesgo alto: a, e
      negativas: 2, // a, e
      positivas: 1, // b
      medios: 3, // mercurio, biobio, tercera
    })
  })

  it('sin lista devuelve objeto vacío sin lanzar', () => {
    expect(calcularKpis(null)).toEqual({})
    expect(calcularKpis(undefined)).toEqual({})
  })
})

describe('agruparPorDia', () => {
  it('la serie temporal agrupa por día UTC del ISO y queda ordenada ascendente', () => {
    expect(agruparPorDia(NOTICIAS)).toEqual([
      { dia: '2025-11-01', cantidad: 1 },
      { dia: '2025-12-25', cantidad: 1 },
      { dia: '2026-01-12', cantidad: 1 },
      { dia: '2026-01-14', cantidad: 1 },
      { dia: '2026-01-15', cantidad: 1 },
    ])
  })

  it('lista vacía produce serie vacía', () => {
    expect(agruparPorDia([])).toEqual([])
  })
})

describe('agruparPorMedio', () => {
  it('cuenta por medio con su nombre visible, de mayor a menor', () => {
    expect(agruparPorMedio(NOTICIAS)).toEqual([
      { nombre: 'El Mercurio', cantidad: 2 },
      { nombre: 'Radio Biobío', cantidad: 2 },
      { nombre: 'La Tercera', cantidad: 1 },
    ])
  })
})

describe('agruparPorCategoria', () => {
  it('una noticia con varias categorías suma en cada una; sin análisis no aporta', () => {
    expect(agruparPorCategoria(NOTICIAS)).toEqual([
      { cat: 'incendios-forestales', cantidad: 2 },
      { cat: 'prevención', cantidad: 1 },
      { cat: 'parques-asp', cantidad: 1 },
    ])
  })

  it('lista vacía produce estructura vacía', () => {
    expect(agruparPorCategoria([])).toEqual([])
  })
})

describe('agruparPorSentimiento', () => {
  it('siempre devuelve los 4 sentimientos, con 0 si no hay casos; sin análisis no cuenta', () => {
    expect(agruparPorSentimiento(NOTICIAS)).toEqual([
      { sentimiento: 'positiva', cantidad: 1 },
      { sentimiento: 'neutra', cantidad: 1 },
      { sentimiento: 'negativa', cantidad: 2 },
      { sentimiento: 'mixta', cantidad: 0 },
    ])
  })
})

describe('topRegiones', () => {
  it('cuenta menciones por región ignorando noticias sin análisis', () => {
    expect(topRegiones(NOTICIAS)).toEqual([
      { region: 'valparaiso', freq: 2 },
      { region: 'biobio', freq: 2 },
    ])
  })
})

describe('promedios', () => {
  it('promedia solo sobre las noticias que tienen análisis', () => {
    // a, b, c y e tienen análisis; e sin métricas aporta 0 al numerador.
    expect(promedios(NOTICIAS)).toEqual({
      palabras: Math.round(900 / 4),
      parrafos: Math.round(18 / 4),
      lectura: Math.round(6 / 4),
    })
  })

  it('lista vacía devuelve promedios en cero sin dividir por cero', () => {
    expect(promedios([])).toEqual({ palabras: 0, parrafos: 0, lectura: 0 })
  })
})
