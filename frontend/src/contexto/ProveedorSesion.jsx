import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { EVENTO_SESION_EXPIRADA } from '../servicios/sesion.js'

export const ContextoSesion = createContext()

// Marca de un solo disparo contra el bucle app <-> IAM. Si el callback falla por algo
// permanente (cookie descartada por Secure sobre HTTP, reloj desfasado, state
// inválido), la SPA pediría /api/me -> 401 -> redirige al IAM -> el IAM reemite el
// code sin pedir clave -> callback falla otra vez, para siempre. Son navegaciones
// completas, así que el navegador NO lo detecta como redirect loop: la pantalla queda
// parpadeando. Con esta marca solo se intenta una vez por sesión de pestaña.
const CLAVE_INTENTO = 'coipo_intento_login'

// Sin este tope, un backend colgado deja la pantalla en "Verificando sesión…" para
// siempre — que a los ojos de SECOM es la página caída de las 8:00.
const TIMEOUT_MS = 8000

function urlLogin(destino) {
  return `${import.meta.env.BASE_URL}api/auth/login?destino=${encodeURIComponent(destino)}`
}

export function ProveedorSesion({ children }) {
  // fase: 'verificando' | 'autenticado' | 'anonimo' | 'noConfigurada' | 'error'
  const [estado, setEstado] = useState({ fase: 'verificando', usuario: null, motivo: null })
  const montado = useRef(true)

  const consultar = useCallback(async () => {
    const controlador = new AbortController()
    const reloj = setTimeout(() => controlador.abort(), TIMEOUT_MS)
    try {
      const respuesta = await fetch(`${import.meta.env.BASE_URL}api/me`, {
        // Mismo origen vía nginx: la cookie viaja sola. Explícito para que nadie lo
        // "optimice" quitándolo.
        credentials: 'same-origin',
        cache: 'no-store',
        signal: controlador.signal,
      })
      if (!montado.current) return
      if (respuesta.status === 401) {
        setEstado({ fase: 'anonimo', usuario: null, motivo: null })
        return
      }
      // 503: el servidor arrancó sin credenciales del IAM. No es "andá a loguearte"
      // (no se puede) ni "el backend cayó": es un despliegue incompleto. El cuerpo
      // trae los NOMBRES de las variables que faltan, para no tener que ir a /health.
      if (respuesta.status === 503) {
        const cuerpo = await respuesta.json().catch(() => null)
        const faltan = cuerpo?.detail?.faltan ?? []
        setEstado({ fase: 'noConfigurada', usuario: null, motivo: faltan.join(', ') })
        return
      }
      if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`)
      const usuario = await respuesta.json()
      if (!montado.current) return
      sessionStorage.removeItem(CLAVE_INTENTO)
      setEstado({ fase: 'autenticado', usuario, motivo: null })
    } catch (error) {
      if (!montado.current) return
      setEstado({ fase: 'error', usuario: null, motivo: error.message })
    } finally {
      clearTimeout(reloj)
    }
  }, [])

  useEffect(() => {
    montado.current = true
    consultar()

    // Revalidar al recuperar el foco, igual que ProveedorDatos: si la sesión venció
    // mientras la pestaña estaba en segundo plano, la puerta lo detecta y reinicia el
    // flujo en vez de dejar una pantalla de error.
    const alVolver = () => {
      if (document.visibilityState === 'visible') consultar()
    }
    document.addEventListener('visibilitychange', alVolver)
    window.addEventListener(EVENTO_SESION_EXPIRADA, consultar)

    return () => {
      montado.current = false
      document.removeEventListener('visibilitychange', alVolver)
      window.removeEventListener(EVENTO_SESION_EXPIRADA, consultar)
    }
  }, [consultar])

  const iniciarSesion = useCallback((destino) => {
    const ruta = destino ?? (window.location.hash.slice(1) || '/')
    sessionStorage.setItem(CLAVE_INTENTO, '1')
    window.location.assign(urlLogin(ruta))
  }, [])

  const cerrarSesion = useCallback(async () => {
    try {
      await fetch(`${import.meta.env.BASE_URL}api/auth/logout`, {
        method: 'POST',
        credentials: 'same-origin',
      })
    } catch {
      // Sin conexión no se puede avisar al servidor; igual se manda al login.
    }
    sessionStorage.removeItem(CLAVE_INTENTO)
    window.location.assign(import.meta.env.BASE_URL)
  }, [])

  const yaSeIntento = () => sessionStorage.getItem(CLAVE_INTENTO) === '1'

  return (
    <ContextoSesion.Provider
      value={{ ...estado, reintentar: consultar, iniciarSesion, cerrarSesion, yaSeIntento }}
    >
      {children}
    </ContextoSesion.Provider>
  )
}

export function useSesion() {
  const contexto = useContext(ContextoSesion)
  if (!contexto) {
    throw new Error('useSesion debe usarse dentro de ProveedorSesion')
  }
  return contexto
}
