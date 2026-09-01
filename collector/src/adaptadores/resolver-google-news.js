// Resuelve un enlace de Google News (news.google.com/rss/articles/…) a la URL
// real del medio.
//
// ADVERTENCIA: usa el endpoint interno NO DOCUMENTADO `batchexecute` de Google
// News. No es una API pública; Google ya cambió una vez el formato del enlace
// (antes la URL venía en base64, hoy va cifrada). Si vuelve a cambiarlo, esta
// función devolverá null y el pipeline simplemente no incorporará el ítem de
// Google (la fuente RSS curada y el estado previo no se ven afectados).

import { crearClienteHttp } from './cliente-http.js'

const ENDPOINT = 'https://news.google.com/_/DotsSplashUi/data/batchexecute'

export function crearResolutorGoogleNews({ timeoutMs = 15000, userAgent, cliente = null } = {}) {
  // Ver la nota de fuente-rss.js. Con robots.txt activo estas dos peticiones quedan
  // prohibidas por news.google.com y `resolver` devuelve null, que es el mismo camino
  // de degradación que ya existía para cuando Google cambia el formato del enlace.
  const http = cliente ?? crearClienteHttp({ userAgent, timeoutMs, transporte: fetch })

  return {
    // Devuelve la URL real (string) o null si no se pudo resolver.
    async resolver(enlaceGoogle) {
      try {
        const idArticulo = enlaceGoogle.split('/articles/')[1]?.split('?')[0]
        if (!idArticulo) return null

        // 1. La página del artículo en Google trae la firma y el timestamp
        //    necesarios para la llamada interna.
        const pagina = await http.pedir(enlaceGoogle, { timeoutMs })
        if (!pagina.ok) return null
        const html = await pagina.text()
        const firma = html.match(/data-n-a-sg="([^"]+)"/)?.[1]
        const timestamp = html.match(/data-n-a-ts="([^"]+)"/)?.[1]
        if (!firma || !timestamp) return null

        // 2. Llamada al endpoint interno que traduce el id cifrado a la URL real.
        const peticion = [
          [
            [
              'Fbv4je',
              JSON.stringify([
                'garturlreq',
                [
                  ['X', 'X', ['X', 'X'], null, null, 1, 1, 'US:en', null, 1, null, null, null, null, null, 0, 1],
                  'X',
                  'X',
                  1,
                  [1, 1, 1],
                  1,
                  1,
                  null,
                  0,
                  0,
                  null,
                  0,
                ],
                idArticulo,
                timestamp,
                firma,
              ]),
              null,
              'generic',
            ],
          ],
        ]
        const respuesta = await http.pedir(ENDPOINT, {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' },
          body: `f.req=${encodeURIComponent(JSON.stringify(peticion))}`,
          timeoutMs,
        })
        if (!respuesta.ok) return null
        const texto = (await respuesta.text()).replace(/\\u002F/g, '/').replace(/\\\//g, '/')
        const real = texto.match(/https?:\/\/(?!news\.google\.com)[^\\"\s]+/)?.[0]
        return real ?? null
      } catch {
        return null // cualquier fallo de red/parseo: no resolvemos este ítem
      }
    },
  }
}
