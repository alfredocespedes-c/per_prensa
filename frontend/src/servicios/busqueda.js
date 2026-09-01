import MiniSearch from 'minisearch'
import { esHoy, esHoyOAyer } from '../utilidades/fechas.js'

let indice = null

export function construirIndice(noticias) {
  // MiniSearch exige `fields` como strings; el peso por campo va en
  // searchOptions.boost (con objetos {name, weight} no se indexaba nada y
  // toda búsqueda devolvía []).
  indice = new MiniSearch({
    // Sin `personas`: el análisis ya no las produce (ver collector/src/dominio/
    // entidades.js) y buscar por nombre propio es justamente el uso que la política de
    // datos personales descarta.
    fields: ['titular', 'keywords', 'categorias', 'organizaciones', 'lugares'],
    storeFields: ['id', 'titular', 'medioNombre', 'fecha', 'seccionId'],
    searchOptions: {
      prefix: true,
      fuzzy: 0.2,
      boost: { titular: 10, keywords: 5, categorias: 3, organizaciones: 2, lugares: 2 },
    },
  })

  const docs = noticias.map(n => ({
    id: n.id,
    titular: n.titular,
    keywords: (n.analisis?.keywords || []).join(' '),
    categorias: (n.analisis?.categorias || []).join(' '),
    organizaciones: (n.analisis?.organizaciones || []).join(' '),
    lugares: (n.analisis?.lugares || []).join(' '),
    medioNombre: n.medioNombre,
    fecha: n.fecha,
    seccionId: n.seccionId,
  }))

  indice.addAll(docs)
  return indice
}

export function buscar(query) {
  if (!indice || !query.trim()) return []
  return indice.search(query)
}

export function obtenerFacetas(noticias) {
  const facetas = {
    secciones: {},
    medios: {},
    sentimientos: {},
    categorias: {},
    regiones: {},
    riesgos: {},
  }

  noticias.forEach(n => {
    facetas.secciones[n.seccionId] = (facetas.secciones[n.seccionId] || 0) + 1
    facetas.medios[n.medioId] = (facetas.medios[n.medioId] || 0) + 1
    if (n.analisis) {
      facetas.sentimientos[n.analisis.sentimiento] = (facetas.sentimientos[n.analisis.sentimiento] || 0) + 1
      facetas.riesgos[n.analisis.riesgo] = (facetas.riesgos[n.analisis.riesgo] || 0) + 1
      n.analisis.categorias?.forEach(cat => {
        facetas.categorias[cat] = (facetas.categorias[cat] || 0) + 1
      })
      n.analisis.regiones?.forEach(reg => {
        facetas.regiones[reg] = (facetas.regiones[reg] || 0) + 1
      })
    }
  })

  return facetas
}

export function filtrarNoticias(noticias, filtros = {}) {
  return noticias.filter(n => {
    if (filtros.seccion && n.seccionId !== filtros.seccion) return false
    if (filtros.medio && n.medioId !== filtros.medio) return false
    if (filtros.sentimiento && n.analisis?.sentimiento !== filtros.sentimiento) return false
    if (filtros.riesgo && n.analisis?.riesgo !== filtros.riesgo) return false
    if (filtros.ambito && n.analisis?.ambito !== filtros.ambito) return false
    if (filtros.categoria && !n.analisis?.categorias?.includes(filtros.categoria)) return false
    if (filtros.region && !n.analisis?.regiones?.includes(filtros.region)) return false
    if (filtros.eventId && n.eventId !== filtros.eventId) return false
    if (filtros.fechaDesde && new Date(n.fecha) < new Date(filtros.fechaDesde)) return false
    if (filtros.fechaHasta && new Date(n.fecha) > new Date(filtros.fechaHasta)) return false

    // Período rápido, con día calendario de Chile (mismas reglas que la portada)
    if (filtros.periodo === 'hoy' && !esHoy(n.fecha)) return false
    if (filtros.periodo === 'hoy-ayer' && !esHoyOAyer(n.fecha)) return false

    return true
  })
}
