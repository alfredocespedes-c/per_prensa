// Cliente del CRUD de conceptos (ver backend/app/routers/conceptos.py).
//
// La cookie de sesión viaja sola por ser mismo origen (nginx proxea /api). Los
// errores del backend llegan con un `detail` pensado para mostrarse tal cual al
// admin: 409 al duplicar o al querer quedarse sin conceptos de búsqueda, 422 con el
// motivo de validación.

import { verificarSesion } from './sesion.js'

const BASE = `${import.meta.env.BASE_URL}api/conceptos`

/** Extrae un mensaje legible: FastAPI usa `detail` string (HTTPException) o lista (422). */
function mensajeDeError(datos, estado) {
  const detalle = datos?.detail
  if (typeof detalle === 'string') return detalle
  if (Array.isArray(detalle) && detalle.length > 0) {
    return detalle[0]?.msg?.replace(/^Value error,\s*/, '') ?? `Error ${estado}`
  }
  return `No se pudo completar la operación (HTTP ${estado})`
}

async function pedir(ruta, opciones = {}) {
  const respuesta = await fetch(`${BASE}${ruta}`, {
    credentials: 'same-origin',
    cache: 'no-store',
    headers: opciones.body ? { 'Content-Type': 'application/json' } : undefined,
    ...opciones,
  })
  verificarSesion(respuesta)
  if (respuesta.status === 204) return null
  const datos = await respuesta.json().catch(() => null)
  if (!respuesta.ok) throw new Error(mensajeDeError(datos, respuesta.status))
  return datos
}

export function listarConceptos() {
  return pedir('')
}

export function crearConcepto(texto, tipo) {
  return pedir('', { method: 'POST', body: JSON.stringify({ texto, tipo }) })
}

export function actualizarConcepto(id, cambios) {
  return pedir(`/${id}`, { method: 'PATCH', body: JSON.stringify(cambios) })
}

export function eliminarConcepto(id) {
  return pedir(`/${id}`, { method: 'DELETE' })
}

export function obtenerImpacto(concepto) {
  return pedir(`/impacto${concepto ? `?concepto=${encodeURIComponent(concepto)}` : ''}`)
}

// --- Jerarquía de presentación (nivel 1: conceptos; nivel 2: tipos de medio) ---
// El reordenamiento es MASIVO: arrastrar reacomoda varias posiciones a la vez, y
// mandarlas de a una dejaría estados intermedios con órdenes duplicados que el collector
// podría leer si su corrida cae en medio.

/** @param {{id:string|number, orden:number}[]} items */
export function reordenarConceptos(items) {
  return pedir('/orden', { method: 'PATCH', body: JSON.stringify({ items }) })
}

/** Nivel 2: orden GLOBAL de los tipos de medio (tabla `secciones`). */
export function reordenarTipos(items) {
  return pedir('/tipos-orden', { method: 'PATCH', body: JSON.stringify({ items }) })
}

/** PUT: la lista COMPLETA de tipos ocultos de ese concepto, no un incremento. */
export function fijarTiposOcultos(conceptoId, tiposOcultos) {
  return pedir(`/${conceptoId}/tipos-ocultos`, {
    method: 'PUT',
    body: JSON.stringify({ tiposOcultos }),
  })
}
