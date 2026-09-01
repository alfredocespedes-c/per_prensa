import { afterEach, describe, expect, it, vi } from 'vitest'
import * as extractor from '../src/adaptadores/extractor-contenido.js'
import {
  crearExtractorContenido,
  extraerAutor,
  extraerFechaPublicacion,
  extraerTexto,
} from '../src/adaptadores/extractor-contenido.js'

// El extractor descarga vía fetchSeguro (SEC-03), que valida el host antes de conectar.
// Igual que en test/fetch-seguro.test.js, los fixtures usan IP pública literal
// (http://8.8.8.8/…) para que dns.lookup resuelva sin tocar la red real.
const URL_ARTICULO = 'http://8.8.8.8/nota/conaf'

function respuestaHtml(html, headers = {}) {
  return new Response(html, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8', ...headers },
  })
}

describe('extracción de imágenes: eliminada a propósito', () => {
  it('el módulo NO expone ninguna forma de extraer una imagen', () => {
    // GUARDA de la decisión del departamento legal: las imágenes de noticias salieron de
    // las dos superficies. La forma de que no reaparezcan por descuido en una vista futura
    // es que el dato no se produzca. Antes existían cuatro patrones (og:image,
    // og:image:url y dos de twitter:image); si alguien los repone, esto falla.
    expect(extractor.extraerImagen).toBeUndefined()
    expect(Object.keys(extractor).filter((n) => /imagen/i.test(n))).toEqual([])
  })

  it('el contenido devuelto no trae ninguna clave de imagen', async () => {
    const html =
      '<head><meta property="og:image" content="https://medio.cl/foto.jpg">' +
      '<meta name="twitter:image" content="https://medio.cl/tw.jpg"></head>' +
      '<article><p>CONAF informó.</p><p>b</p><p>c</p></article>'
    vi.stubGlobal('fetch', vi.fn(async () => respuestaHtml(html)))

    const contenido = await crearExtractorContenido().obtenerContenido(URL_ARTICULO)

    expect(Object.keys(contenido)).not.toContain('imagen')
    expect(JSON.stringify(contenido)).not.toContain('foto.jpg')
    expect(JSON.stringify(contenido)).not.toContain('tw.jpg')
  })
})

