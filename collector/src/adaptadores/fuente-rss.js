// Adaptador RSS/Atom del puerto fuente-de-noticias.

import Parser from 'rss-parser'
import { crearClienteHttp, leerTexto } from './cliente-http.js'
import { quitarTarjetasEnlazadas } from './limpieza-html.js'

// Algunos medios sirven el feed con Content-Type incorrecto (BioBioChile usa
// application/octet-stream), por eso NUNCA se valida el content-type: se parsea
// el cuerpo directamente.
//
// `cliente` se inyecta desde main.js con la política de robots.txt aplicada. El valor
// por defecto —sin política y con fetch a secas— conserva el comportamiento histórico
// para las pruebas herméticas, que simulan `fetch` y no deben salir a la red.
export function crearFuenteRss({
  timeoutMs = 20000,
  userAgent = 'COIPO_PRENSA/1.0',
  cliente = null,
} = {}) {
  const parser = new Parser({
    customFields: { item: [['content:encoded', 'contenidoCompleto']] },
  })
  const http = cliente ?? crearClienteHttp({ userAgent, timeoutMs, transporte: fetch })

  return {
    async obtener(medio) {
      const respuesta = await http.pedir(medio.feedUrl, {
        headers: {
          accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
        },
        redirect: 'follow',
        timeoutMs,
      })
      if (!respuesta.ok) {
        throw new Error(`HTTP ${respuesta.status} al pedir ${medio.feedUrl}`)
      }
      // Respeta el charset declarado: hay feeds regionales en ISO-8859-1 y leerlos como
      // UTF-8 mete texto corrupto directo al titular y al extracto.
      const xml = await leerTexto(respuesta)
      const feed = await parser.parseString(xml)

      const items = []
      for (const item of feed.items ?? []) {
        // `enlaceEnTitulo` es una propiedad OPT-IN del medio (ver config/medios.js), no una
        // heurística: solo se aplica a quien la declara. Existe porque hay CMS que emiten
        // un <a> renderizado dentro del <title> y dejan el <link> inservible.
        const url = medio.enlaceEnTitulo
          ? enlaceDesdeTitulo(item.title, medio.feedUrl)
          : typeof item.link === 'string' && item.link.trim() !== ''
            ? item.link.trim()
            : null

        if (!url) {
          console.warn(`[${medio.id}] ítem sin link descartado: "${item.title ?? '(sin título)'}"`)
          continue
        }
        items.push({
          titular: limpiarTexto(item.title ?? ''),
          url,
          fecha: item.isoDate ?? item.pubDate ?? null,
          // Se prefiere el contenido completo (content:encoded, típico de
          // WordPress) porque la mención puede estar más allá del resumen.
          texto: limpiarTexto(
            item.contenidoCompleto ?? item.content ?? item.summary ?? item.contentSnippet ?? '',
          ),
        })
      }
      return items
    },
  }
}

// Rescata la URL del artículo desde un <a> incrustado en el <title>.
//
// Caso real: interferencia.cl emite `<title><a href="/articulos/x">X</a></title>` y un
// <link> que es esa etiqueta entera URL-encodeada pegada al dominio — un 404 seguro. La
// dirección buena es el href, y solo se puede sacar de ahí.
//
// FALLA CERRADO a propósito: si no hay href, devuelve null y el ítem se descarta. Publicar
// un enlace roto es uno de los cuatro errores que SECOM declaró inaceptables, así que ante
// la duda es preferible perder la nota que listarla con un link muerto.
export function enlaceDesdeTitulo(titulo, urlBase) {
  const href = String(titulo ?? '').match(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["']/i)?.[1]
  if (!href) return null
  try {
    const url = new URL(href.trim(), urlBase)
    // Mismo criterio que el resto del sistema: solo http/https (ver dominio/noticia.js).
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null
  } catch {
    return null
  }
}

// HTML/entidades → texto plano de una línea.
function limpiarTexto(html) {
  // quitarTarjetasEnlazadas va ANTES de aplanar: es la misma fuga que en el extractor, por
  // otra puerta. El `content:encoded` de WordPress suele traer un bloque de «posts
  // relacionados», y quitar la etiqueta <a> no quita el titular que lleva dentro. El
  // volumen de ruido es mucho menor que por sitemap, pero es la misma clase de defecto.
  // Ver adaptadores/limpieza-html.js.
  return quitarTarjetasEnlazadas(String(html))
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#(\d+);/g, (_, codigo) => String.fromCodePoint(Number(codigo)))
    .replace(/&#x([0-9a-f]+);/gi, (_, codigo) => String.fromCodePoint(parseInt(codigo, 16)))
    .replace(/&nbsp;/gi, ' ')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim()
}
