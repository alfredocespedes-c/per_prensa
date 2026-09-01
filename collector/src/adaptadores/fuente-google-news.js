// Adaptador de Google News (red de seguridad de cobertura).
//
// A diferencia del adaptador RSS por medio, esta fuente agrega noticias de
// MUCHOS medios chilenos que mencionan los conceptos, incluyendo medios que no
// están en la lista curada o cuyos feeds propios ya rotaron la noticia. Sus
// enlaces se resuelven a la URL directa del medio (ver resolver-google-news.js).
//
// Devuelve { items, cache }:
//   items: ítems ya resueltos y con el medio real (dominio) y nombre de fuente.
//   cache: Map googleId → urlReal, podado al feed actual, para guardar y evitar
//          re-resolver en la próxima corrida.

import Parser from 'rss-parser'
import { crearClienteHttp } from './cliente-http.js'
import { mapaConLimite } from './util-concurrencia.js'

function dominio(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return 'desconocido'
  }
}

// Google News antepone el nombre del medio como sufijo " - Fuente" en el título.
function separarTituloYFuente(tituloCrudo) {
  const partes = String(tituloCrudo).split(' - ')
  if (partes.length < 2) return { titular: String(tituloCrudo).trim(), fuente: 'Google News' }
  const fuente = partes.pop().trim()
  return { titular: partes.join(' - ').trim(), fuente }
}

const CLASIFICACION_POR_DEFECTO = (dom, fuente) => ({
  medioId: dom,
  medioNombre: fuente,
  seccionId: 'otros',
})

export function crearFuenteGoogleNews({
  conceptos,
  resolutor,
  params = { hl: 'es-419', gl: 'CL', ceid: 'CL:es-419' },
  maxResoluciones = 80,
  concurrencia = 5,
  cachePrevia = new Map(),
  dominiosExcluidos = [],
  clasificar = CLASIFICACION_POR_DEFECTO,
  userAgent,
  cliente = null,
}) {
  const consulta = conceptos.map((c) => `"${c}"`).join(' OR ')
  const feedUrl =
    `https://news.google.com/rss/search?q=${encodeURIComponent(consulta)}` +
    `&hl=${params.hl}&gl=${params.gl}&ceid=${encodeURIComponent(params.ceid)}`
  const parser = new Parser()
  const excluido = (dom) => dominiosExcluidos.some((d) => dom === d || dom.endsWith(`.${d}`))
  // Ver la nota de fuente-rss.js sobre el cliente por defecto. Con la política activa,
  // esta fuente es la que se ve afectada: news.google.com declara `Disallow: /` y su
  // lista blanca no incluye /rss/search (ver config/parametros.js, ROBOTS_ACTIVO).
  const http = cliente ?? crearClienteHttp({ userAgent, timeoutMs: 20000, transporte: fetch })

  return {
    async obtener() {
      const respuesta = await http.pedir(feedUrl, { timeoutMs: 20000 })
      if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status} en Google News`)
      const feed = await parser.parseString(await respuesta.text())

      const crudos = []
      for (const item of feed.items ?? []) {
        const enlace = item.link?.trim()
        const idGoogle = enlace?.split('/articles/')[1]?.split('?')[0]
        if (!enlace || !idGoogle) continue
        const { titular, fuente } = separarTituloYFuente(item.title ?? '')
        // El nombre de fuente de Google suele ser el dominio para sitios como
        // conaf.cl: se descarta antes de gastar presupuesto de resolución.
        if (excluido(fuente.toLowerCase())) continue
        crudos.push({ enlace, idGoogle, item, titular, fuente })
      }

      // Resolver solo los ids nuevos (los ya conocidos salen de la caché), con
      // un tope por corrida para no sobrecargar el endpoint interno de Google.
      let presupuesto = maxResoluciones
      const cache = new Map()
      const urls = await mapaConLimite(crudos, concurrencia, async ({ enlace, idGoogle }) => {
        if (cachePrevia.has(idGoogle)) {
          const url = cachePrevia.get(idGoogle)
          cache.set(idGoogle, url)
          return url
        }
        if (presupuesto <= 0) return null
        presupuesto -= 1
        const url = await resolutor.resolver(enlace)
        if (url) cache.set(idGoogle, url)
        return url
      })

      const items = []
      crudos.forEach(({ item, idGoogle, titular, fuente }, indice) => {
        const url = urls[indice]
        if (!url) return // resolución fallida o sin presupuesto: se reintenta luego
        const dom = dominio(url)
        if (excluido(dom)) {
          cache.delete(idGoogle) // no cachear dominios excluidos
          return
        }
        const { medioId, medioNombre, seccionId } = clasificar(dom, fuente)
        items.push({
          titular,
          url,
          fecha: item.isoDate ?? item.pubDate ?? null,
          texto: '', // Google News no entrega el cuerpo; el extracto se arma del titular
          medioId,
          medioNombre,
          seccionId,
        })
      })
      return { items, cache }
    },
  }
}