describe('extraerTexto', () => {
  it('prefiere el contenido de <article> y limpia los tags', () => {
    const html =
      '<nav>menu ruido</nav><article><p>CONAF anunci&oacute; algo.</p><p>Segundo p&aacute;rrafo.</p></article>'
    const texto = extraerTexto(html)
    expect(texto).toContain('CONAF')
    expect(texto).toContain('Segundo p')
    expect(texto).not.toContain('menu ruido') // lo de fuera del artículo no entra
    expect(texto).not.toContain('<p>')
  })

  it('sin <article>/<main> junta los párrafos cuando hay al menos 3 (bloque denso)', () => {
    const html = '<div><p>Uno CONAF.</p><p>Dos.</p><p>Tres.</p></div>'
    expect(extraerTexto(html)).toBe('Uno CONAF. Dos. Tres.')
  })

  it('descarta scripts y estilos y decodifica entidades numéricas', () => {
    const html = '<article><script>var x=1</script><style>p{}</style><p>Bosque &#241;irre &amp; coihue</p></article>'
    const texto = extraerTexto(html)
    expect(texto).toBe('Bosque ñirre & coihue')
  })

  it('acota el texto a 5000 caracteres (el extracto no necesita más)', () => {
    const html = `<article><p>${'a'.repeat(9000)}</p></article>`
    expect(extraerTexto(html)).toHaveLength(5000)
  })

  it('entrada no-string devuelve cadena vacía sin lanzar', () => {
    expect(extraerTexto(null)).toBe('')
    expect(extraerTexto(undefined)).toBe('')
  })

  // --- Falso positivo por titulares ajenos -------------------------------------------
  // Estas ramas NO tenían cobertura y por ahí entró el defecto: una nota policial atribuida
  // al concepto «Forestin» porque la palabra venía en el titular enlazado de OTRA nota.
  // Ver adaptadores/limpieza-html.js y test/limpieza-html.test.js.

  it('sin <article>, un <main> que envuelve toda la página no arrastra titulares ajenos', () => {
    // Estructura real del medio que produjo el defecto: sin <article>, <main> global,
    // cuerpo corto y un listado cronológico de enlaces a otras notas.
    const html = `<html><body><main>
        <h1>PDI DETIENE A HOMBRE EN LA VÍA PÚBLICA</h1>
        <p>Detectives realizaron el procedimiento durante la madrugada.</p>
        <div class="mas-noticias">
          <a href="/club"><picture><img src="c.jpg"></picture>
            <p class="title">CLUB FORESTÍN INICIA SU SEGUNDO SEMESTRE</p></a>
        </div>
      </main></body></html>`

    const texto = extraerTexto(html)

    expect(texto).toContain('Detectives realizaron el procedimiento')
    expect(texto).not.toMatch(/forest/i) // la mención ajena no debe llegar al detector
  })

  it('un enlace INLINE dentro del cuerpo conserva su texto', () => {
    // La otra mitad del criterio: si se borrara todo <a>, una nota cuya única mención va
    // enlazada dejaría de entrar. Perder una noticia es el error inaceptable nº 2 de SECOM.
    const html = '<article><p>Según <a href="/x">CONAF</a>, el fuego está contenido.</p></article>'

    const texto = extraerTexto(html)

    expect(texto).toContain('CONAF')
    expect(texto).toContain('el fuego está contenido')
  })

  it('nav/aside/footer DENTRO del contenedor también se descartan', () => {
    // Ojo: el caso de más arriba ("prefiere el contenido de <article>") pasa solo porque el
    // <nav> está FUERA del <article>, no porque nav se descarte. Este cubre lo otro.
    const html =
      '<article><nav>Portada CONAF Deportes</nav>' +
      '<p>El cuerpo de la nota.</p>' +
      '<aside>Lo más leído: CONAF y el fuego</aside>' +
      '<footer>© 2026 CONAF</footer></article>'

    const texto = extraerTexto(html)

    expect(texto).toContain('El cuerpo de la nota.')
    expect(texto).not.toContain('Lo más leído')
    expect(texto).not.toContain('Portada')
    expect(texto).not.toContain('© 2026')
  })

  it('el último recurso (documento entero, sin 3 párrafos) también va limpio', () => {
    // Rama `contenido = limpio` del fallback: se conserva a propósito para no perder notas,
    // pero ya no debe traer tarjetas ajenas.
    const html =
      '<body><div>Cuerpo suelto sin párrafos suficientes.</div>' +
      '<a href="/otra"><p>TITULAR AJENO CON FORESTÍN</p></a></body>'

    const texto = extraerTexto(html)

    expect(texto).toContain('Cuerpo suelto sin párrafos')
    expect(texto).not.toMatch(/forest/i)
  })

  it('con <article> anidados elige el que MÁS TEXTO tiene, no el primero', () => {
    // Caso medido en un medio real: 14 <article> en una sola nota, cada tarjeta de «Lee
    // También» con el suyo, anidados dentro del artículo de verdad. Con coincidencia no
    // codiciosa, el primer </article> cierra una tarjeta interior y el extractor se llevaba
    // 114 caracteres de «Lee También» en vez del cuerpo.
    const cuerpo = 'El proyecto de ley sobre incendios sigue en trámite. '.repeat(12)
    const html =
      `<article><article><h3>Lee También</h3><p>Otra nota cualquiera</p></article>` +
      `<p>${cuerpo}</p></article>`

    const texto = extraerTexto(html)

    expect(texto).toContain('El proyecto de ley sobre incendios')
    expect(texto.length).toBeGreaterThan(400)
  })

  it('un <article> demasiado corto NO se cree el cuerpo: cae al siguiente intento', () => {
    // Hay medios donde el cuerpo no vive en un <article> y los únicos <article> de la
    // página son tarjetas de recirculación. Sin piso mínimo, el extractor prefería la
    // tarjeta al cuerpo real y la noticia entraba —o dejaba de entrar— por el texto
    // equivocado. Rechazar de más es seguro: el fallback devuelve un superconjunto.
    const cuerpo = 'CONAF informó sobre el estado del parque nacional durante la jornada. '.repeat(9)
    const html =
      `<body><article><p>Lee También… Leer más</p></article>` +
      `<div class="cuerpo"><p>${cuerpo}</p><p>Segundo.</p><p>Tercero.</p></div></body>`

    const texto = extraerTexto(html)

    // La garantía es que el CUERPO aparezca. El fallback de párrafos es un superconjunto
    // por diseño —recoge todos los <p> del documento—, así que puede arrastrar rótulos de
    // interfaz como «Leer más». Eso es ruido inocuo: no es el titular de otra nota y no
    // puede atribuir un concepto que no corresponde, que es el defecto que importa.
    expect(texto).toContain('CONAF informó sobre el estado del parque')
    // Y lo que sí debe seguir fuera: el titular ajeno, que llega envuelto en <a>.
    expect(extraerTexto(`${html}<a href="/x"><p>CLUB FORESTÍN ABRE SU TEMPORADA</p></a>`))
      .not.toMatch(/forest/i)
  })

  it('HTML grande con muchas tarjetas no dispara backtracking', () => {
    const html = `<main><p>Cuerpo.</p>${'<a href="/n"><p>AJENO</p></a>'.repeat(800)}</main>`
    const inicio = Date.now()
    const texto = extraerTexto(html)
    expect(Date.now() - inicio).toBeLessThan(2000)
    expect(texto).not.toContain('AJENO')
  })
})

