// Análisis de texto puro: tokenización, conteos, keywords.

// Stopwords del español curadas para prensa: artículos, preposiciones,
// pronombres, conjugaciones frecuentes de ser/estar/haber/tener y verbos
// declarativos de redacción periodística (dijo, señaló, informó…).
const STOPWORDS_ES = new Set([
  // Artículos, determinantes y contracciones
  'a', 'al', 'del', 'el', 'la', 'las', 'lo', 'los', 'un', 'una', 'unas', 'unos',
  'este', 'esta', 'estas', 'esto', 'estos', 'ese', 'esa', 'esas', 'eso', 'esos',
  'aquel', 'aquella', 'aquellas', 'aquello', 'aquellos', 'cada', 'toda', 'todas',
  'todo', 'todos', 'otra', 'otras', 'otro', 'otros', 'misma', 'mismas', 'mismo',
  'mismos', 'mucha', 'muchas', 'mucho', 'muchos', 'poca', 'pocas', 'poco', 'pocos',
  'varias', 'varios', 'ambos', 'ambas', 'cualquier', 'ninguna', 'ninguno',
  'alguna', 'algunas', 'alguno', 'algunos', 'algo', 'algun', 'algún',
  // Preposiciones y conjunciones
  'ante', 'bajo', 'con', 'contra', 'de', 'desde', 'durante', 'en', 'entre',
  'hacia', 'hasta', 'mediante', 'para', 'por', 'segun', 'según', 'sin', 'sobre',
  'tras', 'y', 'e', 'o', 'u', 'ni', 'que', 'como', 'cuando', 'donde', 'mientras',
  'aunque', 'pero', 'sino', 'porque', 'pues', 'si',
  // Pronombres
  'yo', 'tu', 'tú', 'él', 'ella', 'ellas', 'ello', 'ellos', 'nosotros',
  'usted', 'ustedes', 'me', 'te', 'se', 'nos', 'le', 'les', 'mi', 'mis', 'su',
  'sus', 'nuestra', 'nuestras', 'nuestro', 'nuestros', 'quien', 'quienes',
  'cual', 'cuales', 'cuyo', 'cuya', 'cuyos', 'cuyas',
  // Interrogativos y adverbios comunes
  'qué', 'cómo', 'cuándo', 'dónde', 'cuanto', 'cuánto', 'cuanta', 'cuantas',
  'cuantos', 'aqui', 'aquí', 'alli', 'allí', 'ahi', 'ahí', 'ahora', 'antes',
  'despues', 'después', 'luego', 'entonces', 'siempre', 'nunca', 'tambien',
  'también', 'tampoco', 'muy', 'mas', 'más', 'menos', 'casi', 'solo', 'sólo',
  'tan', 'tanto', 'bien', 'mal', 'asi', 'así', 'ademas', 'además', 'apenas',
  'incluso', 'aun', 'aún', 'ya', 'no', 'sí', 'embargo',
  // Ser / estar / haber / tener / hacer / ir (conjugaciones frecuentes)
  'ser', 'es', 'son', 'era', 'eran', 'fue', 'fueron', 'sera', 'será', 'seran',
  'serán', 'seria', 'sería', 'siendo', 'sido',
  'estar', 'está', 'estan', 'están', 'estaba', 'estaban', 'estuvo',
  'estara', 'estará', 'estando', 'estado',
  'haber', 'hay', 'ha', 'han', 'habia', 'había', 'habian', 'habían', 'hubo',
  'habra', 'habrá', 'habria', 'habría',
  'tener', 'tiene', 'tienen', 'tenia', 'tenía', 'tenian', 'tenían', 'tuvo',
  'tendra', 'tendrá',
  'hacer', 'hace', 'hacen', 'hacia', 'hacía', 'hizo', 'hara', 'hará', 'hecho',
  'ir', 'va', 'van', 'iba', 'iban', 'ira', 'irá', 'ido',
  'puede', 'pueden', 'podria', 'podría', 'podrian', 'podrían', 'pudo', 'debe',
  'deben', 'deberia', 'debería',
  // Verbos declarativos de prensa
  'dijo', 'dice', 'dicen', 'senalo', 'señaló', 'afirmo', 'afirmó',
  'agrego', 'agregó', 'aseguro', 'aseguró', 'indico', 'indicó', 'explico',
  'explicó', 'informo', 'informó', 'detallo', 'detalló', 'preciso', 'precisó',
  'comento', 'comentó', 'expreso', 'expresó', 'manifesto', 'manifestó',
  'sostuvo', 'anuncio', 'anunció', 'confirmo', 'confirmó',
  // Genéricos de calendario y medida frecuentes en notas
  'hoy', 'ayer', 'dia', 'día', 'dias', 'días', 'año', 'años', 'ano', 'anos',
  'vez', 'veces', 'parte', 'partes', 'lugar', 'momento', 'forma', 'manera',
  'respecto', 'traves', 'través', 'etc',
])

export function tokenizar(texto) {
  if (!texto || typeof texto !== 'string') return []
  return texto
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 0)
}

export function normalizarPalabra(palabra) {
  if (!palabra) return ''
  return palabra
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

export function obtenerPalabrasClaveUnicas(tokens) {
  if (!Array.isArray(tokens)) return []
  const palabrasValidas = tokens.filter((t) => !STOPWORDS_ES.has(t.toLowerCase()) && t.length >= 3)
  return [...new Set(palabrasValidas)].sort()
}

export function contarPalabras(texto) {
  if (!texto || typeof texto !== 'string') return 0
  return tokenizar(texto).length
}

export function contarParrafos(texto) {
  if (!texto || typeof texto !== 'string') return 0
  return texto.split(/\n\n+/).filter((p) => p.trim().length > 0).length
}

export function calcularTiempoLectura(cantidadPalabras) {
  const palabrasPorMinuto = 220
  return Math.ceil(cantidadPalabras / palabrasPorMinuto)
}

export function extraerKeywords(texto, maxKeywords = 10) {
  if (!texto || typeof texto !== 'string') return []
  const tokens = tokenizar(texto)
  const frecuencia = new Map()

  for (const token of tokens) {
    if (STOPWORDS_ES.has(token) || token.length < 3) continue
    const normalizado = normalizarPalabra(token)
    frecuencia.set(normalizado, (frecuencia.get(normalizado) ?? 0) + 1)
  }

  return [...frecuencia.entries()]
    .sort(([, a], [, b]) => b - a)
    .slice(0, maxKeywords)
    .map(([palabra]) => palabra)
}
