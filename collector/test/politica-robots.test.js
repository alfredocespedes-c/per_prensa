import { describe, expect, it, vi } from 'vitest'
import { crearPoliticaRobots } from '../src/adaptadores/politica-robots.js'

const UA = 'COIPO_PRENSA/1.0'

function respuesta(status, texto = '', cabeceras = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (n) => cabeceras[n.toLowerCase()] ?? null },
    text: async () => texto,
  }
}

function politicaCon(porOrigen, extra = {}) {
  const transporte = vi.fn(async (url) => {
    const origen = new URL(url).origin
    const guion = porOrigen[origen]
    if (typeof guion === 'function') return guion()
    return guion ?? respuesta(404)
  })
  const dormidas = []
  return {
    transporte,
    dormidas,
    politica: crearPoliticaRobots({
      userAgent: UA,
      transporte,
      dormir: async (ms) => { dormidas.push(ms) },
      ...extra,
    }),
  }
}

describe('crearPoliticaRobots', () => {
  it('aplica las reglas del robots.txt del origen', async () => {
    const { politica } = politicaCon({
      'https://medio.cl': respuesta(200, 'User-agent: *\nAllow: /\nDisallow: /privado'),
    })

    expect(await politica.puedePedir('https://medio.cl/nota')).toBe(true)
    expect(await politica.puedePedir('https://medio.cl/privado/x')).toBe(false)
  })

  it('404 en robots.txt = no hay robots.txt = se permite todo (RFC 9309)', async () => {
    // La ausencia de una prohibición no es una prohibición.
    const { politica } = politicaCon({ 'https://medio.cl': respuesta(404) })
    expect(await politica.puedePedir('https://medio.cl/nota')).toBe(true)
  })

  it('5xx PROHIBE ese origen durante la corrida', async () => {
    // Fail-closed para pedir: ante la duda no se pide. El costo está acotado — esa
    // corrida no trae notas nuevas de ese medio, pero la ventana publicada sigue intacta.
    const { politica } = politicaCon({ 'https://medio.cl': respuesta(503) })
    expect(await politica.puedePedir('https://medio.cl/nota')).toBe(false)
  })

  it('un error de red también prohíbe', async () => {
    const { politica } = politicaCon({
      'https://medio.cl': () => { throw new Error('ETIMEDOUT') },
    })
    expect(await politica.puedePedir('https://medio.cl/nota')).toBe(false)
  })

  it('una URL inválida se rechaza en vez de pasar', async () => {
    const { politica } = politicaCon({})
    expect(await politica.puedePedir('no-es-una-url')).toBe(false)
  })

  it('pide el robots.txt UNA sola vez por origen', async () => {
    // Con ~60 dominios y una corrida por hora, re-pedirlo en cada petición multiplicaría
    // por diez el tráfico que este sistema genera a los medios.
    const { politica, transporte } = politicaCon({
      'https://medio.cl': respuesta(200, 'User-agent: *\nDisallow:'),
    })

    await politica.puedePedir('https://medio.cl/a')
    await politica.puedePedir('https://medio.cl/b')
    await politica.puedePedir('https://medio.cl/c')

    expect(transporte).toHaveBeenCalledTimes(1)
  })

  it('reusa la caché previa del estado sin volver a pedirla', async () => {
    const { politica, transporte } = politicaCon(
      { 'https://medio.cl': respuesta(200, 'User-agent: *\nDisallow: /') },
      {
        cachePrevia: {
          'https://medio.cl': { texto: 'User-agent: *\nDisallow:', obtenidoEn: 1000, permitido: true },
        },
        ahora: () => 2000,
      },
    )

    expect(await politica.puedePedir('https://medio.cl/nota')).toBe(true)
    expect(transporte).not.toHaveBeenCalled()
  })

  it('revalida cuando la caché venció', async () => {
    const { politica, transporte } = politicaCon(
      { 'https://medio.cl': respuesta(200, 'User-agent: *\nDisallow: /') },
      {
        ttlHoras: 1,
        cachePrevia: {
          'https://medio.cl': { texto: '', obtenidoEn: 0, permitido: true },
        },
        ahora: () => 3600_000 * 2,
      },
    )

    expect(await politica.puedePedir('https://medio.cl/nota')).toBe(false)
    expect(transporte).toHaveBeenCalledTimes(1)
  })

  it('la instantánea es serializable y estable en orden', async () => {
    const { politica } = politicaCon({
      'https://b.cl': respuesta(200, 'User-agent: *\nDisallow:'),
      'https://a.cl': respuesta(200, 'User-agent: *\nDisallow:'),
    })
    await politica.puedePedir('https://b.cl/x')
    await politica.puedePedir('https://a.cl/x')

    const instantanea = politica.instantanea()
    expect(Object.keys(instantanea)).toEqual(['https://a.cl', 'https://b.cl'])
    expect(() => JSON.stringify(instantanea)).not.toThrow()
  })

  it('espera el Crawl-delay declarado por el medio', async () => {
    const { politica, dormidas } = politicaCon({
      'https://medio.cl': respuesta(200, 'User-agent: *\nCrawl-delay: 2'),
    })
    await politica.puedePedir('https://medio.cl/a')
    await politica.esperarTurno('https://medio.cl/a')

    expect(dormidas).toEqual([2000])
  })

  it('acota un Crawl-delay desmedido', async () => {
    // Respetar literalmente `Crawl-delay: 3600` haría que una sola nota consumiera la
    // hora entera entre corridas.
    const { politica, dormidas } = politicaCon(
      { 'https://medio.cl': respuesta(200, 'User-agent: *\nCrawl-delay: 3600') },
      { crawlDelayMaximoMs: 10_000 },
    )
    await politica.puedePedir('https://medio.cl/a')
    await politica.esperarTurno('https://medio.cl/a')

    expect(dormidas).toEqual([10_000])
  })

  it('sin Crawl-delay no espera nada', async () => {
    const { politica, dormidas } = politicaCon({
      'https://medio.cl': respuesta(200, 'User-agent: *\nDisallow:'),
    })
    await politica.puedePedir('https://medio.cl/a')
    await politica.esperarTurno('https://medio.cl/a')

    expect(dormidas).toEqual([])
  })

  it('descarta un robots.txt desmesurado y permite (suele ser un HTML mal servido)', async () => {
    const { politica } = politicaCon({
      'https://medio.cl': respuesta(200, 'User-agent: *\nDisallow: /', {
        'content-length': '99999999',
      }),
    })
    expect(await politica.puedePedir('https://medio.cl/nota')).toBe(true)
  })
})

