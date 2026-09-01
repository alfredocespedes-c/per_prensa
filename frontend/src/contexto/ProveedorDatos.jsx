import { createContext, useCallback, useContext, useMemo } from 'react'

export const ContextoDatos = createContext()

const ahora = Date.now()
const horas = (n) => new Date(ahora - n * 60 * 60 * 1000).toISOString()
const dias = (n) => new Date(ahora - n * 24 * 60 * 60 * 1000).toISOString()

const secciones = [
  { id: 'nacional', nombre: 'Prensa nacional', orden: 1 },
  { id: 'regional', nombre: 'Prensa regional', orden: 2 },
  { id: 'digital', nombre: 'Medios digitales', orden: 3 },
]

const conceptos = [
  { texto: 'CONAF', orden: 1 },
  { texto: 'Incendios forestales', orden: 2 },
  { texto: 'Bosques y conservación', orden: 3 },
]

const noticias = [
  { id:'n1', conceptoPrincipal:'CONAF', seccionId:'nacional', medioNombre:'LA TERCERA', fecha:horas(1), titular:'CONAF refuerza coordinación territorial para la temporada de mayor riesgo', autor:'Equipo de prensa', url:'#', analisis:{sentimiento:'positiva',ambito:'nacional'}, extracto:[{texto:'La institución destacó nuevas medidas de coordinación y seguimiento para fortalecer su capacidad operativa.',resaltado:false}] },
  { id:'n2', conceptoPrincipal:'CONAF', seccionId:'digital', medioNombre:'BIOBIOCHILE', fecha:horas(3), titular:'Nuevo despliegue preventivo pone foco en zonas de interfaz urbano forestal', autor:'Redacción', url:'#', analisis:{sentimiento:'neutra',ambito:'nacional'}, extracto:[{texto:'El plan considera monitoreo, prevención y coordinación con equipos regionales.',resaltado:false}] },
  { id:'n3', conceptoPrincipal:'Incendios forestales', seccionId:'nacional', medioNombre:'EMOL', fecha:horas(5), titular:'Autoridades revisan preparación frente a incendios forestales', autor:'Nacional', url:'#', analisis:{sentimiento:'neutra',ambito:'nacional'}, extracto:[{texto:'La revisión abordó disponibilidad de recursos, prevención y respuesta ante emergencias.',resaltado:false}] },
  { id:'n4', conceptoPrincipal:'Incendios forestales', seccionId:'regional', medioNombre:'EL AUSTRAL', fecha:horas(7), titular:'Región prepara recursos terrestres para enfrentar jornadas de altas temperaturas', autor:'Crónica regional', url:'#', analisis:{sentimiento:'positiva',ambito:'regional'}, extracto:[{texto:'Equipos regionales reforzaron la planificación preventiva y los puntos de vigilancia.',resaltado:false}] },
  { id:'n5', conceptoPrincipal:'Bosques y conservación', seccionId:'digital', medioNombre:'DIARIO SUSTENTABLE', fecha:horas(9), titular:'Restauración y protección de bosque nativo marcan nueva agenda territorial', autor:'Medio Ambiente', url:'#', analisis:{sentimiento:'positiva',ambito:'nacional'}, extracto:[{texto:'Las iniciativas buscan recuperar ecosistemas y fortalecer la conservación del patrimonio natural.',resaltado:false}] },
  { id:'n6', conceptoPrincipal:'CONAF', seccionId:'regional', medioNombre:'EL MERCURIO DE VALPARAÍSO', fecha:dias(1), titular:'CONAF y municipios coordinan acciones preventivas en sectores prioritarios', autor:'Región', url:'#', analisis:{sentimiento:'positiva',ambito:'regional'}, extracto:[{texto:'La coordinación incluye educación preventiva y revisión de sectores de mayor exposición.',resaltado:false}] },
  { id:'n7', conceptoPrincipal:'Incendios forestales', seccionId:'digital', medioNombre:'COOPERATIVA', fecha:dias(1), titular:'Balance regional destaca reducción de emergencias durante la última jornada', autor:'Redacción', url:'#', analisis:{sentimiento:'positiva',ambito:'regional'}, extracto:[{texto:'El balance fue acompañado por recomendaciones para mantener las medidas de prevención.',resaltado:false}] },
  { id:'n8', conceptoPrincipal:'Bosques y conservación', seccionId:'nacional', medioNombre:'EL MERCURIO', fecha:dias(3), titular:'Especialistas analizan desafíos para la conservación de ecosistemas forestales', autor:'Sociedad', url:'#', analisis:{sentimiento:'mixta',ambito:'nacional'}, extracto:[{texto:'El análisis plantea avances recientes y desafíos pendientes para la gestión del territorio.',resaltado:false}] },
  { id:'n9', conceptoPrincipal:'CONAF', seccionId:'digital', medioNombre:'CNN CHILE', fecha:dias(5), titular:'Instituciones públicas avanzan en herramientas para informar a la ciudadanía', autor:'País', url:'#', analisis:{sentimiento:'neutra',ambito:'nacional'}, extracto:[{texto:'La iniciativa busca facilitar el acceso a información y mejorar la comunicación pública.',resaltado:false}] },
  { id:'n10', conceptoPrincipal:'Incendios forestales', seccionId:'regional', medioNombre:'DIARIO CONCEPCIÓN', fecha:dias(8), titular:'Comunidades participan en jornada preventiva sobre incendios forestales', autor:'Región', url:'#', analisis:{sentimiento:'positiva',ambito:'regional'}, extracto:[{texto:'Vecinos y equipos técnicos revisaron medidas de autoprotección y prevención comunitaria.',resaltado:false}] },
]

export function ProveedorDatos({ children }) {
  const cargarHistorico = useCallback(async () => ({ noticias }), [])
  const valor = useMemo(() => ({
    noticias,
    secciones,
    conceptos,
    generadoEn: new Date().toISOString(),
    historico: { noticias },
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
