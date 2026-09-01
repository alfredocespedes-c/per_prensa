import { describe, expect, it } from 'vitest'
import * as entidades from '../src/dominio/entidades.js'
import { extraerOrganizaciones } from '../src/dominio/entidades.js'

describe('extracción de personas: eliminada a propósito', () => {
  it('el módulo NO expone ninguna forma de extraer nombres de personas', () => {
    // Guarda de la política de datos personales, no una prueba de implementación. El
    // tono se atribuye a la NOTICIA, nunca a las personas que aparecen en ella; si el
    // dato se produjera, bastaría una vista futura para construir el vínculo
    // "persona ↔ cobertura negativa". La forma de impedirlo es no producirlo.
    expect(entidades.extraerPersonas).toBeUndefined()
    expect(Object.keys(entidades).filter((n) => /persona/i.test(n))).toEqual([])
  })
})

describe('extraerOrganizaciones', () => {
  it('extrae organizaciones del gazetteer sin importar mayúsculas', () => {
    const orgs = extraerOrganizaciones('CONAF y bomberos junto a SENAPRED')
    expect(orgs).toContain('bomberos')
    expect(orgs).toContain('senapred')
    expect(orgs).toContain('conaf')
  })

  it('CARACTERIZACIÓN: la deduplicación es sensible a mayúsculas (CONAF sale dos veces)', () => {
    // Posible bug: la vía gazetteer agrega el token en minúsculas ("conaf") y la vía
    // de siglas agrega el literal del texto ("CONAF"); el Set no los une porque
    // difieren en caja. La misma organización aparece duplicada con distinta grafía.
    expect(extraerOrganizaciones('CONAF y bomberos junto a SENAPRED'))
      .toEqual(['CONAF', 'bomberos', 'conaf', 'senapred'])
  })

  it('las siglas en mayúsculas (2-6 letras) entran aunque no estén en el gazetteer', () => {
    // Red de captura de siglas desconocidas; ONU está en la lista de exclusión de la
    // vía de siglas pero entra igual en minúsculas porque también está en el gazetteer.
    expect(extraerOrganizaciones('la sigla XYZ apareció junto a ONU')).toEqual(['XYZ', 'onu'])
  })

  it('deduplica repeticiones de la misma grafía', () => {
    expect(extraerOrganizaciones('bomberos y más bomberos con Bomberos')).toEqual(['bomberos'])
  })

  it('respeta el tope maxOrgs', () => {
    const texto = 'conaf carabineros fach armada senapred sernafor minagri mma municipalidad brigada'
    expect(extraerOrganizaciones(texto)).toHaveLength(8)
    expect(extraerOrganizaciones(texto, 3)).toHaveLength(3)
  })

  it('texto vacío, null o no-string devuelve lista vacía sin lanzar', () => {
    expect(extraerOrganizaciones('')).toEqual([])
    expect(extraerOrganizaciones(null)).toEqual([])
    expect(extraerOrganizaciones(undefined)).toEqual([])
  })
})
