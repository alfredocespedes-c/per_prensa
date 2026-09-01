import { describe, expect, it } from 'vitest'
import {
  calcularTiempoLectura,
  contarPalabras,
  contarParrafos,
  extraerKeywords,
  obtenerPalabrasClaveUnicas,
  tokenizar,
} from '../src/dominio/analisis-texto.js'

describe('tokenizar', () => {
  it('pasa a minúsculas y descarta la puntuación, pero CONSERVA las tildes', () => {
    // La normalización de tildes es responsabilidad de normalizarPalabra/extraerKeywords,
    // no del tokenizador: los tokens crudos salen acentuados.
    expect(tokenizar('Árbol quemado, según CONAF.')).toEqual(['árbol', 'quemado', 'según', 'conaf'])
  })

  it('entrada vacía, null o no-string devuelve lista vacía sin lanzar', () => {
    expect(tokenizar('')).toEqual([])
    expect(tokenizar(null)).toEqual([])
    expect(tokenizar(undefined)).toEqual([])
    expect(tokenizar(42)).toEqual([])
  })
})

describe('extraerKeywords', () => {
  it('las stopwords españolas no aparecen como keywords (bug v1: "que", "las", "los")', () => {
    // VERSION_ANALISIS v2 reescribió las stopwords porque la lista v1 dejaba pasar
    // "que", "las" y "los"; este test fija que no vuelvan a colarse.
    expect(extraerKeywords('que las los de un el')).toEqual([])
  })

  it('ordena por frecuencia descendente y normaliza tildes en la salida', () => {
    // "bosque" (x3) debe ir antes que "2024" (x2) y que las palabras que aparecen
    // una sola vez; "ardió" sale sin tilde porque las keywords se normalizan.
    const kw = extraerKeywords('el año 2024 tuvo 15 incendios en 2024 y el bosque bosque bosque ardió')
    expect(kw[0]).toBe('bosque')
    expect(kw[1]).toBe('2024')
    expect(kw).toContain('incendios')
    expect(kw).toContain('ardio')
  })

  it('ignora tokens de 1-2 caracteres, pero un número de 3+ dígitos SÍ entra como keyword', () => {
    // Caracterización: el filtro es solo por largo (>= 3) y stopwords, así que "15"
    // se descarta pero "2024" pasa como keyword. Si se quisiera excluir números
    // puros habría que agregar un filtro explícito (posible mejora, no implementada).
    const kw = extraerKeywords('en 2024 hubo 15 focos ab xy')
    expect(kw).toContain('2024')
    expect(kw).not.toContain('15')
    expect(kw).not.toContain('ab')
    expect(kw).not.toContain('xy')
  })

  it('respeta el tope maxKeywords', () => {
    const kw = extraerKeywords('lobo zorro puma cóndor huemul coipo', 3)
    expect(kw).toHaveLength(3)
  })

  it('entrada vacía, null o undefined devuelve lista vacía sin lanzar', () => {
    expect(extraerKeywords('')).toEqual([])
    expect(extraerKeywords(null)).toEqual([])
    expect(extraerKeywords(undefined)).toEqual([])
  })
})

describe('obtenerPalabrasClaveUnicas', () => {
  it('filtra stopwords, deduplica y ordena alfabéticamente (sensible a mayúsculas)', () => {
    // Caracterización: la deduplicación es literal, "Bosque" y "bosque" cuentan
    // como palabras distintas (aquí no se normaliza el token).
    expect(obtenerPalabrasClaveUnicas(['que', 'las', 'los', 'bosque', 'Bosque', 'incendio']))
      .toEqual(['Bosque', 'bosque', 'incendio'])
  })

  it('entrada que no es array devuelve lista vacía', () => {
    expect(obtenerPalabrasClaveUnicas(null)).toEqual([])
    expect(obtenerPalabrasClaveUnicas('bosque')).toEqual([])
  })
})

describe('contarPalabras y contarParrafos', () => {
  it('cuentan sobre texto real y devuelven 0 ante entrada vacía o null', () => {
    expect(contarPalabras('personal de CONAF llegó al lugar')).toBe(6)
    expect(contarPalabras(null)).toBe(0)
    expect(contarParrafos('uno\n\ndos\n\n\ntres')).toBe(3)
    expect(contarParrafos('')).toBe(0)
  })
})

describe('calcularTiempoLectura', () => {
  it('es coherente con el conteo de palabras a 220 palabras por minuto', () => {
    // Regla de negocio: lectura promedio de prensa a 220 ppm, redondeando hacia
    // arriba (una nota de 221 palabras ya "cuesta" 2 minutos).
    expect(calcularTiempoLectura(0)).toBe(0)
    expect(calcularTiempoLectura(220)).toBe(1)
    expect(calcularTiempoLectura(221)).toBe(2)
  })
})
