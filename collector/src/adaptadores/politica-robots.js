// Adaptador del puerto politica-de-rastreo: consulta /robots.txt por origen, lo cachea y
// serializa las peticiones a cada host según su Crawl-delay.
//
// SEMÁNTICA DE FALLO (deliberada, sigue RFC 9309 §2.3.1):
//
//   - 2xx  -> se aplican sus reglas.
//   - 4xx  -> no hay robots.txt: se permite todo. Es lo que dice el RFC y es lo
//             razonable: la ausencia de una prohibición no es una prohibición.
//   - 5xx, timeout o error de red -> se PROHÍBE ese origen durante esta corrida.
//
// El último punto es el que importa: ante la duda no se pide. El costo está acotado a
// propósito — esa corrida no trae notas nuevas de ese medio, pero la ventana ya publicada
// sigue intacta y la página no se cae. Es "fail-closed para pedir, fail-open para el
// boletín".
//
// La caché se persiste en el estado JSON (campo `robotsCache`), hermana de
// resolucionesGoogle y sitemapVisto, con TTL para revalidar a diario.

import { crawlDelayMs, parsearRobots, permiteRuta } from '../dominio/robots.js'
import { fetchSeguro } from './fetch-seguro.js'

// Un robots.txt gigante es casi siempre un error de configuración del medio (una página
// HTML servida en esa ruta). Cortar por tamaño evita bufferizarla entera.
const MAX_BYTES_ROBOTS = 512_000

export function crearPoliticaRobots({
  userAgent,
  timeoutMs = 10_000,
  ttlHoras = 24,
  crawlDelayPorDefectoMs = 0,
  crawlDelayMaximoMs = 10_000,
  cachePrevia = {},
  // Orígenes cuyo robots.txt NO se consulta (ver ROBOTS_EXENTOS en config/parametros.js).
  // Es una decisión declarada del operador, no una heurística: va acá y no en un rodeo
  // fuera de la política para que exista UN solo lugar donde auditar a quién se exime.
  exentos = [],
  ahora = () => Date.now(),
  // Inyectables para poder probar la política sin salir a la red ni resolver DNS
  // (fetchSeguro hace dns.lookup real). Mismo criterio que cliente-http.js.
  transporte = fetchSeguro,
  dormir = (ms) => new Promise((listo) => setTimeout(listo, ms)),
} = {}) {
  const ttlMs = ttlHoras * 3600_000
  // origen -> { texto, obtenidoEn, permitido }  (permitido=false => 5xx/red caída)
  const cache = new Map(Object.entries(cachePrevia ?? {}))
  const parseados = new Map()
  // origen -> promesa de la última petición, para serializar el Crawl-delay
  const turnos = new Map()

  // Coincide con el host exacto y con sus subdominios ("google.com" cubre
  // "news.google.com"), igual que el criterio de dominiosExcluidos del proyecto.
  function estaExento(url) {
    let host
    try { host = new URL(url).hostname.toLowerCase() } catch { return false }
    return exentos.some((e) => {
      const d = String(e).toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '')
      return host === d || host.endsWith(`.${d}`)
    })
  }

  function origenDe(url) {
    try {
      return new URL(url).origin
    } catch {
      return null
    }
  }

  async function descargar(origen) {
    try {
      const respuesta = await transporte(`${origen}/robots.txt`, {
        headers: { 'user-agent': userAgent, accept: 'text/plain' },
        signal: AbortSignal.timeout(timeoutMs),
      })

      // 4xx: no hay robots.txt. Permitido, y se cachea para no volver a preguntar.
      if (respuesta.status >= 400 && respuesta.status < 500) {
        return { texto: '', obtenidoEn: ahora(), permitido: true }
      }
      if (!respuesta.ok) {
        return { texto: '', obtenidoEn: ahora(), permitido: false }
      }

      const largo = Number(respuesta.headers.get('content-length'))
      if (Number.isFinite(largo) && largo > MAX_BYTES_ROBOTS) {
        return { texto: '', obtenidoEn: ahora(), permitido: true }
      }
      const texto = (await respuesta.text()).slice(0, MAX_BYTES_ROBOTS)
      return { texto, obtenidoEn: ahora(), permitido: true }
    } catch {
      // Timeout o red caída: ante la duda, no se pide.
      return { texto: '', obtenidoEn: ahora(), permitido: false }
    }
  }

  async function entradaDe(origen) {
    const guardada = cache.get(origen)
    if (guardada && ahora() - (guardada.obtenidoEn ?? 0) < ttlMs) return guardada

    const nueva = await descargar(origen)
    cache.set(origen, nueva)
    parseados.delete(origen)
    return nueva
  }

  function reglasDe(origen, entrada) {
    if (!parseados.has(origen)) parseados.set(origen, parsearRobots(entrada.texto))
    return parseados.get(origen)
  }

  return {
    async puedePedir(url) {
      // La exención se comprueba ANTES de pedir el robots.txt: eximir a un origen y aun
      // así descargarle el robots.txt sería gasto de red sin ninguna consecuencia.
      if (estaExento(url)) return true

      const origen = origenDe(url)
      if (!origen) return false

      const entrada = await entradaDe(origen)
      if (!entrada.permitido) return false

      const { pathname, search } = new URL(url)
      return permiteRuta(reglasDe(origen, entrada), userAgent, `${pathname}${search}`)
    },

    /**
     * Espera lo que corresponda antes de pedir a este host.
     *
     * Serializa por origen encadenando promesas: dos descargas concurrentes al mismo
     * medio no pueden saltarse el Crawl-delay. El tope evita que un medio con
     * `Crawl-delay: 3600` cuelgue la corrida entera —respetarlo literalmente haría que
     * una sola nota consumiera la hora completa entre corridas—.
     */
    async esperarTurno(url) {
      // Un origen exento no declara Crawl-delay para nosotros, pero sigue pasando por el
      // por-defecto: eximirlo de la prohibición no es permiso para atropellarlo.
      const origen = origenDe(url)
      if (!origen) return

      const entrada = cache.get(origen)
      const declarado = entrada ? crawlDelayMs(reglasDe(origen, entrada), userAgent) : null
      const espera = Math.min(declarado ?? crawlDelayPorDefectoMs, crawlDelayMaximoMs)
      if (espera <= 0) return

      const anterior = turnos.get(origen) ?? Promise.resolve()
      const turno = anterior.then(() => dormir(espera))
      turnos.set(origen, turno.catch(() => {}))
      await turno
    },

    /** Para persistir en el estado (ver main.js, campo robotsCache). */
    instantanea() {
      return Object.fromEntries([...cache].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
    },
  }
}
