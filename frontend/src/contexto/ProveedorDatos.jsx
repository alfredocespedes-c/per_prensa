import { createContext, useState, useEffect, useCallback, useContext } from 'react'
import { cargarNoticias } from '../servicios/datos.js'
import { actualizarHistoricoLocal } from '../servicios/historico-local.js'
import { useSesion } from './ProveedorSesion.jsx'

export const ContextoDatos = createContext()

export function ProveedorDatos({ children }) {
  const [noticias, setNoticias] = useState(null)
  const [secciones, setSecciones] = useState([])
  // Nivel 1 del boletín, en el orden que define el admin. Sin esto la portada tendría que
  // deducir el orden de los datos, que es justo lo que la jerarquía vino a reemplazar.
  const [conceptos, setConceptos] = useState([])
  const [generadoEn, setGeneradoEn] = useState(null)
  const [historico, setHistorico] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)

  // /api/noticias devuelve DOS cargas útiles distintas según haya sesión o no (ver
  // backend/app/servicios/mapeo.py): un anónimo recibe la ficha de referencia, sin
  // extracto ni análisis. `fase` entra como dependencia del efecto porque la primera
  // carga ocurre casi siempre ANTES de que /api/me conteste: sin recargar al pasar a
  // 'autenticado', el usuario que inicia sesión se quedaría con la carga útil pública y
  // Dashboard, Buscar, Eventos, Estadísticas, Medios, Mapa y Regiones —que leen
  // `analisis`— aparecerían vacíos sin ningún error visible.
  const { fase } = useSesion()

  useEffect(() => {
    // Mientras se verifica la sesión no se pide nada: hacerlo garantizaría una carga
    // útil pública seguida de otra interna, o sea dos peticiones y un parpadeo.
    if (fase === 'verificando') return undefined

    let activo = true

    const cargar = async () => {
      try {
        const datos = await cargarNoticias()
        if (activo) {
          setNoticias(datos.noticias)
          setSecciones(datos.secciones)
          setConceptos(datos.conceptos ?? [])
          setGeneradoEn(datos.generadoEn)
          setError(null)
          // Guardar en histórico local para que no se pierdan
          actualizarHistoricoLocal(datos.noticias)
        }
      } catch (err) {
        if (activo) {
          // Sesión vencida: NO se vacía lo ya renderizado. ProveedorSesion recibe el
          // mismo aviso y reinicia el flujo de login; mientras tanto, el usuario
          // conserva el boletín en pantalla en vez de encontrarse con un error.
          // Este es el caso de SECOM enfocando a las 8:00 la pestaña del día anterior.
          if (err?.sesionExpirada) return
          setError(err.message)
          setNoticias([])
          setSecciones([])
          setConceptos([])
        }
      } finally {
        if (activo) setCargando(false)
      }
    }

    // Cargar al montar
    cargar()

    // Recargar cuando la pestaña se enfoca
    const manejarVisibility = () => {
      if (document.visibilityState === 'visible') {
        cargar()
      }
    }

    document.addEventListener('visibilitychange', manejarVisibility)

    return () => {
      activo = false
      document.removeEventListener('visibilitychange', manejarVisibility)
    }
  }, [fase])

  // Carga lazy del histórico (solo cuando se necesita)
  const cargarHistorico = useCallback(async () => {
    if (historico !== null) return historico

    try {
      const url = `${import.meta.env.BASE_URL}data/historico.json?t=${Date.now()}`
      const respuesta = await fetch(url, { cache: 'no-store' })
      if (!respuesta.ok) return null
      const datos = await respuesta.json()
      setHistorico(datos)
      return datos
    } catch {
      return null
    }
  }, [historico])

  return (
    <ContextoDatos.Provider
      value={{
        noticias,
        secciones,
        conceptos,
        generadoEn,
        historico,
        cargando,
        error,
        cargarHistorico,
      }}
    >
      {children}
    </ContextoDatos.Provider>
  )
}

export function useDatos() {
  const contexto = useContext(ContextoDatos)
  if (!contexto) {
    throw new Error('useDatos debe usarse dentro de ProveedorDatos')
  }
  return contexto
}
