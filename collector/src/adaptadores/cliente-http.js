// Cliente HTTP único del collector.
//
// Antes había SEIS llamadas a `fetch` sueltas (RSS, sitemap, Google News x3, extractor) y
// solo una pasaba por fetchSeguro. Sin un punto único no hay dónde enchufar robots.txt:
// habría que acordarse de comprobarlo en cada sitio, y cada fuente nueva sería una vía
// para saltárselo sin que nadie lo note.
//
// Todo lo que sale a la red pasa por acá y en este orden:
//
//   1. robots.txt del origen  -> si prohíbe, se lanza SinPermiso y NO se pide nada.
//   2. Crawl-delay del origen -> se espera el turno.
//   3. fetchSeguro            -> validación anti-SSRF y redirecciones revalidadas.
//
// Las redirecciones son el punto delicado: fetchSeguro las sigue revalidando el host,
// pero un salto puede llevar a una ruta que el robots.txt del destino prohíbe. Por eso la
// URL FINAL se vuelve a comprobar y, si no está permitida, la respuesta se descarta.

import { fetchSeguro } from './fetch-seguro.js'

/**
 * Lee el cuerpo respetando el charset que declara el medio.
 *
 * `respuesta.text()` asume UTF-8 SIEMPRE. Buena parte de la prensa regional chilena
 * sirve todavía ISO-8859-1 —El Divisadero declara `text/html; charset=iso-8859-1`— y
 * decodificarla como UTF-8 produce el clásico "due<U+FFFD>os", "jur<U+FFFD>dica",
 * "par<U+FFFD>metros". Eso no es un defecto cosmético: ese texto corrupto es el que se
 * guarda como extracto y el que se muestra a SECOM.
 *
 * Se lee el charset de la cabecera y, si no viene, del `<meta charset>` del propio
 * documento. Ante un charset desconocido se cae a UTF-8, que es el comportamiento previo.
 */
export async function leerTexto(respuesta) {
  const bytes = new Uint8Array(await respuesta.arrayBuffer())
  const tipo = respuesta.headers?.get?.('content-type') ?? ''

  let charset = tipo.match(/charset=\s*"?([\w-]+)"?/i)?.[1]
  if (!charset) {
    // Sin cabecera: mirar el <meta charset> en los primeros KB, donde siempre está.
    const cabecera = new TextDecoder('utf-8').decode(bytes.slice(0, 4096))
    charset =
      cabecera.match(/<meta[^>]+charset=["']?\s*([\w-]+)/i)?.[1] ??
      cabecera.match(/content=["'][^"']*charset=\s*([\w-]+)/i)?.[1]
  }

  try {
    return new TextDecoder(charset || 'utf-8').decode(bytes)
  } catch {
    // Charset que TextDecoder no conoce: mejor UTF-8 que reventar la corrida.
    return new TextDecoder('utf-8').decode(bytes)
  }
}

export class SinPermiso extends Error {
  constructor(url) {
    super(`robots.txt no permite pedir ${url}`)
    this.name = 'SinPermiso'
    this.url = url
  }
}

/**
 * `transporte` es inyectable y por defecto es `fetchSeguro`, que valida el host y
 * revalida cada redirección (anti-SSRF). Se puede sustituir por `fetch` a secas en
 * pruebas herméticas: fetchSeguro hace una resolución DNS real y un test no debe salir
 * a la red para comprobar que se envía la cabecera correcta.
 *
 * @param {{politica: {puedePedir(url):Promise<boolean>, esperarTurno(url):Promise<void>}|null,
 *          userAgent: string, timeoutMs?: number, transporte?: Function}} config
 */
export function crearClienteHttp({
  politica = null,
  userAgent,
  timeoutMs = 20_000,
  transporte = fetchSeguro,
} = {}) {
  return {
    /**
     * @throws {SinPermiso} si robots.txt lo prohíbe. Se lanza en vez de devolver null a
     *   propósito: cada fuente ya sabe reportar sus fallos en el resumen de la corrida,
     *   y un null silencioso se confundiría con "el medio no publicó nada".
     */
    async pedir(url, { headers = {}, timeoutMs: timeoutPropio, ...resto } = {}) {
      if (politica && !(await politica.puedePedir(url))) {
        throw new SinPermiso(url)
      }
      if (politica) await politica.esperarTurno(url)

      const respuesta = await transporte(url, {
        ...resto,
        headers: { 'user-agent': userAgent, ...headers },
        signal: AbortSignal.timeout(timeoutPropio ?? timeoutMs),
      })

      // Redirección a una ruta que el destino no permite: no se lee el cuerpo.
      const destino = respuesta.url
      if (politica && destino && destino !== url && !(await politica.puedePedir(destino))) {
        throw new SinPermiso(destino)
      }

      return respuesta
    },
  }
}
