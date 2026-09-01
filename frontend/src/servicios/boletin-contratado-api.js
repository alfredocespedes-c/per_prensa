// Cliente del boletín del servicio contratado (ver backend/app/routers/boletin_contratado.py).
//
// Todas las operaciones exigen sesión: no hay variante pública. Por eso, a diferencia de
// retiros-api.js, aquí no hay ningún fetch sin `credentials` ni sin `verificarSesion`.

import { verificarSesion } from './sesion.js'

const BASE = `${import.meta.env.BASE_URL}api/boletin-contratado`

function mensajeDeError(datos, estado) {
  const detalle = datos?.detail
  if (typeof detalle === 'string') return detalle
  if (Array.isArray(detalle) && detalle.length > 0) {
    // Los field_validator de Pydantic llegan con "Value error, " delante.
    return detalle[0]?.msg?.replace(/^Value error,\s*/, '') ?? `Error ${estado}`
  }
  return `No se pudo completar la operación (HTTP ${estado})`
}

async function pedir(ruta, opciones = {}) {
  const respuesta = await fetch(`${BASE}${ruta}`, {
    // Explícito para que nadie lo optimice quitándolo: sin la cookie, el backend
    // responde 401 y el bloque de la portada quedaría siempre vacío.
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

/** Cualquier autenticado: el boletín más reciente, o `null` si no hay ninguno. */
export async function obtenerBoletinContratadoActual() {
  const datos = await pedir('/actual')
  return datos?.boletin ?? null
}

/** Solo admin: el registro administrativo. */
export function listarBoletinesContratados() {
  return pedir('')
}

/** Solo admin. Devuelve { boletin, aviso }; `aviso` no bloquea nada. */
export function registrarBoletinContratado({ fecha, url }) {
  return pedir('', { method: 'POST', body: JSON.stringify({ fecha, url }) })
}

/** Solo admin: para cuando el error fue de FECHA (el enlace se corrige re-registrando). */
export function eliminarBoletinContratado(id) {
  return pedir(`/${id}`, { method: 'DELETE' })
}
