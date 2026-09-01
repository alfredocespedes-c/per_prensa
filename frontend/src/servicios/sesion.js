// Señal compartida de "sesión expirada".
//
// El backend responde 401 en CUALQUIER endpoint de /api cuando la cookie venció (ver
// backend/app/dependencias.py). Sin un canal común, cada consumidor trataría ese 401
// como "el backend falló" y pintaría un error: ProveedorDatos, además, vacía las
// noticias ya renderizadas. El caso real es SECOM enfocando a las 8:00 la pestaña que
// dejó abierta el día anterior — se encontraría con la pantalla vacía y sin ninguna
// forma de volver al login salvo adivinar que hay que recargar.
//
// Con esto, quien reciba un 401 lo marca y ProveedorSesion reinicia el flujo OAuth.

export class ErrorSesionExpirada extends Error {
  constructor() {
    super('La sesión expiró')
    this.name = 'ErrorSesionExpirada'
    this.sesionExpirada = true
  }
}

export const EVENTO_SESION_EXPIRADA = 'coipo:sesion-expirada'

export function avisarSesionExpirada() {
  window.dispatchEvent(new Event(EVENTO_SESION_EXPIRADA))
}

// Traduce una respuesta fetch a un error tipado. Devuelve la respuesta si está bien,
// para poder encadenar.
export function verificarSesion(respuesta) {
  if (respuesta.status === 401) {
    avisarSesionExpirada()
    throw new ErrorSesionExpirada()
  }
  return respuesta
}
