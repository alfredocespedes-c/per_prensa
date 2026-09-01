// Adaptador del puerto fuente-de-noticias para sitemaps de noticias
// (formato Google News sitemap: <urlset xmlns:news="...">).
//
// A diferencia del RSS, el sitemap solo trae URL + titular + fecha, sin cuerpo.
// Para que main.js pueda detectar la mención en el texto (no solo el titular),
// cada URL nueva se descarga con el extractor inyectado, respetando el tope
// `maxDescargas`. Devuelve { items, cache } (mismo patrón que fuente-google-news):
// la caché de URLs ya procesadas se persiste en el estado (campo `sitemapVisto`)
// para no re-descargar; las URLs excluidas por presupuesto NO se marcan y se
// reintentan la próxima corrida (el sitemap retiene ~48 h).

import { crearClienteHttp } from './cliente-http.js'
import { mapaConLimite } from './util-concurrencia.js'

const MAX_BYTES_SITEMAP = 5_000_000

export function crearFuenteSitemapNews({
  extractor,
  cachePrevia = new Set(),
  maxDescargas = 40,
  concurrencia = 6,
  timeoutMs = 20000,
  userAgent = 'COIPO_PRENSA/1.0',
  cliente = null,
} = {}) {
  // Ver la nota de fuente-rss.js sobre el cliente por defecto.
  const http = cliente ?? crearClienteHttp({ userAgent, timeoutMs, transporte: fetch })

  return {
    async obtener(medio) {
      const respuesta = await http.pedir(medio.sitemapUrl, {
        headers: { accept: 'application/xml, text/xml, */*' },
        redirect: 'follow',
        timeoutMs,
      })
      if (!respuesta.ok) {
        throw new Error(`HTTP ${respuesta.status} al pedir ${medio.sitemapUrl}`)
      }
      // SEC-06: rechazar por Content-Length ANTES de bufferizar. La comprobación de
      // xml.length de abajo ocurre tras bufferizar todo (inefectiva contra OOM); se
      // conserva como red de seguridad para respuestas sin Content-Length.
      const largoDeclarado = Number(respuesta.headers.get('content-length'))
      if (Number.isFinite(largoDeclarado) && largoDeclarado > MAX_BYTES_SITEMAP) {
        throw new Error(`Sitemap demasiado grande (Content-Length ${largoDeclarado}) en ${medio.sitemapUrl}`)
      }
      const xml = await respuesta.text()
      if (xml.length > MAX_BYTES_SITEMAP) {
        throw new Error(`Sitemap demasiado grande (${xml.length} bytes) en ${medio.sitemapUrl}`)
      }
      if (!/<urlset[\s>]/i.test(xml)) {
        throw new Error(`El documento no es un <urlset> (¿sitemapindex?) en ${medio.sitemapUrl}`)
      }

      const entradas = parsearSitemapNews(xml)
      const urlsSitemap = new Set(entradas.map((entrada) => entrada.url))

      // Nuevas = no vistas, más recientes primero (una noticia fresca no debe
      // esperar detrás del backlog del arranque). Desempate por URL ascendente
      // para que el orden sea determinista.
      const nuevas = entradas
        .filter((entrada) => !cachePrevia.has(entrada.url))
        .sort((a, b) => {
          const tiempoA = Date.parse(a.fecha ?? '') || 0
          const tiempoB = Date.parse(b.fecha ?? '') || 0
          if (tiempoA !== tiempoB) return tiempoB - tiempoA
          return a.url < b.url ? -1 : a.url > b.url ? 1 : 0
        })
        .slice(0, maxDescargas)

      // mapaConLimite conserva el orden de entrada: el resultado es determinista
      // aunque las descargas terminen en cualquier orden.
      const resultados = await mapaConLimite(nuevas, concurrencia, async (entrada) => {
        // El extractor nunca lanza: una nota borrada o bloqueada produce null.
        // Se emite igual con texto vacío (el titular aún puede tener la mención)
        // y se marca vista, para que no queme presupuesto en cada corrida.
        const contenido = await extractor.obtenerContenido(entrada.url)
        return {
          titular: quitarSufijoDeMedio(entrada.titular, medio.nombre),
          url: entrada.url,
          fecha: entrada.fecha ?? contenido?.fechaPublicacion ?? null,
          texto: contenido?.texto ?? '',
        }
      })

      // cache = (previa ∩ sitemap actual) ∪ procesadas: lo que salió del sitemap
      // se poda (no vuelve), lo intentado esta corrida queda marcado.
      const cache = new Set()
      for (const url of cachePrevia) {
        if (urlsSitemap.has(url)) cache.add(url)
      }
      for (const item of resultados) {
        cache.add(item.url)
      }

      return { items: resultados, cache }
    },
  }
}

// --- Parseo puro (exportado para tests) ---

// Tolera los estilos vistos en sitemaps chilenos reales: XML de una sola línea
// (Meganoticias), indentado multilínea (El Divisadero), con CDATA (Puranoticia)
// y con prefijo de namespace distinto de "news:" (Radio Pauta declara xmlns:n).
// Bloques sin <loc> o sin <prefijo>:news se descartan en silencio.
export function parsearSitemapNews(xml) {
  const texto = String(xml)
  // El prefijo del namespace de noticias lo elige cada medio: se lee de la
  // declaración xmlns:<prefijo>="…sitemap-news…" (por defecto, "news").
  const declaracion = texto.match(/xmlns:([\w-]+)\s*=\s*"[^"]*sitemap-news[^"]*"/i)
  const prefijo = declaracion ? declaracion[1] : 'news'

  const entradas = []
  const marcaNews = new RegExp(`<${prefijo}:news[\\s>]`, 'i')
  for (const bloque of texto.split('</url>')) {
    const url = extraerCampo(bloque, 'loc')
    if (!url) continue
    if (!marcaNews.test(bloque)) continue
    entradas.push({
      url,
      titular: extraerCampo(bloque, `${prefijo}:title`) ?? '',
      fecha: extraerCampo(bloque, `${prefijo}:publication_date`) ?? null,
    })
  }
  return entradas
}

// Quita únicamente el sufijo exacto " - Nombre Del Medio" anclado al final.
// Fail-open: si el sufijo no está (o el medio lo cambió), el titular queda
// intacto — nunca se mutila un titular con " - " interno.
export function quitarSufijoDeMedio(titular, nombreMedio) {
  const escapado = String(nombreMedio).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return String(titular).replace(new RegExp(`\\s+-\\s+${escapado}\\s*$`, 'i'), '').trim()
}

function extraerCampo(bloque, etiqueta) {
  const patron = new RegExp(`<${etiqueta}[^>]*>([\\s\\S]*?)</${etiqueta}>`, 'i')
  const coincidencia = bloque.match(patron)
  if (!coincidencia) return null
  const valor = limpiarValorXml(coincidencia[1])
  return valor === '' ? null : valor
}

// CDATA + entidades XML → texto plano de una línea (espejo de limpiarTexto en
// fuente-rss.js, sin quitar tags: estos campos no traen HTML).
function limpiarValorXml(valor) {
  return String(valor)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
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
