// Cliente de las solicitudes de retiro (ver backend/app/routers/retiros.py).
//
// El POST es PÚBLICO: no lleva `verificarSesion`, porque un 401 no puede ocurrir y
// tratarlo como sesión expirada dispararía el flujo de login a un visitante anónimo que
// solo quería pedir la baja de su nota. El resto de operaciones sí exige admin.

import { verificarSesion } from './sesion.js'

const BASE = `${import.meta.env.BASE_URL}api/retiros`

function mensajeDeError(datos, estado) {
  const detalle = datos?.detail
  if (typeof detalle === 'string') return detalle
  if (Array.isArray(detalle) && detalle.length > 0) {
    return detalle[0]?.msg?.replace(/^Value error,\s*/, '') ?? `Error ${estado}`
  }
  return `No se pudo completar la operación (HTTP ${estado})`
}

/** Público: crea la SOLICITUD. No retira nada por sí sola; la aplica un administrador. */
export async function enviarSolicitudRetiro(solicitud) {
  const respuesta = await fetch(BASE, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(solicitud),
  })
  const datos = await respuesta.json().catch(() => null)
  if (!respuesta.ok) throw new Error(mensajeDeError(datos, respuesta.status))
  return datos
}

async function pedirAutenticado(ruta, opciones = {}) {
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

/** Solo admin: la bandeja de solicitudes. */
export function listarRetiros() {
  return pedirAutenticado('')
}

/**
 * Solo admin: aplicar o rechazar. Aplicar surte efecto inmediato en ambas superficies.
 *
 * `clave` viaja porque el admin la corrige antes de aplicar: el medio escribe su dominio
 * y el filtro de lectura necesita el identificador exacto del recolector.
 */
export function resolverRetiro(id, estado, clave) {
  const cambios = clave === undefined ? { estado } : { estado, clave }
  return pedirAutenticado(`/${id}`, { method: 'PATCH', body: JSON.stringify(cambios) })
}
