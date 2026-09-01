// Cálculo de riesgo, tipo, prioridad e importancia.

import { tokenizar } from './analisis-texto.js'

const KEYWORDS_EMERGENCIA = new Set([
  'alerta',
  'emergencia',
  'fuera de control',
  'evacuación',
  'peligro',
  'crítico',
  'rojo',
  'severo',
  'urgente',
])

const KEYWORDS_INSTITUCIONAL = new Set([
  'comunicado',
  'anunció',
  'presenta',
  'inaugura',
  'capacitación',
  'coordinación',
])

const KEYWORDS_OPINION = new Set(['opinión', 'dice', 'considera', 'critica', 'defensa'])

export function calcularRiesgo(analisis, categorias) {
  if (!analisis || !analisis.sentimiento || !categorias) return 'medio'

  const esIncendioOEmergencia = categorias.some((c) => ['incendios-forestales', 'emergencias'].includes(c))
  const esNegativa = analisis.sentimiento === 'negativa'

  if (esIncendioOEmergencia && esNegativa && Math.abs(analisis.polaridad) > 0.5) {
    return 'alto'
  }
  if (esIncendioOEmergencia || (esNegativa && analisis.polaridad < -0.3)) {
    return 'medio'
  }
  return 'bajo'
}

export function calcularTipo(analisis, categorias, titular) {
  if (!categorias || !titular) return 'informativa'

  const titularLower = titular.toLowerCase()

  if (categorias.some((c) => ['emergencias', 'incendios-forestales'].includes(c))) {
    return 'emergencia'
  }
  if (
    categorias.some((c) => ['institucional-vocerias', 'comunicado'].includes(c)) ||
    titularLower.includes('comunicado') ||
    titularLower.includes('anunció')
  ) {
    return 'institucional'
  }
  if (categorias.some((c) => ['educacion-ambiental', 'prevención'].includes(c))) {
    return 'informativa'
  }
  // Si tiene sentimiento negativo fuerte y categoría relevante, podría ser crítica (opinion)
  if (analisis && analisis.sentimiento === 'negativa' && analisis.polaridad < -0.5) {
    return 'opinion'
  }
  return 'informativa'
}

export function calcularPrioridad(riesgo, sentimiento) {
  if (riesgo === 'alto') return 1
  if (riesgo === 'medio' || sentimiento === 'negativa') return 2
  return 3
}

export function calcularImportancia(riesgo, sentimiento, nMedios = 1) {
  let base = 50
  if (riesgo === 'alto') base += 30
  else if (riesgo === 'medio') base += 15
  if (sentimiento === 'negativa') base += 10
  else if (sentimiento === 'positiva') base += 5
  const factor = Math.min(nMedios, 10)
  const incremento = (factor - 1) * 3
  return Math.min(100, Math.max(0, base + incremento))
}
