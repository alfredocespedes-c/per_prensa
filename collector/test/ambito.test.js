import { describe, expect, it } from 'vitest'
import { determinarAmbito, esDominioExtranjero } from '../src/dominio/ambito.js'

describe('determinarAmbito', () => {
  it('región chilena detectada ⇒ regional, aunque el medio sea nacional', () => {
    expect(
      determinarAmbito({
        texto: 'Conaf reabre parques en La Araucanía tras el temporal',
        regiones: ['araucania'],
        url: 'https://www.latercera.com/nota',
      }),
    ).toBe('regional')
  })

  it('mención de Chile o entidad chilena sin región ⇒ nacional', () => {
    expect(
      determinarAmbito({
        texto: 'Gobierno anuncia nuevo presupuesto para Conaf el próximo año',
        regiones: [],
        url: 'https://www.latercera.com/nota',
      }),
    ).toBe('nacional')
  })

  it('medio extranjero con noticia sobre Chile ⇒ nacional', () => {
    expect(
      determinarAmbito({
        texto: 'Incendios en Chile: el gobierno decreta estado de catástrofe',
        regiones: [],
        url: 'https://www.infobae.com/nota',
      }),
    ).toBe('nacional')
  })

  it('país extranjero sin señal chilena ⇒ internacional, aunque el medio sea chileno', () => {
    expect(
      determinarAmbito({
        texto: 'Incendio forestal obliga a evacuar a 400 personas en Noruega',
        regiones: [],
        url: 'https://www.biobiochile.cl/nota',
      }),
    ).toBe('internacional')
  })

  it('lugar sub-nacional extranjero (Ibiza) ⇒ internacional', () => {
    expect(
      determinarAmbito({
        texto: 'Riesgo extremo de incendio forestal en Ibiza si no se aplican medidas',
        regiones: [],
        url: 'https://www.diariodeibiza.es/nota',
      }),
    ).toBe('internacional')
  })

  it('sin señales de texto: decide el dominio del medio', () => {
    expect(
      determinarAmbito({ texto: 'Consejos para el uso de leña seca', regiones: [], url: 'https://www.diariodeibiza.es/x' }),
    ).toBe('internacional')
    expect(
      determinarAmbito({ texto: 'Consejos para el uso de leña seca', regiones: [], url: 'https://www.latribuna.cl/x' }),
    ).toBe('nacional')
  })

  it('región chilena gana sobre mención extranjera (delegación de Biobío en España)', () => {
    expect(
      determinarAmbito({
        texto: 'Delegación de Biobío viaja a España por cooperación forestal',
        regiones: ['biobio'],
        url: 'https://www.latribuna.cl/x',
      }),
    ).toBe('regional')
  })
})

describe('esDominioExtranjero', () => {
  it('reconoce TLD de país extranjero y dominios .com de la lista', () => {
    expect(esDominioExtranjero('diariodeibiza.es')).toBe(true)
    expect(esDominioExtranjero('vietnam.vn')).toBe(true)
    expect(esDominioExtranjero('abc.com.py')).toBe(true)
    expect(esDominioExtranjero('infobae.com')).toBe(true)
    expect(esDominioExtranjero('telemundo49.com')).toBe(true)
  })

  it('no marca como extranjeros los .cl ni los .com chilenos conocidos', () => {
    expect(esDominioExtranjero('biobiochile.cl')).toBe(false)
    expect(esDominioExtranjero('elciudadano.com')).toBe(false)
    expect(esDominioExtranjero('radiopolar.com')).toBe(false)
    expect(esDominioExtranjero('cnnchile.com')).toBe(false)
  })
})
