// Secciones del boletín (línea base del boletín antiguo de ConectaMedia).
// El tipo de cada medio en config/medios.js debe ser uno de estos ids.

export const SECCIONES = [
  { id: 'escrita', nombre: 'Prensa Escrita', orden: 1 },
  { id: 'regional', nombre: 'Prensa Regional', orden: 2 },
  { id: 'radio', nombre: 'Radio', orden: 3 },
  { id: 'digital', nombre: 'Digital', orden: 4 },
  // Canales de TV con sitio de noticias (Meganoticias vía sitemap; ver
  // adaptadores/fuente-sitemap-news.js). El boletín antiguo separaba TV.
  { id: 'tv', nombre: 'Televisión', orden: 5 },
  // Agregado por Google News: medios fuera de la lista curada o cuyo feed propio
  // ya rotó la noticia. Ver adaptadores/fuente-google-news.js.
  { id: 'otros', nombre: 'Otros medios', orden: 6 },
  // Medios extranjeros que llegan por Google News (dominio no chileno, ver
  // dominio/ambito.js). Separados para que no se mezclen con la prensa nacional.
  { id: 'internacional', nombre: 'Medios internacionales', orden: 7 },
]

export function validarTipoDeMedio(tipo) {
  if (!SECCIONES.some((seccion) => seccion.id === tipo)) {
    const validos = SECCIONES.map((seccion) => seccion.id).join(', ')
    throw new Error(`Tipo de medio desconocido: "${tipo}". Válidos: ${validos}`)
  }
  return tipo
}
