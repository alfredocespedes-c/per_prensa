// Parseo y evaluación de robots.txt. Puro, sin I/O (el fetch y la caché viven en
// adaptadores/politica-robots.js).
//
// Sigue el RFC 9309 en lo que importa para un recolector de prensa:
//
//   - Los grupos se eligen por User-Agent: gana el más específico que casa con el
//     nuestro; si ninguno casa, el grupo `*`. Los grupos con el MISMO agente se fusionan.
//   - Las rutas se comparan por PREFIJO, con `*` (cualquier secuencia) y `$` (fin).
//   - Entre reglas que casan gana la MÁS LARGA; ante empate, gana Allow. Esto no es un
//     detalle: es lo que hace que `Disallow: /` + `Allow: /topics/` signifique "solo
//     /topics/", que es exactamente la forma del robots.txt de news.google.com.
//   - `Disallow:` vacío significa permitir todo (es la forma de abrir un grupo).
//   - Crawl-delay se lee del grupo elegido, en segundos.

const LINEA = /^\s*([a-zA-Z-]+)\s*:\s*(.*?)\s*(?:#.*)?$/

function escaparRegex(texto) {
  return texto.replace(/[.+?^${}()|[\]\\]/g, '\\$&')
}

/** Un patrón de robots.txt a RegExp anclado al inicio de la ruta. */
function patronARegex(patron) {
  let fuente = ''
  for (const caracter of patron) {
    if (caracter === '*') fuente += '.*'
    else if (caracter === '$') fuente += '$'
    else fuente += escaparRegex(caracter)
  }
  return new RegExp(`^${fuente}`)
}

/**
 * @param {string} texto contenido de /robots.txt
 * @returns {{grupos: Array<{agentes:string[], reglas:Array<{permitir:boolean,patron:string,regex:RegExp,largo:number}>, crawlDelayMs:number|null}>}}
 */
export function parsearRobots(texto) {
  const grupos = []
  let actual = null
  // Un bloque de User-Agent consecutivos comparte reglas: "User-agent: a\nUser-agent: b\nDisallow: /"
  let esperandoAgentes = false

  for (const cruda of String(texto ?? '').split(/\r?\n/)) {
    const coincidencia = cruda.match(LINEA)
    if (!coincidencia) continue
    const campo = coincidencia[1].toLowerCase()
    const valor = coincidencia[2]

    if (campo === 'user-agent') {
      if (!esperandoAgentes || actual === null) {
        actual = { agentes: [], reglas: [], crawlDelayMs: null }
        grupos.push(actual)
        esperandoAgentes = true
      }
      actual.agentes.push(valor.toLowerCase())
      continue
    }

    if (actual === null) continue // directiva huérfana antes de cualquier User-agent
    esperandoAgentes = false

    if (campo === 'allow' || campo === 'disallow') {
      // `Disallow:` vacío = sin restricción. No genera regla (y por eso un grupo con
      // solo esa línea permite todo).
      if (valor === '') continue
      actual.reglas.push({
        permitir: campo === 'allow',
        patron: valor,
        regex: patronARegex(valor),
        largo: valor.length,
      })
    } else if (campo === 'crawl-delay') {
      const segundos = Number(valor.replace(',', '.'))
      if (Number.isFinite(segundos) && segundos >= 0) {
        actual.crawlDelayMs = Math.round(segundos * 1000)
      }
    }
  }

  return { grupos }
}

/** El token de producto del User-Agent: "COIPO_PRENSA/1.0 (…)" -> "coipo_prensa". */
export function tokenDeAgente(userAgent) {
  return String(userAgent ?? '')
    .trim()
    .split(/[/\s]/)[0]
    .toLowerCase()
}

/**
 * Elige el grupo aplicable: el agente más específico que casa, si no `*`, si no ninguno.
 * La comparación es por subcadena e insensible a mayúsculas, como manda el RFC.
 */
export function grupoAplicable(robots, userAgent) {
  const token = tokenDeAgente(userAgent)
  let mejor = null
  let mejorLargo = -1
  let comodin = null

  for (const grupo of robots?.grupos ?? []) {
    for (const agente of grupo.agentes) {
      if (agente === '*') {
        // Varios grupos `*` (biobiochile.cl tiene más de uno): se fusionan.
        comodin = comodin
          ? {
              agentes: ['*'],
              reglas: [...comodin.reglas, ...grupo.reglas],
              crawlDelayMs: comodin.crawlDelayMs ?? grupo.crawlDelayMs,
            }
          : grupo
        continue
      }
      if (token && token.includes(agente) && agente.length > mejorLargo) {
        mejor = grupo
        mejorLargo = agente.length
      }
    }
  }

  return mejor ?? comodin ?? null
}

/**
 * ¿Se puede pedir esta ruta?
 *
 * Sin grupo aplicable, se permite: un robots.txt que no habla de nosotros no nos
 * prohíbe nada. La decisión de qué hacer cuando el robots.txt no se pudo LEER es otra
 * cosa y la toma el adaptador (ver politica-robots.js).
 *
 * @param {object|null} robots resultado de parsearRobots
 * @param {string} userAgent
 * @param {string} ruta pathname + search
 */
export function permiteRuta(robots, userAgent, ruta) {
  const grupo = grupoAplicable(robots, userAgent)
  if (!grupo || grupo.reglas.length === 0) return true

  const camino = ruta || '/'
  let ganadora = null
  for (const regla of grupo.reglas) {
    if (!regla.regex.test(camino)) continue
    // Más larga gana; ante empate gana Allow (RFC 9309 §2.2.2).
    if (
      ganadora === null ||
      regla.largo > ganadora.largo ||
      (regla.largo === ganadora.largo && regla.permitir && !ganadora.permitir)
    ) {
      ganadora = regla
    }
  }

  return ganadora ? ganadora.permitir : true
}

/** Crawl-delay declarado para nuestro agente, en ms, o null. */
export function crawlDelayMs(robots, userAgent) {
  return grupoAplicable(robots, userAgent)?.crawlDelayMs ?? null
}
