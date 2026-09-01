// Agrupación de la ventana de noticias por evento (el `eventId` que acuña el
// collector en dominio/eventos.js). Lógica pura, sin React: la vista la memoiza una
// vez y la usan tanto el listado como el detalle.
//
// El eventId tiene la forma `evt:<URL canónica de la noticia semilla>`, así que
// contiene `:`, `//` y a veces `?` o `#`. Nunca meterlo en una URL a mano: siempre
// vía createSearchParams/URLSearchParams (ver vistas/Eventos.jsx).

function fechaMs(noticia) {
  const t = Date.parse(noticia?.fecha ?? noticia?.fechaDeteccion ?? '')
  return Number.isNaN(t) ? 0 : t
}

// Más reciente arriba, igual que el boletín. Desempate por medio para que el orden
// sea estable entre renders (dos noticias del mismo minuto no deben bailar).
function porFechaDesc(a, b) {
  return fechaMs(b) - fechaMs(a) || String(a.medioNombre ?? '').localeCompare(String(b.medioNombre ?? ''), 'es')
}

/**
 * Agrupa las noticias que comparten `eventId`.
 *
 * A diferencia de la portada, aquí NO se deduplican titulares parecidos: que varios
 * medios titulen casi igual es precisamente la razón de que estén en el mismo evento.
 *
 * @param {Array} noticias ventana completa (las que no traen eventId se ignoran)
 * @returns {Array} eventos ordenados por última actividad, cada uno:
 *   { eventId, titulo, noticias[], medios: string[], sentimientos: {}, importancia, fecha }
 */
export function agruparEventos(noticias) {
  if (!noticias?.length) return []

  const grupos = new Map()

  for (const n of noticias) {
    if (!n.eventId) continue

    let grupo = grupos.get(n.eventId)
    if (!grupo) {
      grupo = {
        eventId: n.eventId,
        titulo: n.titular,
        noticias: [],
        medios: new Set(),
        sentimientos: {},
        importancia: 0,
        fecha: n.fecha,
      }
      grupos.set(n.eventId, grupo)
    }

    grupo.noticias.push(n)
    if (n.medioNombre) grupo.medios.add(n.medioNombre)

    const sentimiento = n.analisis?.sentimiento
    if (sentimiento) grupo.sentimientos[sentimiento] = (grupo.sentimientos[sentimiento] ?? 0) + 1

    grupo.importancia = Math.max(grupo.importancia, n.analisis?.importancia ?? 0)

    // La fecha del evento es la de su última actividad, y su título el titular de
    // esa noticia: es lo que mejor describe "en qué va" el evento hoy.
    if (fechaMs(n) > fechaMs(grupo)) {
      grupo.fecha = n.fecha
      grupo.titulo = n.titular
    }
  }

  return [...grupos.values()]
    .map((grupo) => ({
      ...grupo,
      // Set -> array ordenado: dato plano, testeable y serializable.
      medios: [...grupo.medios].sort((a, b) => a.localeCompare(b, 'es')),
      noticias: [...grupo.noticias].sort(porFechaDesc),
    }))
    .sort((a, b) => fechaMs(b) - fechaMs(a))
}

/** Busca un evento por id dentro de la lista ya agrupada. */
export function buscarEvento(eventos, eventId) {
  if (!eventId) return null
  return eventos.find((e) => e.eventId === eventId) ?? null
}

/**
 * Tono predominante del evento: mayoría absoluta o 'neutra'. Un evento con cobertura
 * dividida no es "positivo a medias", es neutro.
 */
export function sentimientoPredominante(sentimientos) {
  const total = Object.values(sentimientos ?? {}).reduce((a, b) => a + b, 0)
  if (!total) return 'neutra'
  if (sentimientos.positiva / total > 0.5) return 'positiva'
  if (sentimientos.negativa / total > 0.5) return 'negativa'
  return 'neutra'
}
