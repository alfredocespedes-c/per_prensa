// Clustering de eventos (Fase 2): agrupa noticias que cubren el mismo hecho.
//
// Fórmula de similitud (ver config/parametros.js, UMBRAL_EVENTO/UMBRAL_DUPLICADO):
//   0.6 * Jaccard(tokens del titular) + 0.4 * Jaccard(entidades)
// entidades = unión de analisis.personas, organizaciones, categorias y regiones.
//
// Un eventId, una vez asignado, queda CONGELADO: nunca se reasigna en corridas
// posteriores (mismo espíritu que "previas conservan su versión ya publicada" en
// dominio/ventana.js). Se acuña de forma determinista — 'evt:' + el id de la propia
// noticia semilla, que ya es único por construcción (es la clave de dedup del
// corpus) — recién cuando una SEGUNDA noticia se une a esa semilla: una noticia sola
// nunca es "evento".

import { obtenerPalabrasClaveUnicas, tokenizar } from './analisis-texto.js'

const UN_DIA_MS = 24 * 60 * 60 * 1000

function firmaDe(noticia) {
  const analisis = noticia.analisis
  return {
    tokens: new Set(obtenerPalabrasClaveUnicas(tokenizar(noticia.titular))),
    entidades: new Set(
      analisis
        // Sin `personas`: ya no se extraen (ver dominio/entidades.js). Las previas
        // archivadas todavía pueden traerlas, pero no se usan para agrupar: la señal
        // debe ser la misma para toda la ventana o el clustering sería inestable.
        ? [...(analisis.organizaciones ?? []), ...(analisis.categorias ?? []), ...(analisis.regiones ?? [])]
        : [],
    ),
  }
}

function jaccard(a, b) {
  if (a.size === 0 && b.size === 0) return 0
  let interseccion = 0
  for (const elemento of a) {
    if (b.has(elemento)) interseccion += 1
  }
  return interseccion / (a.size + b.size - interseccion)
}

function similitud(firmaA, firmaB) {
  return 0.6 * jaccard(firmaA.tokens, firmaB.tokens) + 0.4 * jaccard(firmaA.entidades, firmaB.entidades)
}

function fechaMs(noticia) {
  return Date.parse(noticia.fecha ?? noticia.fechaDeteccion ?? '') || 0
}

function compararDeterminista(a, b) {
  return fechaMs(a) - fechaMs(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
}

// asignarEventos(noticias, opciones) -> Map<id, eventId>
// Devuelve solo las entradas con eventId no nulo (previas congeladas + las recién
// unidas en esta corrida). `main.js` aplica: noticia.eventId = mapa.get(noticia.id) ?? null
export function asignarEventos(noticias, { umbralEvento, ventanaEventoDias, umbralDuplicado }) {
  const ventanaMs = ventanaEventoDias * UN_DIA_MS
  const resultado = new Map()
  const eventos = new Map() // eventId -> { semillaFechaMs, miembros: Firma[] }

  const conEvento = noticias.filter((n) => n.eventId)
  const sinEvento = noticias.filter((n) => !n.eventId)

  for (const noticia of conEvento) {
    resultado.set(noticia.id, noticia.eventId)
    let evento = eventos.get(noticia.eventId)
    if (!evento) {
      evento = { semillaFechaMs: fechaMs(noticia), miembros: [] }
      eventos.set(noticia.eventId, evento)
    }
    evento.semillaFechaMs = Math.min(evento.semillaFechaMs, fechaMs(noticia))
    evento.miembros.push(firmaDe(noticia))
  }

  // Semillas de esta corrida que aún no encontraron pareja — no tienen eventId hasta
  // que una noticia posterior se les una.
  const semillasPendientes = []

  for (const noticia of [...sinEvento].sort(compararDeterminista)) {
    const firma = firmaDe(noticia)
    const fechaNoticiaMs = fechaMs(noticia)

    let mejorEventoId = null
    let mejorPuntaje = -1
    let esDuplicado = false

    for (const [eventId, evento] of eventos) {
      if (Math.abs(fechaNoticiaMs - evento.semillaFechaMs) > ventanaMs) continue
      let puntajeMaximo = 0
      for (const miembro of evento.miembros) {
        const puntaje = similitud(firma, miembro)
        if (puntaje >= umbralDuplicado) esDuplicado = true
        puntajeMaximo = Math.max(puntajeMaximo, puntaje)
      }
      if (puntajeMaximo > mejorPuntaje) {
        mejorPuntaje = puntajeMaximo
        mejorEventoId = eventId
      }
      if (esDuplicado) break
    }

    if (mejorEventoId !== null && (esDuplicado || mejorPuntaje >= umbralEvento)) {
      resultado.set(noticia.id, mejorEventoId)
      const evento = eventos.get(mejorEventoId)
      evento.miembros.push(firma)
      evento.semillaFechaMs = Math.min(evento.semillaFechaMs, fechaNoticiaMs)
      continue
    }

    const semillaElegida = semillasPendientes.find((pendiente) => {
      if (Math.abs(fechaNoticiaMs - fechaMs(pendiente.noticia)) > ventanaMs) return false
      const puntaje = similitud(firma, pendiente.firma)
      return puntaje >= umbralDuplicado || puntaje >= umbralEvento
    })

    if (semillaElegida) {
      const eventId = `evt:${semillaElegida.noticia.id}`
      resultado.set(semillaElegida.noticia.id, eventId)
      resultado.set(noticia.id, eventId)
      eventos.set(eventId, {
        semillaFechaMs: Math.min(fechaMs(semillaElegida.noticia), fechaNoticiaMs),
        miembros: [semillaElegida.firma, firma],
      })
      semillasPendientes.splice(semillasPendientes.indexOf(semillaElegida), 1)
      continue
    }

    semillasPendientes.push({ noticia, firma })
  }

  return resultado
}
