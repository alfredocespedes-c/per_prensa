import { createContext, useCallback, useContext, useMemo } from 'react'
import { noticiasDemo, seccionesDemo, conceptosDemo } from '../datos/noticias-demo.js'

export const ContextoDatos = createContext()

// Fuente única de la maqueta. No existe fetch, API, collector ni fallback a noticias
// reales: toda la interfaz se alimenta exclusivamente del pool dummy local.
export function ProveedorDatos({ children }) {
  const cargarHistorico = useCallback(async () => ({ noticias: noticiasDemo }), [])

  const valor = useMemo(() => ({
    noticias: noticiasDemo,
    secciones: seccionesDemo,
    conceptos: conceptosDemo,
    generadoEn: new Date().toISOString(),
    historico: { noticias: noticiasDemo },
    cargando: false,
    error: null,
    cargarHistorico,
  }), [cargarHistorico])

  return <ContextoDatos.Provider value={valor}>{children}</ContextoDatos.Provider>
}

export function useDatos() {
  const contexto = useContext(ContextoDatos)
  if (!contexto) throw new Error('useDatos debe usarse dentro de ProveedorDatos')
  return contexto
}
