// Carga de noticias desde el backend (v2: FastAPI + Postgres, ver backend/app/routers/noticias.py).
// Antes leía el JSON estático generado por el collector; el shape de respuesta es
// el mismo, así que solo cambió la URL.

import { verificarSesion } from './servicios/sesion.js'

// BASE_URL resuelve dev (/) y producción (autoalojado, normalmente /). El
// cache-buster evita que una pestaña abierta sirva datos viejos a la hora de
// revisión de las 8:00 (la respuesta también trae Cache-Control: no-store).
export async function cargarNoticias() {
  const url = `${import.meta.env.BASE_URL}api/noticias?t=${Date.now()}`
  // credentials explícito: el endpoint exige la cookie de sesión (ver
  // backend/app/main.py). Es el valor por defecto para el mismo origen, pero
  // dejarlo escrito impide que alguien lo "optimice" quitándolo.
  const respuesta = await fetch(url, { cache: 'no-store', credentials: 'same-origin' })
  // Un 401 NO es un fallo de carga: es la sesión vencida. Se distingue para que
  // ProveedorDatos no borre el boletín ya renderizado y para que ProveedorSesion
  // reinicie el flujo de login.
  verificarSesion(respuesta)
  if (!respuesta.ok) {
    throw new Error(`no se pudo obtener las noticias (HTTP ${respuesta.status})`)
  }
  const datos = await respuesta.json()
  if (!Array.isArray(datos?.noticias) || !Array.isArray(datos?.secciones)) {
    throw new Error('la respuesta de noticias tiene un formato inesperado')
  }
  return datos
}