describe('exentos (lista blanca declarada por el operador)', () => {
  // Contexto: robots.txt es un convenio (RFC 9309), no una norma jurídica, y el
  // responsable del proyecto decidió eximir a news.google.com, cuyo `Disallow: /` bloquea
  // la red de seguridad de cobertura. La exención existe para NO tener que apagar
  // ROBOTS_ACTIVO, que cambiaría el trato hacia los 63 medios chilenos de una vez.
  const ROBOTS_TODO_PROHIBIDO = 'User-agent: *\nDisallow: /'

  it('permite un origen exento aunque su robots.txt lo prohíba entero', async () => {
    const { politica } = politicaCon(
      { 'https://news.google.com': respuesta(200, ROBOTS_TODO_PROHIBIDO) },
      { exentos: ['news.google.com'] },
    )
    expect(await politica.puedePedir('https://news.google.com/rss/search?q=CONAF')).toBe(true)
  })

  it('NO pide siquiera el robots.txt de un origen exento (no gastar red en vano)', async () => {
    const { politica, transporte } = politicaCon(
      { 'https://news.google.com': respuesta(200, ROBOTS_TODO_PROHIBIDO) },
      { exentos: ['news.google.com'] },
    )
    await politica.puedePedir('https://news.google.com/rss/search?q=CONAF')
    expect(transporte).not.toHaveBeenCalled()
  })

  it('la exención NO se derrama: los demás medios siguen gobernados', async () => {
    // Esta es la prueba que importa. Si eximir a uno relajara a los otros, la lista
    // dejaría de ser una excepción declarada y sería un apagado encubierto.
    const { politica } = politicaCon(
      {
        'https://news.google.com': respuesta(200, ROBOTS_TODO_PROHIBIDO),
        'https://medio.cl': respuesta(200, ROBOTS_TODO_PROHIBIDO),
      },
      { exentos: ['news.google.com'] },
    )
    expect(await politica.puedePedir('https://news.google.com/rss/search')).toBe(true)
    expect(await politica.puedePedir('https://medio.cl/feed/')).toBe(false)
  })

  it('cubre subdominios pero NO dominios que solo terminan parecido', async () => {
    const { politica } = politicaCon(
      {
        'https://news.google.com': respuesta(200, ROBOTS_TODO_PROHIBIDO),
        'https://google.com.evil.cl': respuesta(200, ROBOTS_TODO_PROHIBIDO),
        'https://notgoogle.com': respuesta(200, ROBOTS_TODO_PROHIBIDO),
      },
      { exentos: ['google.com'] },
    )
    expect(await politica.puedePedir('https://news.google.com/rss')).toBe(true)
    // "google.com.evil.cl" NO termina en ".google.com": un sufijo mal comparado convertiría
    // la lista en un agujero que cualquiera podría atravesar registrando un dominio.
    expect(await politica.puedePedir('https://google.com.evil.cl/x')).toBe(false)
    expect(await politica.puedePedir('https://notgoogle.com/x')).toBe(false)
  })

  it('sin lista de exentos, el comportamiento es exactamente el de antes', async () => {
    const { politica } = politicaCon({
      'https://news.google.com': respuesta(200, ROBOTS_TODO_PROHIBIDO),
    })
    expect(await politica.puedePedir('https://news.google.com/rss/search')).toBe(false)
  })

  it('un exento sigue pasando por el Crawl-delay por defecto (no es permiso para atropellar)', async () => {
    const { politica, dormidas } = politicaCon(
      {},
      { exentos: ['news.google.com'], crawlDelayPorDefectoMs: 500 },
    )
    await politica.esperarTurno('https://news.google.com/rss/search')
    await politica.esperarTurno('https://news.google.com/rss/search')
    expect(dormidas).toContain(500)
  })
})