describe('extraerAutor', () => {
  it('prefiere el author del JSON-LD', () => {
    const html =
      '<script type="application/ld+json">{"author":{"name":"Juan Pérez"}}</script>' +
      '<meta name="author" content="Otro">'
    expect(extraerAutor(html)).toBe('Juan Pérez')
  })

  it('acepta author como string plano en el JSON-LD', () => {
    const html = '<script type="application/ld+json">{"author":"María Soto"}</script>'
    expect(extraerAutor(html)).toBe('María Soto')
  })

  it('cae a la metatag author cuando el JSON-LD es inválido (no lanza)', () => {
    const html =
      '<script type="application/ld+json">{esto no es json</script>' +
      '<meta name="author" content="Redacción">'
    expect(extraerAutor(html)).toBe('Redacción')
  })

  it('sin autor declarado devuelve null', () => {
    expect(extraerAutor('<html><p>nota sin firma</p></html>')).toBe(null)
  })
})

describe('extraerFechaPublicacion', () => {
  it('prefiere datePublished del JSON-LD y la normaliza a ISO', () => {
    const html = '<script type="application/ld+json">{"datePublished":"2026-08-01T12:00:00Z"}</script>'
    expect(extraerFechaPublicacion(html)).toBe('2026-08-01T12:00:00.000Z')
  })

  it('cae a la metatag article:published_time', () => {
    const html = '<meta property="article:published_time" content="2026-07-30T10:30:00-04:00">'
    expect(extraerFechaPublicacion(html)).toBe('2026-07-30T14:30:00.000Z')
  })

  it('una fecha inválida no se propaga (devuelve null, la noticia conserva la fecha del feed)', () => {
    const html = '<meta property="article:published_time" content="ayer por la tarde">'
    expect(extraerFechaPublicacion(html)).toBe(null)
  })
})

