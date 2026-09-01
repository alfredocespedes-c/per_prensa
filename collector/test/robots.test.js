import { describe, expect, it } from 'vitest'
import { crawlDelayMs, parsearRobots, permiteRuta, tokenDeAgente } from '../src/dominio/robots.js'

const UA = 'COIPO_PRENSA/1.0 (monitor de prensa CONAF; https://github.com/conaf/COIPO_PRENSA)'

const permite = (texto, ruta, ua = UA) => permiteRuta(parsearRobots(texto), ua, ruta)

describe('tokenDeAgente', () => {
  it('extrae el token de producto del User-Agent completo', () => {
    expect(tokenDeAgente(UA)).toBe('coipo_prensa')
    expect(tokenDeAgente('Googlebot/2.1')).toBe('googlebot')
  })
})

describe('permiteRuta', () => {
  it('sin robots.txt aplicable, permite', () => {
    expect(permite('', '/nota')).toBe(true)
    expect(permite('# solo un comentario', '/nota')).toBe(true)
  })

  it('Disallow vacío abre el grupo entero', () => {
    expect(permite('User-agent: *\nDisallow:', '/lo-que-sea')).toBe(true)
  })

  it('respeta un Disallow por prefijo', () => {
    const txt = 'User-agent: *\nAllow: /\nDisallow: /pf/api/v3/*\nDisallow: /search/?q=*'
    expect(permite(txt, '/noticia/incendio')).toBe(true)
    expect(permite(txt, '/pf/api/v3/content')).toBe(false)
    expect(permite(txt, '/search/?q=conaf')).toBe(false)
  })

  it('la regla MÁS LARGA gana sobre la más corta', () => {
    // Es lo que hace que "Disallow: / + Allow: /topics/" signifique "solo /topics/".
    const txt = 'User-agent: *\nDisallow: /\nAllow: /topics/'
    expect(permite(txt, '/topics/CONAF')).toBe(true)
    expect(permite(txt, '/rss/search?q=conaf')).toBe(false)
  })

  it('ante empate de largo gana Allow', () => {
    const txt = 'User-agent: *\nDisallow: /nota\nAllow: /nota'
    expect(permite(txt, '/nota/1')).toBe(true)
  })

  it('interpreta $ como fin de ruta', () => {
    const txt = 'User-agent: *\nDisallow: /\nAllow: /$'
    expect(permite(txt, '/')).toBe(true)
    expect(permite(txt, '/algo')).toBe(false)
  })

  it('elige el grupo más específico para nuestro agente', () => {
    const txt = [
      'User-agent: *',
      'Disallow: /',
      '',
      'User-agent: COIPO_PRENSA',
      'Allow: /',
    ].join('\n')
    expect(permite(txt, '/nota')).toBe(true)
    // Otro agente sigue cayendo en el grupo comodín.
    expect(permite(txt, '/nota', 'OtroBot/1.0')).toBe(false)
  })

  it('fusiona varios grupos comodín (biobiochile.cl declara más de uno)', () => {
    const txt = [
      'User-agent: Twitterbot',
      'Disallow:',
      '',
      'User-agent: *',
      '',
      'User-agent: Mediapartners-Google',
      'Disallow:',
    ].join('\n')
    // El grupo `*` de ese archivo no trae reglas: permite todo.
    expect(permite(txt, '/2026/08/11/nota.shtml')).toBe(true)
  })

  it('un bloque con varios User-agent seguidos comparte las reglas', () => {
    const txt = 'User-agent: a\nUser-agent: COIPO_PRENSA\nDisallow: /privado'
    expect(permite(txt, '/privado/x')).toBe(false)
    expect(permite(txt, '/publico')).toBe(true)
  })

  it('ignora directivas huérfanas antes del primer User-agent', () => {
    expect(permite('Disallow: /\nUser-agent: *\nAllow: /', '/nota')).toBe(true)
  })

  // Caso REAL verificado contra https://news.google.com/robots.txt el 2026-08-11.
  it('el robots.txt real de news.google.com prohíbe /rss/search y batchexecute', () => {
    const txt = [
      'User-agent: *',
      'Disallow: /',
      'Allow: /$',
      'Allow: /?',
      'Allow: /home$',
      'Allow: /topics/',
      'Allow: /stories/',
      'Allow: /about$',
    ].join('\n')

    expect(permite(txt, '/rss/search?q=%22CONAF%22')).toBe(false)
    expect(permite(txt, '/_/DotsSplashUi/data/batchexecute')).toBe(false)
    expect(permite(txt, '/topics/CAAqIQ')).toBe(true)
  })
})

describe('crawlDelayMs', () => {
  it('lee Crawl-delay del grupo aplicable, en milisegundos', () => {
    expect(crawlDelayMs(parsearRobots('User-agent: *\nCrawl-delay: 2'), UA)).toBe(2000)
    expect(crawlDelayMs(parsearRobots('User-agent: *\nCrawl-delay: 0.5'), UA)).toBe(500)
  })

  it('un Crawl-delay dirigido a otro agente no nos aplica', () => {
    const txt = 'User-agent: bingbot\nCrawl-delay: 10\n\nUser-agent: *\nDisallow:'
    expect(crawlDelayMs(parsearRobots(txt), UA)).toBeNull()
  })

  it('sin Crawl-delay devuelve null', () => {
    expect(crawlDelayMs(parsearRobots('User-agent: *\nDisallow: /x'), UA)).toBeNull()
  })
})
