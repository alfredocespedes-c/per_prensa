// Ventana móvil de las últimas N noticias.

import { deduplicar } from './deduplicacion.js'

// Orden total y determinista: fecha desc → fecha de detección desc → id asc.
// Un comparador total garantiza salida byte-idéntica ante la misma entrada
// (idempotencia: sin commits vacíos en la rama de datos).
export function compararNoticias(a, b) {
  const fechaA = Date.parse(a.fecha ?? '') || 0
  const fechaB = Date.parse(b.fecha ?? '') || 0
  if (fechaB !== fechaA) return fechaB - fechaA
  const deteccionA = Date.parse(a.fechaDeteccion ?? '') || 0
  const deteccionB = Date.parse(b.fechaDeteccion ?? '') || 0
  if (deteccionB !== deteccionA) return deteccionB - deteccionA
  if (a.id < b.id) return -1
  if (a.id > b.id) return 1
  return 0
}

// Fusiona el estado previo con lo recién recolectado y aplica el tope.
// Las previas van primero: ante colisión (misma URL) se conserva la versión ya
// publicada — mantiene fechaDeteccion/extracto originales y hace la corrida
// idempotente. Una noticia previa que ya no viene en el feed permanece hasta
// que el tope la expulse por antigüedad.
export function fusionar(previas, nuevas, tamano) {
  const unidas = deduplicar([...previas, ...nuevas])
  unidas.sort(compararNoticias)
  return unidas.slice(0, tamano)
}
