import { describe, expect, it } from 'vitest'
import { analizarSentimiento } from '../src/dominio/sentimiento.js'

describe('analizarSentimiento', () => {
  it('texto con palabras positivas del lexicón clasifica como "positiva"', () => {
    // logro (+3) + avance (+2) + bueno (+2) = 7 sobre 3 tokens con carga.
    const r = analizarSentimiento('un gran logro y un avance bueno')
    expect(r.sentimiento).toBe('positiva')
    expect(r.score).toBe(7)
    expect(r.polaridad).toBeGreaterThan(0)
  })

  it('texto con palabras negativas clasifica como "negativa"', () => {
    // incendio (-2) + desastre (-3) + caos (-3) = -8.
    const r = analizarSentimiento('incendio provocó un desastre y caos')
    expect(r.sentimiento).toBe('negativa')
    expect(r.score).toBe(-8)
    expect(r.polaridad).toBeLessThan(0)
  })

  it('texto sin carga, vacío, null o no-string devuelve "neutra" con score 0', () => {
    const neutro = { sentimiento: 'neutra', polaridad: 0, score: 0 }
    expect(analizarSentimiento('la reunión se realizó en la sede')).toEqual(neutro)
    expect(analizarSentimiento('')).toEqual(neutro)
    expect(analizarSentimiento(null)).toEqual(neutro)
    expect(analizarSentimiento(undefined)).toEqual(neutro)
  })

  it('la negación invierte la polaridad: "no es bueno" resulta negativa', () => {
    // Regla real: un negador (no/sin/nunca/jamás…) hasta 3 tokens antes de la
    // palabra con carga multiplica su puntaje por -1. bueno (+2) → -2.
    const r = analizarSentimiento('no es bueno')
    expect(r.sentimiento).toBe('negativa')
    expect(r.score).toBe(-2)
  })

  it('un intensificador inmediatamente antes amplifica la carga x1.5', () => {
    // "muy bueno" = 2 * 1.5 = 3, más fuerte que "bueno" a secas (2).
    expect(analizarSentimiento('muy bueno').score).toBe(3)
    expect(analizarSentimiento('bueno').score).toBe(2)
    expect(analizarSentimiento('muy bueno').polaridad)
      .toBeGreaterThan(analizarSentimiento('bueno').polaridad)
  })

  it('es insensible a mayúsculas', () => {
    expect(analizarSentimiento('BUENO').sentimiento).toBe('positiva')
  })

  it('las entradas acentuadas del lexicón puntúan (con y sin tilde en el texto)', () => {
    // Hubo un bug en que las claves acentuadas del lexicón nunca calzaban (el
    // lookup normalizaba la palabra pero no las claves); ya corregido: las
    // claves se normalizan al construir el lexicón.
    expect(analizarSentimiento('un éxito de la restauración').sentimiento).toBe('positiva')
    expect(analizarSentimiento('un exito de la restauracion').sentimiento).toBe('positiva')
    expect(analizarSentimiento('grave daño al bosque').sentimiento).toBe('negativa')
  })

  it('con carga clara de ambos polos y polaridad alta clasifica como "mixta"', () => {
    // logro (+3) x2 y desastre (-3): hay evidencia de ambos polos y |polaridad| > 0.3.
    expect(analizarSentimiento('logro logro desastre').sentimiento).toBe('mixta')
  })
})