describe('crearExtractorContenido', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('descarga la página y devuelve texto, autor y fecha en una sola pasada', async () => {
    const html =
      '<head><meta property="og:image" content="https://medio.cl/foto.jpg">' +
      '<meta name="author" content="Redacción">' +
      '<meta property="article:published_time" content="2026-08-01T09:00:00Z"></head>' +
      '<article><p>CONAF informó sobre el parque.</p><p>Más detalles.</p></article>'
    vi.stubGlobal('fetch', vi.fn(async () => respuestaHtml(html)))

    const extractor = crearExtractorContenido({ userAgent: 'CoipoBot/1.0' })
    const contenido = await extractor.obtenerContenido(URL_ARTICULO)

    expect(contenido).toEqual({
      texto: 'CONAF informó sobre el parque. Más detalles.',
      autor: 'Redacción',
      fechaPublicacion: '2026-08-01T09:00:00.000Z',
      // Sin declaración de muro de pago en el JSON-LD: se extrae el cuerpo como siempre
      // (ver test/muro-de-pago.test.js).
      cuerpoOmitidoPorMuro: false,
    })
  })

  it('envía el user-agent configurado (los medios bloquean UAs anónimos)', async () => {
    const f = vi.fn(async () => respuestaHtml('<article><p>x</p></article>'))
    vi.stubGlobal('fetch', f)

    await crearExtractorContenido({ userAgent: 'CoipoBot/1.0' }).obtenerContenido(URL_ARTICULO)

    expect(f.mock.calls[0][1].headers['user-agent']).toBe('CoipoBot/1.0')
  })

  it('rechaza un Content-Length sobre el tope SIN descargar el cuerpo (SEC-06)', async () => {
    const text = vi.fn(async () => 'x')
    // Objeto a mano en vez de Response para poder asertar que text() nunca se llama.
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'text/html', 'content-length': '10000001' }),
      text,
      url: '',
    })))

    const contenido = await crearExtractorContenido().obtenerContenido(URL_ARTICULO)

    expect(contenido).toBe(null)
    expect(text).not.toHaveBeenCalled() // el cuerpo enorme jamás se bufferiza
  })

  it('respeta el charset declarado por el medio (ISO-8859-1)', async () => {
    // Caso REAL: eldivisadero.cl responde `text/html; charset=iso-8859-1`. Leerlo como
    // UTF-8 producía "nuevos due<?>os", "jur<?>dica", "par<?>metros" — y ese texto
    // corrupto es el que se almacenaba como extracto y se le mostraba a SECOM.
    const texto = 'Los planes de manejo están listos, pero CONAF no se atrevió a publicarlos.'
    const bytes = Uint8Array.from(
      // Codificación Latin-1: cada carácter a un byte.
      [...`<article><p>${texto}</p><p>x</p><p>y</p></article>`].map((c) => c.charCodeAt(0) & 0xff),
    )
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(bytes, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=iso-8859-1' },
      })),
    )

    const contenido = await crearExtractorContenido().obtenerContenido(URL_ARTICULO)

    expect(contenido.texto).toContain('están listos')
    expect(contenido.texto).toContain('atrevió')
    expect(contenido.texto).not.toContain('�') // el carácter de reemplazo
  })

  it('sin charset en la cabecera, lo toma del <meta> del documento', async () => {
    const bytes = Uint8Array.from(
      [...'<html><head><meta charset="iso-8859-1"></head><body><article><p>Año región Ñuble</p><p>b</p><p>c</p></article></body></html>'].map(
        (c) => c.charCodeAt(0) & 0xff,
      ),
    )
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(bytes, { status: 200, headers: { 'content-type': 'text/html' } })),
    )

    const contenido = await crearExtractorContenido().obtenerContenido(URL_ARTICULO)

    expect(contenido.texto).toContain('Año región Ñuble')
  })

  it('HTML malformado no lanza: devuelve los campos que pudo extraer', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respuestaHtml('<html><p>párrafo sin cerrar<div')))

    const contenido = await crearExtractorContenido().obtenerContenido(URL_ARTICULO)

    expect(contenido).toEqual({
      // Comportamiento actual: un tag truncado al final ("<div" sin ">") no se
      // reconoce como tag y queda como texto literal. Ruido menor, no un crash.
      texto: 'párrafo sin cerrar<div',
      autor: null,
      fechaPublicacion: null,
      cuerpoOmitidoPorMuro: false,
    })
  })

  it('status distinto de 200 devuelve null (el enriquecimiento es opcional, no bota la corrida)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('no', { status: 404 })))
    expect(await crearExtractorContenido().obtenerContenido(URL_ARTICULO)).toBe(null)
  })

  it('respuesta que no es HTML devuelve null (un PDF o imagen no se parsea)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('%PDF-', {
      status: 200,
      headers: { 'content-type': 'application/pdf' },
    })))
    expect(await crearExtractorContenido().obtenerContenido(URL_ARTICULO)).toBe(null)
  })

  it('fallo de red devuelve null en vez de propagar (la noticia sale sin enriquecer)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNRESET') }))
    expect(await crearExtractorContenido().obtenerContenido(URL_ARTICULO)).toBe(null)
  })

  it('una URL hacia la red interna se bloquea (fetchSeguro) y devuelve null', async () => {
    const f = vi.fn()
    vi.stubGlobal('fetch', f)
    expect(await crearExtractorContenido().obtenerContenido('http://169.254.169.254/meta')).toBe(null)
    expect(f).not.toHaveBeenCalled() // ni siquiera conecta
  })
})
