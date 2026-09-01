import { describe, expect, it } from 'vitest'
import { detectarLugares, detectarRegiones } from '../src/dominio/geografia.js'

describe('detectarRegiones', () => {
  it('el nombre de una región chilena mapea a su id', () => {
    expect(detectarRegiones('gran incendio en Valparaíso')).toEqual(['valparaiso'])
  })

  it('la capital regional mapea a la región (Santiago → metropolitana, Temuco → araucania)', () => {
    expect(detectarRegiones('operativo en Santiago')).toEqual(['metropolitana'])
    expect(detectarRegiones('brigadistas llegaron a Temuco')).toEqual(['araucania'])
  })

  it('el gentilicio también mapea a la región (penquista → biobio)', () => {
    expect(detectarRegiones('un dirigente penquista criticó la medida')).toEqual(['biobio'])
  })

  it('es insensible a mayúsculas y tildes', () => {
    expect(detectarRegiones('TEMUCO')).toEqual(['araucania'])
    expect(detectarRegiones('en Valparaiso llueve')).toEqual(['valparaiso'])
  })

  it('múltiples regiones mencionadas se devuelven todas, ordenadas alfabéticamente por id', () => {
    // Caracterización: el orden de salida es alfabético por id, no el orden de
    // aparición en el texto (Santiago aparece primero pero araucania sale antes).
    expect(detectarRegiones('en Santiago y Temuco')).toEqual(['araucania', 'metropolitana'])
  })

  it('texto sin señal geográfica, vacío o null devuelve lista vacía sin lanzar', () => {
    expect(detectarRegiones('la reunión fue productiva')).toEqual([])
    expect(detectarRegiones('')).toEqual([])
    expect(detectarRegiones(null)).toEqual([])
    expect(detectarRegiones(undefined)).toEqual([])
  })

  it('CARACTERIZACIÓN: las capitales de nombre compuesto no se detectan (La Serena)', () => {
    // Posible limitación: la comparación es token a token, así que capitales de más
    // de una palabra ("la serena", "puerto montt", "punta arenas") nunca calzan.
    // Se fija el comportamiento actual; soportarlas requeriría comparar n-gramas.
    expect(detectarRegiones('vecinos de La Serena protestaron')).toEqual([])
  })
})

describe('detectarLugares', () => {
  it('extrae áreas protegidas con nombre compuesto capitalizado', () => {
    expect(detectarLugares('visitó el Parque Nacional Conguillío y la Reserva Nacional Malleco'))
      .toEqual(['Parque Nacional Conguillío', 'Reserva Nacional Malleco'])
  })

  it('solo conserva frases que contienen "parque" o "reserva"; el resto se descarta', () => {
    // Regla actual: los lugares de interés v1 son las ASP; otras frases
    // capitalizadas (ciudades, personas) no cuentan como lugar aquí.
    expect(detectarLugares('viajó desde Punta Arenas hasta el Monumento Natural Cerro Ñielol')).toEqual([])
  })

  it('texto vacío o null devuelve lista vacía sin lanzar', () => {
    expect(detectarLugares('')).toEqual([])
    expect(detectarLugares(null)).toEqual([])
  })
})
