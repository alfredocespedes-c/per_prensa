import { createContext, useCallback, useContext } from 'react'

export const ContextoSesion = createContext()

// Maqueta visual: no depende de IAM ni backend. Se mantiene una sesión demo interna
// para que todas las vistas y etiquetas del proyecto puedan iterarse en GitHub Pages.
const USUARIO_DEMO = {
  nombre: 'Usuario demo',
  email: 'demo@local',
  esAdmin: true,
}

export function ProveedorSesion({ children }) {
  const iniciarSesion = useCallback(() => {}, [])
  const cerrarSesion = useCallback(() => {}, [])
  const reintentar = useCallback(() => {}, [])
  const yaSeIntento = useCallback(() => false, [])

  return (
    <ContextoSesion.Provider
      value={{
        fase: 'autenticado',
        usuario: USUARIO_DEMO,
        motivo: null,
        reintentar,
        iniciarSesion,
        cerrarSesion,
        yaSeIntento,
      }}
    >
      {children}
    </ContextoSesion.Provider>
  )
}

export function useSesion() {
  const contexto = useContext(ContextoSesion)
  if (!contexto) throw new Error('useSesion debe usarse dentro de ProveedorSesion')
  return contexto
}
