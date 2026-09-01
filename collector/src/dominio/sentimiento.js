// Análisis de sentimiento con lexicón español puro.

import { tokenizar, normalizarPalabra } from './analisis-texto.js'

const LEXICON_SENTIMIENTO = {
  positivos: {
    // fuego/bosques (positivo)
    'éxito': 3,
    'controlado': 2,
    'inauguración': 2,
    'restauración': 3,
    'plantación': 2,
    'conservación': 2,
    'recuperación': 2,
    'prevención': 1,
    'reforestación': 3,
    'mejora': 2,
    'logro': 3,
    'avance': 2,
    'cooperación': 2,
    'alianza': 2,
    'coordinación': 1,
    'educación': 1,
    'capacitación': 1,
    'protección': 2,
    'seguridad': 1,
    'aumento': 1,
    'incremento': 1,
    'expansión': 1,
    'desarrollo': 1,
    'beneficio': 2,
    'ventaja': 2,
    'positivo': 2,
    'bueno': 2,
    'mejor': 2,
    'excelente': 3,
    'magnífico': 3,
    'maravilloso': 3,
    'fantástico': 2,
    'genial': 2,
  },
  negativos: {
    // fuego/bosques (negativo)
    'incendio': -2,
    'emergencia': -2,
    'alerta': -1,
    'fuera de control': -3,
    'evacuación': -3,
    'destrucción': -3,
    'daño': -2,
    'pérdida': -2,
    'desastre': -3,
    'catástrofe': -3,
    'crisis': -2,
    'amenaza': -2,
    'peligro': -2,
    'riesgo': -1,
    'amenazado': -2,
    'crítico': -1,
    'gravedad': -2,
    'severidad': -1,
    'urgencia': -1,
    'alarma': -2,
    'preocupación': -1,
    'temor': -2,
    'miedo': -2,
    'pánico': -3,
    'caos': -3,
    'problemas': -1,
    'dificultades': -1,
    'deficiencia': -2,
    'fallo': -2,
    'fracaso': -2,
    'derrota': -2,
    'malo': -2,
    'peor': -2,
    'horrible': -3,
    'terrible': -3,
    'espantoso': -3,
    'desastroso': -3,
    'negativo': -2,
  },
  intensificadores: ['muy', 'extremadamente', 'sumamente', 'demasiado', 'mucho'],
  negadores: ['no', 'sin', 'nunca', 'jamás', 'ningún', 'nada'],
}

// El lookup normaliza la palabra del texto (normalizarPalabra quita tildes),
// así que las claves del lexicón deben normalizarse igual: sin esto, todas las
// entradas acentuadas ('éxito', 'daño', 'restauración'…) eran inalcanzables.
function normalizarClaves(mapa) {
  const normalizado = {}
  for (const [clave, puntaje] of Object.entries(mapa)) {
    normalizado[normalizarPalabra(clave)] = puntaje
  }
  return normalizado
}
LEXICON_SENTIMIENTO.positivos = normalizarClaves(LEXICON_SENTIMIENTO.positivos)
LEXICON_SENTIMIENTO.negativos = normalizarClaves(LEXICON_SENTIMIENTO.negativos)

function obtenerPuntaje(palabra, lexico) {
  const norm = normalizarPalabra(palabra)
  return lexico.positivos[norm] ?? lexico.negativos[norm] ?? 0
}

export function analizarSentimiento(texto) {
  if (!texto || typeof texto !== 'string') return { sentimiento: 'neutra', polaridad: 0, score: 0 }

  const tokens = tokenizar(texto)
  let scoreTotal = 0
  let tokensProcesados = 0

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    const puntaje = obtenerPuntaje(token, LEXICON_SENTIMIENTO)

    if (puntaje === 0) continue

    let modificador = 1

    // Negación: buscar en ventana de 3 tokens hacia atrás
    for (let j = Math.max(0, i - 3); j < i; j++) {
      if (LEXICON_SENTIMIENTO.negadores.includes(tokens[j].toLowerCase())) {
        modificador = -1
        break
      }
    }

    // Intensificador: buscar en el token inmediatamente anterior
    if (i > 0 && LEXICON_SENTIMIENTO.intensificadores.includes(tokens[i - 1].toLowerCase())) {
      modificador *= 1.5
    }

    scoreTotal += puntaje * modificador
    tokensProcesados += 1
  }

  // Redondear a 2 decimales
  const polaridad = tokensProcesados > 0 ? Math.round((scoreTotal / (tokensProcesados * 3)) * 100) / 100 : 0

  let sentimiento = 'neutra'
  if (Math.abs(polaridad) < 0.15) {
    sentimiento = 'neutra'
  } else if (polaridad > 0) {
    sentimiento = 'positiva'
  } else if (polaridad < 0) {
    sentimiento = 'negativa'
  }

  // "Mixta" solo si hay evidencia clara de ambos polos (y al menos un token positivo y uno negativo)
  const tokensPositivos = tokens.filter((t) => obtenerPuntaje(t, LEXICON_SENTIMIENTO) > 0).length
  const tokensNegativos = tokens.filter((t) => obtenerPuntaje(t, LEXICON_SENTIMIENTO) < 0).length
  if (tokensPositivos >= 1 && tokensNegativos >= 1 && Math.abs(polaridad) > 0.3) {
    sentimiento = 'mixta'
  }

  return {
    sentimiento,
    polaridad: Math.round(polaridad * 100) / 100,
    score: Math.round(scoreTotal),
  }
}
