import { describe, expect, it } from 'vitest'
import { calcularImportancia, calcularPrioridad, calcularRiesgo, calcularTipo } from '../src/dominio/riesgo.js'

// `analisis` es el resultado de analizarSentimiento: { sentimiento, polaridad, score }.
function sentimiento(nivel, polaridad) {
  return { sentimiento: nivel, polaridad }
}

describe('calcularRiesgo', () => {
  it('emergencia con sentimiento negativo fuerte es riesgo alto', () => {
    // La combinación de señales (categoría crítica + tono muy negativo) es la
    // única que escala a "alto": ninguna señal sola basta.
    expect(calcularRiesgo(sentimiento('negativa', -0.6), ['incendios-forestales'])).toBe('alto')
    expect(calcularRiesgo(sentimiento('negativa', -0.6), ['emergencias'])).toBe('alto')
  })

  it('texto neutro sin categorías críticas es riesgo bajo (el mínimo)', () => {
    expect(calcularRiesgo(sentimiento('neutra', 0), [])).toBe('bajo')
    expect(calcularRiesgo(sentimiento('positiva', 0.4), ['educacion-ambiental'])).toBe('bajo')
  })

  it('cada señal por separado solo alcanza riesgo medio', () => {
    // Categoría de emergencia con tono neutro, o tono negativo sin categoría
    // crítica: ameritan atención pero no alarma.
    expect(calcularRiesgo(sentimiento('neutra', 0), ['incendios-forestales'])).toBe('medio')
    expect(calcularRiesgo(sentimiento('negativa', -0.4), ['institucional-vocerias'])).toBe('medio')
  })

  it('bordes exactos de los umbrales: los > y < son estrictos', () => {
    // Polaridad exactamente -0.5 con emergencia NO llega a alto (se exige |p| > 0.5)...
    expect(calcularRiesgo(sentimiento('negativa', -0.5), ['emergencias'])).toBe('medio')
    // ...y polaridad exactamente -0.3 sin categoría crítica NO llega a medio (se exige p < -0.3).
    expect(calcularRiesgo(sentimiento('negativa', -0.3), [])).toBe('bajo')
    expect(calcularRiesgo(sentimiento('negativa', -0.31), [])).toBe('medio')
  })

  it('sin datos suficientes cae al valor conservador "medio"', () => {
    // Ante análisis incompleto, ni minimizar (bajo) ni alarmar (alto).
    expect(calcularRiesgo(null, ['emergencias'])).toBe('medio')
    expect(calcularRiesgo(sentimiento('negativa', -0.9), null)).toBe('medio')
    expect(calcularRiesgo({}, [])).toBe('medio')
  })
})

describe('calcularTipo', () => {
  it('categoría de emergencia o incendio manda sobre todo lo demás', () => {
    expect(calcularTipo(sentimiento('positiva', 0.5), ['incendios-forestales'], 'Brigadas controlan incendio')).toBe('emergencia')
  })

  it('vocería o "comunicado"/"anunció" en el titular clasifica como institucional', () => {
    expect(calcularTipo(null, ['institucional-vocerias'], 'CONAF presenta plan')).toBe('institucional')
    expect(calcularTipo(null, [], 'Comunicado oficial sobre el parque')).toBe('institucional')
    expect(calcularTipo(null, [], 'Director anunció nuevas medidas')).toBe('institucional')
  })

  it('sin categorías o sin titular cae al tipo por defecto "informativa"', () => {
    expect(calcularTipo(sentimiento('negativa', -0.9), null, 'Titular')).toBe('informativa')
    expect(calcularTipo(sentimiento('negativa', -0.9), ['emergencias'], '')).toBe('informativa')
  })

  it('una crítica con sentimiento negativo fuerte clasifica como "opinion"', () => {
    // Hubo un typo (`analisis.polarida`) que dejaba esta rama inalcanzable;
    // ya corregido: polaridad < -0.5 con sentimiento negativo → opinion.
    expect(calcularTipo({ sentimiento: 'negativa', polaridad: -0.9 }, ['otra-categoria'], 'Dura crítica a la gestión')).toBe('opinion')
    // En el borde (-0.5 no es estrictamente menor) sigue siendo informativa.
    expect(calcularTipo({ sentimiento: 'negativa', polaridad: -0.5 }, ['otra-categoria'], 'Crítica moderada')).toBe('informativa')
  })
})

describe('calcularPrioridad', () => {
  it('mapea riesgo a prioridad 1-3, con el sentimiento negativo como agravante', () => {
    // 1 = revisar primero en el boletín de las 8:00.
    expect(calcularPrioridad('alto', 'neutra')).toBe(1)
    expect(calcularPrioridad('medio', 'positiva')).toBe(2)
    // Riesgo bajo pero tono negativo también sube a 2: no se debe enterrar una crítica.
    expect(calcularPrioridad('bajo', 'negativa')).toBe(2)
    expect(calcularPrioridad('bajo', 'neutra')).toBe(3)
  })
})

describe('calcularImportancia', () => {
  it('parte de una base 50 y suma por riesgo y sentimiento', () => {
    expect(calcularImportancia('bajo', 'neutra')).toBe(50)
    expect(calcularImportancia('alto', 'neutra')).toBe(80)
    expect(calcularImportancia('medio', 'neutra')).toBe(65)
    expect(calcularImportancia('bajo', 'negativa')).toBe(60)
    expect(calcularImportancia('bajo', 'positiva')).toBe(55)
  })

  it('las señales combinadas suman entre sí y con la cobertura multi-medio', () => {
    // riesgo alto (+30) + negativa (+10) = 90; cada medio extra suma 3.
    expect(calcularImportancia('alto', 'negativa', 1)).toBe(90)
    expect(calcularImportancia('medio', 'positiva', 2)).toBe(73)
  })

  it('el puntaje se acota a 100 y la cobertura satura en 10 medios', () => {
    // 50+30+10+(10-1)*3 = 117 → tope 100; más de 10 medios no agrega nada.
    expect(calcularImportancia('alto', 'negativa', 10)).toBe(100)
    expect(calcularImportancia('alto', 'negativa', 50)).toBe(100)
    expect(calcularImportancia('bajo', 'neutra', 10)).toBe(calcularImportancia('bajo', 'neutra', 12))
  })
})
