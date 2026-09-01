// Formateo de fechas en español (América/Santiago).

const locale = 'es-CL'
const zona = 'America/Santiago'

function obtenerDiaEnZona(isoString) {
  const fecha = new Date(isoString)
  const formatter = new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: zona,
  })
  return formatter.format(fecha)
}

function obtenerAhoraEnZona() {
  return obtenerDiaEnZona(new Date().toISOString())
}

export function formatoFechaLarga(isoString) {
  const fecha = new Date(isoString)
  return fecha.toLocaleDateString(locale, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: zona,
  })
}

/**
 * 'YYYY-MM-DD' del día en curso en Chile.
 *
 * Existe para COMPARARSE COMO STRING con la fecha de un boletín, que viaja como
 * 'YYYY-MM-DD' sin hora. Pasar esa fecha por `new Date()` la interpretaría como
 * medianoche UTC, que en Chile (UTC−4/−3) es el día ANTERIOR a las 21:00: el boletín
 * de hoy se rotularía como el de ayer justo el día en que sí llegó.
 */
export function diaEnChileISO(instante = new Date()) {
  const partes = new Intl.DateTimeFormat(locale, {
    timeZone: zona,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instante)
  const p = Object.fromEntries(partes.map((x) => [x.type, x.value]))
  return `${p.year}-${p.month}-${p.day}`
}

/**
 * Formatea un 'YYYY-MM-DD' como «miércoles, 26 de agosto de 2026».
 *
 * Se ancla a MEDIODÍA UTC (las 08:00 o 09:00 en Chile) a propósito: es el mismo día
 * calendario bajo cualquiera de los dos husos chilenos, así que el formateo no puede
 * retroceder un día. Ver diaEnChileISO.
 */
export function formatoDiaLargo(dia) {
  if (!dia) return ''
  return formatoFechaLarga(`${dia}T12:00:00Z`)
}

export function formatoFechaCorta(isoString) {
  const fecha = new Date(isoString)
  return fecha.toLocaleDateString(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: zona,
  })
}

export function formatoHora(isoString) {
  const fecha = new Date(isoString)
  return fecha.toLocaleTimeString(locale, {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: zona,
  })
}

export function formatoFechaHora(isoString) {
  const fecha = new Date(isoString)
  return fecha.toLocaleString(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: zona,
  })
}

export function hace(isoString) {
  const fecha = new Date(isoString)
  const ahora = new Date()
  const diff = ahora - fecha
  const minutos = Math.floor(diff / 60000)
  const horas = Math.floor(diff / 3600000)
  const días = Math.floor(diff / 86400000)

  if (minutos < 1) return 'hace unos segundos'
  if (minutos < 60) return `hace ${minutos} min`
  if (horas < 24) return `hace ${horas} h`
  if (días < 7) return `hace ${días} d`
  return formatoFechaCorta(isoString)
}

export function esHoy(isoString) {
  return obtenerDiaEnZona(isoString) === obtenerAhoraEnZona()
}

export function esHoyOAyer(isoString) {
  const diaNoticia = obtenerDiaEnZona(isoString)
  const ahora = new Date()
  const ahoraDia = obtenerAhoraEnZona()

  const ayer = new Date(ahora)
  ayer.setDate(ayer.getDate() - 1)
  const ayerDia = obtenerDiaEnZona(ayer.toISOString())

  return diaNoticia === ahoraDia || diaNoticia === ayerDia
}

export function tiempoRelativo(isoString) {
  const fecha = new Date(isoString)
  if (!isoString || Number.isNaN(fecha.getTime())) return ''

  const ahora = new Date()

  if (esHoy(isoString)) {
    const horas = Math.floor((ahora - fecha) / 3600000)
    if (horas <= 0) return 'hace menos de 1 h'
    if (horas === 1) return 'hace 1 h'
    return `hace ${horas} h`
  }

  const días = Math.floor((ahora - fecha) / 86400000)

  // Cruzó la medianoche pero lleva menos de 24 h: es "ayer", no una fecha.
  if (días < 1) return 'ayer'
  if (días === 1) return 'hace 1 día'
  if (días < 365) return `hace ${días} días`

  const años = Math.floor(días / 365)
  return `hace ${años} ${años === 1 ? 'año' : 'años'}`
}
