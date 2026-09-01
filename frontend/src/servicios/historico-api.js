// Cliente del archivo histórico paginado (backend + Postgres, ver
// backend/app/routers/historico.py). A diferencia de /api/noticias (la ventana
// móvil visible), este archivo acumula todo lo que el collector ha visto alguna vez
// (upsert, nunca se borra — ver collector/src/adaptadores/archivador-postgres.js).
//
// Devuelve el mismo shape "aplanado" que servicios/historico-local.js (sentimiento,
// categorias, importancia, riesgo en el nivel superior, no bajo `analisis`) para que
// Historico.jsx no tenga que cambiar su lógica de render — solo su fuente de datos.

import { verificarSesion } from './sesion.js'

function aplanar(noticia) {
  return {
    id: noticia.id,
    url: noticia.url,
    medioId: noticia.medioId,
    medioNombre: noticia.medioNombre,
    seccionId: noticia.seccionId,
    titular: noticia.titular,
    fecha: noticia.fecha,
    sentimiento: noticia.analisis?.sentimiento ?? null,
    categorias: noticia.analisis?.categorias ?? [],
    importancia: noticia.analisis?.importancia ?? null,
    riesgo: noticia.analisis?.riesgo ?? null,
  }
}

export async function obtenerHistoricoRemoto({ pagina = 1, tamanoPagina = 50 } = {}) {
  const parametros = new URLSearchParams({ pagina: String(pagina), tamanoPagina: String(tamanoPagina) })
  const url = `${import.meta.env.BASE_URL}api/historico?${parametros}`
  const respuesta = await fetch(url, { cache: 'no-store', credentials: 'same-origin' })
  // 401 = sesión vencida, no fallo del backend. Ver servicios/sesion.js.
  verificarSesion(respuesta)
  if (!respuesta.ok) {
    throw new Error(`no se pudo obtener el histórico (HTTP ${respuesta.status})`)
  }
  const datos = await respuesta.json()
  if (!Array.isArray(datos?.resultados)) {
    throw new Error('la respuesta de histórico tiene un formato inesperado')
  }
  return {
    pagina: datos.pagina,
    tamanoPagina: datos.tamanoPagina,
    total: datos.total,
    resultados: datos.resultados.map(aplanar),
  }
}
