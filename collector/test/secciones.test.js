import { describe, expect, it } from 'vitest'
import { SECCIONES, validarTipoDeMedio } from '../src/dominio/secciones.js'

describe('SECCIONES', () => {
  it('el catálogo no tiene ids duplicados', () => {
    // Cada id es la llave con la que los medios se cuelgan de una sección:
    // un duplicado partiría el boletín en dos secciones homónimas.
    const ids = SECCIONES.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('el catálogo no repite el orden de despliegue', () => {
    // `orden` define la secuencia de secciones del boletín; un empate dejaría
    // el orden al azar del array.
    const ordenes = SECCIONES.map((s) => s.orden)
    expect(new Set(ordenes).size).toBe(ordenes.length)
  })

  it('toda sección tiene id, nombre visible y orden numérico', () => {
    for (const seccion of SECCIONES) {
      expect(seccion.id, `sección sin id: ${JSON.stringify(seccion)}`).toBeTruthy()
      expect(seccion.nombre, `sección "${seccion.id}" sin nombre`).toBeTruthy()
      expect(typeof seccion.orden, `sección "${seccion.id}" sin orden numérico`).toBe('number')
    }
  })
})

describe('validarTipoDeMedio', () => {
  it('acepta cada tipo del catálogo y lo devuelve tal cual', () => {
    // La función es la compuerta que usa config/medios.js: debe dejar pasar
    // exactamente los ids del catálogo, sin transformarlos.
    for (const seccion of SECCIONES) {
      expect(validarTipoDeMedio(seccion.id)).toBe(seccion.id)
    }
  })

  it('rechaza un tipo desconocido lanzando un error que lista los válidos', () => {
    // El error debe servirle al admin que editó medios.js a mano: dice qué
    // llegó y cuáles son las opciones reales.
    expect(() => validarTipoDeMedio('diario')).toThrow(
      'Tipo de medio desconocido: "diario". Válidos: escrita, regional, radio, digital, tv, otros, internacional',
    )
  })

  it('rechaza variantes con mayúsculas o espacios (la validación es exacta)', () => {
    // No hay normalización: el admin debe escribir el id exacto en minúsculas.
    expect(() => validarTipoDeMedio('Radio')).toThrow(/Tipo de medio desconocido/)
    expect(() => validarTipoDeMedio(' radio')).toThrow(/Tipo de medio desconocido/)
    expect(() => validarTipoDeMedio(undefined)).toThrow(/Tipo de medio desconocido/)
  })
})
