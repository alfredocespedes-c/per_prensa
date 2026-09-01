// Tests de caracterización del catálogo de etiquetas.
// Regla de negocio: el texto visible nunca se deriva "a mano" de un id del
// collector (se perderían tildes y siglas); el catálogo es la fuente y el
// fallback capitalizado existe solo para ids nuevos aún no catalogados.

import { describe, it, expect } from 'vitest'
import {
  etiquetaCategoria,
  etiquetaRegion,
  ETIQUETAS_CATEGORIAS,
  ETIQUETAS_REGIONES,
} from './etiquetas.js'

describe('etiquetaCategoria', () => {
  it('traduce ids conocidos a su etiqueta con tildes y siglas correctas', () => {
    expect(etiquetaCategoria('incendios-forestales')).toBe('Incendios forestales')
    expect(etiquetaCategoria('sbap-ley-21600')).toBe('SBAP / Ley 21.600')
    expect(etiquetaCategoria('manejo-bosques')).toBe('Manejo de bosques / Bosque nativo')
  })

  it('el id antiguo con typo "institucional-vacerias" mapea a la misma etiqueta que el correcto', () => {
    // Datos anteriores a VERSION_ANALISIS 2 traen el typo; ambos deben verse igual.
    expect(etiquetaCategoria('institucional-vacerias')).toBe(etiquetaCategoria('institucional-vocerias'))
    expect(etiquetaCategoria('institucional-vacerias')).toBe('Institucional / Vocerías')
  })

  it('un id desconocido cae al fallback capitalizado palabra a palabra (sin tildes)', () => {
    expect(etiquetaCategoria('nueva-categoria-rara')).toBe('Nueva Categoria Rara')
  })

  it('id nulo o indefinido devuelve cadena vacía sin lanzar', () => {
    expect(etiquetaCategoria(null)).toBe('')
    expect(etiquetaCategoria(undefined)).toBe('')
  })
})

describe('etiquetaRegion', () => {
  it('traduce ids de región a su nombre oficial con tildes', () => {
    expect(etiquetaRegion('valparaiso')).toBe('Valparaíso')
    expect(etiquetaRegion('nuble')).toBe('Ñuble')
    expect(etiquetaRegion('ohiggins')).toBe("O'Higgins")
    expect(etiquetaRegion('araucania')).toBe('La Araucanía')
  })

  it('una región desconocida cae al mismo fallback capitalizado', () => {
    expect(etiquetaRegion('isla-de-pascua')).toBe('Isla De Pascua')
  })
})

describe('catálogos completos', () => {
  it('el catálogo de regiones cubre las 16 regiones de Chile', () => {
    expect(Object.keys(ETIQUETAS_REGIONES)).toHaveLength(16)
  })

  it('el catálogo de categorías incluye el comodín "otro" y ninguna etiqueta vacía', () => {
    expect(ETIQUETAS_CATEGORIAS.otro).toBe('Otro')
    for (const etiqueta of Object.values(ETIQUETAS_CATEGORIAS)) {
      expect(etiqueta).not.toBe('')
    }
    for (const etiqueta of Object.values(ETIQUETAS_REGIONES)) {
      expect(etiqueta).not.toBe('')
    }
  })
})
