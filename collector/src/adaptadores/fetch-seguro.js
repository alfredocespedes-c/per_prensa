// Fetch endurecido contra SSRF (SEC-03, CWE-918).
//
// El collector es el ÚNICO componente con línea de vista a la red interna (archiva en
// Postgres). Descarga URLs que provienen de fuentes NO confiables: la URL real resuelta
// desde Google News, los <loc> de sitemaps, los links de RSS. Sin control, una de esas
// URLs (directa o vía redirección 3xx) podría apuntar a 169.254.169.254 (metadata cloud)
// o a un servicio interno (172.31.x, 10.x, …) y el collector la alcanzaría server-side.
//
// fetchSeguro: (1) exige esquema http/https; (2) rechaza hosts que sean IP privada/
// link-local/loopback literal O que resuelvan (DNS) a una; (3) sigue las redirecciones
// MANUALMENTE, revalidando el host en CADA salto. Fail-closed: ante cualquier duda, lanza.
//
// Residual conocido: DNS-rebinding (un host que resuelve a IP pública en la validación y a
// IP privada al conectar) no se cierra del todo sin fijar la IP resuelta en la conexión.

import dns from 'node:dns/promises'

const MAX_REDIRECCIONES = 5

// ¿La IP (v4/v6) cae en un rango privado, loopback, link-local o no ruteable? Pura.
export function esIpPrivada(ip) {
  const limpia = String(ip).trim().replace(/^\[|\]$/g, '').toLowerCase()
  const v4 = limpia.match(/^(?:::ffff:)?(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (v4) {
    const a = Number(v4[1])
    const b = Number(v4[2])
    if (a === 0 || a === 10 || a === 127) return true
    if (a === 169 && b === 254) return true // link-local (incl. metadata cloud)
    if (a === 172 && b >= 16 && b <= 31) return true // 172.16/12
    if (a === 192 && b === 168) return true
    if (a === 100 && b >= 64 && b <= 127) return true // CGNAT 100.64/10
    return false
  }
  if (limpia === '' || limpia === '::' || limpia === '::1') return true
  return /^(fe80|fc|fd)/.test(limpia) // link-local + unique-local IPv6
}

// ¿La URL usa esquema http/https? Pura.
export function esUrlHttp(url) {
  try {
    const protocolo = new URL(url).protocol
    return protocolo === 'http:' || protocolo === 'https:'
  } catch {
    return false
  }
}

// Rechaza si el host es IP privada literal o si resuelve (DNS) a una IP privada.
async function hostPermitido(host) {
  if (esIpPrivada(host)) return false
  try {
    const direcciones = await dns.lookup(host, { all: true })
    return !direcciones.some((d) => esIpPrivada(d.address))
  } catch {
    return false // no resuelve ⇒ no se descarga
  }
}

// fetch endurecido: valida cada URL (incluidas las redirecciones) antes de conectar.
// Lanza si el esquema o el host no están permitidos, o si hay demasiados saltos.
export async function fetchSeguro(urlInicial, opciones = {}) {
  let url = String(urlInicial)
  for (let salto = 0; salto <= MAX_REDIRECCIONES; salto += 1) {
    if (!esUrlHttp(url)) throw new Error(`fetchSeguro: esquema no permitido (${url})`)
    const host = new URL(url).hostname.replace(/^\[|\]$/g, '')
    if (!(await hostPermitido(host))) throw new Error(`fetchSeguro: host bloqueado (${host})`)

    const respuesta = await fetch(url, { ...opciones, redirect: 'manual' })
    const location = respuesta.headers.get('location')
    if (respuesta.status >= 300 && respuesta.status < 400 && location) {
      url = new URL(location, url).toString() // resuelve Location relativos
      continue
    }
    return respuesta
  }
  throw new Error('fetchSeguro: demasiadas redirecciones')
}
