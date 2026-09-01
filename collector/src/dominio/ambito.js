// Ámbito de una noticia: nacional | regional | internacional.
//
// El ámbito es POR NOTICIA, no por medio: un medio regional puede publicar una
// noticia nacional, un medio nacional una internacional, y un medio extranjero
// una noticia sobre Chile. Reglas deterministas, en orden:
//   1. Región chilena detectada en el texto → regional
//   2. Mención de Chile o de una entidad chilena → nacional
//   3. País o lugar extranjero en el texto → internacional
//   4. Dominio del medio extranjero → internacional
//   5. Por defecto → nacional

// Señales de Chile (además de las regiones, que ya cubre geografia.js).
const TERMINOS_CHILE = [
  'chile', 'chileno', 'chilena', 'chilenos', 'chilenas',
  'conaf', 'corporacion nacional forestal', 'senapred', 'onemi', 'conadi',
  'sernafor', 'sbap', 'carabineros', 'la moneda', 'gobierno de chile',
]

// Países y lugares extranjeros frecuentes en la prensa hispanohablante.
const TERMINOS_EXTRANJERO = [
  // Países
  'argentina', 'peru', 'bolivia', 'brasil', 'paraguay', 'uruguay', 'ecuador',
  'colombia', 'venezuela', 'mexico', 'cuba', 'puerto rico', 'guatemala',
  'honduras', 'nicaragua', 'panama', 'costa rica', 'el salvador',
  'republica dominicana', 'espana', 'portugal', 'francia', 'italia', 'alemania',
  'reino unido', 'inglaterra', 'irlanda', 'grecia', 'turquia', 'noruega',
  'suecia', 'finlandia', 'suiza', 'austria', 'polonia', 'rusia', 'ucrania',
  'estados unidos', 'eeuu', 'ee uu', 'canada', 'china', 'japon', 'corea',
  'india', 'vietnam', 'indonesia', 'filipinas', 'australia', 'nueva zelanda',
  'israel', 'palestina', 'egipto', 'marruecos', 'sudafrica',
  // Lugares sub-nacionales extranjeros vistos en el ruido de Google News
  'madrid', 'barcelona', 'ibiza', 'mallorca', 'badajoz', 'murcia', 'galicia',
  'andalucia', 'cataluna', 'aragon', 'asturias', 'extremadura', 'sevilla',
  'zaragoza', 'buenos aires', 'mendoza', 'montevideo', 'lima', 'bogota',
  'caracas', 'quito', 'la paz', 'asuncion', 'brasilia', 'sao paulo',
  'rio de janeiro', 'miami', 'california', 'texas', 'florida', 'nueva york',
  'washington', 'sacramento',
]

// TLDs de país extranjeros (el segmento final del dominio).
const TLDS_EXTRANJEROS = new Set([
  'ar', 'pe', 'bo', 'br', 'py', 'uy', 'ec', 'co', 've', 'mx', 'cu', 'pr',
  'gt', 'hn', 'ni', 'pa', 'cr', 'sv', 'do', 'es', 'pt', 'fr', 'it', 'de',
  'uk', 'ie', 'gr', 'tr', 'no', 'se', 'fi', 'ch', 'at', 'pl', 'ru', 'ua',
  'us', 'ca', 'cn', 'jp', 'kr', 'in', 'vn', 'id', 'ph', 'au', 'nz',
])

// Dominios extranjeros con TLD genérico (.com/.net) vistos en el ruido real.
const DOMINIOS_EXTRANJEROS = new Set([
  'univision.com', 'infobae.com', 'cibercuba.com', 'okdiario.com',
  'eldebate.com', 'notimerica.com', 'elnuevodia.com', 'la-razon.com',
  'kienyke.com', 'todomountainbike.net', 'europapress.es', 'ksdy50.com',
])

function normalizar(texto) {
  return String(texto ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9ñ\s]/g, ' ')
    .replace(/\s+/g, ' ')
}

function contieneTermino(textoNormalizado, terminos) {
  for (const termino of terminos) {
    if (new RegExp(`(^| )${termino}( |$)`).test(textoNormalizado)) return true
  }
  return false
}

export function dominioDeUrl(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return ''
  }
}

// ¿El dominio pertenece a un medio extranjero? Conservador: los TLD genéricos
// (.com/.net/.org) solo se consideran extranjeros si están en la lista explícita
// — hay medios chilenos en .com (elciudadano.com, radiopolar.com, cnnchile.com).
export function esDominioExtranjero(dominio) {
  const dom = String(dominio ?? '').toLowerCase().replace(/^www\./, '')
  if (!dom || dom.endsWith('.cl')) return false
  if (DOMINIOS_EXTRANJEROS.has(dom)) return true
  if (dom.startsWith('telemundo')) return true
  const tld = dom.split('.').pop()
  return TLDS_EXTRANJEROS.has(tld)
}

// Determina el ámbito de UNA noticia. `regiones` es el resultado del análisis
// geográfico (ids de regiones chilenas detectadas); `texto` incluye titular +
// cuerpo; `url` es el link de la noticia (señal de dominio, último recurso).
export function determinarAmbito({ texto, regiones = [], url = '' }) {
  if (regiones.length > 0) return 'regional'

  const normalizado = normalizar(texto)
  if (contieneTermino(normalizado, TERMINOS_CHILE)) return 'nacional'
  if (contieneTermino(normalizado, TERMINOS_EXTRANJERO)) return 'internacional'
  if (esDominioExtranjero(dominioDeUrl(url))) return 'internacional'

  return 'nacional'
}
