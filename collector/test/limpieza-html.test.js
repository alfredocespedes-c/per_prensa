// Guarda del falso positivo de menciones.
//
// Caso real que motivó este archivo: una nota policial de un medio regional apareció en el
// boletín bajo el concepto «Forestin» sin mencionarlo en el cuerpo. El medio no tiene
// <article>, su único <main> envuelve toda la página con un listado de titulares de OTRAS
// notas, y aplanar el HTML conserva el texto de los <a>. Eso es RUIDO, uno de los cuatro
// errores declarados inaceptables por SECOM.
//
// Las fixtures son sintéticas y con medios inventados: no entra contenido de prensa real al
// control de versiones (decisión 11 de CLAUDE.md, vigilada por
// scripts/verificar-sin-contenido-de-prensa.mjs).
import { describe, expect, it } from 'vitest'
import {
  limpiarHtmlDeNavegacion,
  quitarBloquesNoContenido,
  quitarTarjetasEnlazadas,
} from '../src/adaptadores/limpieza-html.js'

describe('quitarBloquesNoContenido', () => {
  it('elimina nav, aside, footer y form CON su contenido', () => {
    const html =
      '<nav>Portada Deportes CONAF</nav>' +
      '<aside>Lo más leído: incendio forestal</aside>' +
      '<p>El cuerpo real.</p>' +
      '<form>Suscríbete al boletín de CONAF</form>' +
      '<footer>© 2026 · CONAF</footer>'

    const salida = quitarBloquesNoContenido(html)

    expect(salida).toContain('El cuerpo real.')
    for (const ruido of ['Portada Deportes', 'Lo más leído', 'Suscríbete', '© 2026']) {
      expect(salida).not.toContain(ruido)
    }
  })

  it('NO toca <header> ni <figure>: ahí vive contenido de la nota', () => {
    // Decisión explícita. El <header> del artículo suele llevar su titular y bajada, y el
    // <figcaption> es el pie de foto, que es texto del medio. Quitarlos sería más "limpio"
    // y perdería contenido legítimo.
    const html =
      '<header><h1>CONAF declara alerta</h1></header>' +
      '<figure><figcaption>Brigadistas de CONAF en el cerro</figcaption></figure>'

    const salida = quitarBloquesNoContenido(html)

    expect(salida).toContain('CONAF declara alerta')
    expect(salida).toContain('Brigadistas de CONAF en el cerro')
  })

  it('entrada degenerada no lanza', () => {
    expect(quitarBloquesNoContenido(null)).toBe('')
    expect(quitarBloquesNoContenido(undefined)).toBe('')
    expect(quitarBloquesNoContenido(42)).toBe('')
  })
})

describe('quitarTarjetasEnlazadas', () => {
  it('elimina el <a> que envuelve un bloque (tarjeta a otra nota) con su contenido', () => {
    const html =
      '<a href="/otra-nota"><picture><img src="x.jpg"></picture>' +
      '<p class="title">CLUB FORESTÍN INICIA ACTIVIDADES</p></a>'

    expect(quitarTarjetasEnlazadas(html)).not.toContain('FORESTÍN')
  })

  it('CONSERVA el <a> inline dentro de una frase: una mención puede venir enlazada', () => {
    // Es la mitad que importa del criterio. Si se borrara todo <a>, una nota cuyo único
    // «CONAF» va enlazado dejaría de entrar al boletín: perder una noticia es el error
    // inaceptable nº 2 de SECOM.
    const html = '<p>Según <a href="/conaf">CONAF</a>, el incendio está contenido.</p>'

    const salida = quitarTarjetasEnlazadas(html)

    expect(salida).toContain('CONAF')
    expect(salida).toContain('el incendio está contenido')
  })

  it('distingue por presencia de bloque, no por longitud ni por cantidad de enlaces', () => {
    const html =
      '<p>Texto con <a href="/a">un enlace</a> y <a href="/b"><em>otro con énfasis</em></a>.</p>' +
      '<a href="/c"><div>Tarjeta</div></a>'

    const salida = quitarTarjetasEnlazadas(html)

    expect(salida).toContain('un enlace')
    expect(salida).toContain('otro con énfasis')
    expect(salida).not.toContain('Tarjeta')
  })

  it('un <a> sin cerrar no rompe ni cuelga (el proyecto ya sufrió un ReDoS real)', () => {
    const html = '<a href="/x"><p>' + 'a'.repeat(50_000)
    const inicio = Date.now()
    expect(() => quitarTarjetasEnlazadas(html)).not.toThrow()
    expect(Date.now() - inicio).toBeLessThan(1000)
  })

  it('cientos de tarjetas se procesan en tiempo lineal', () => {
    const tarjeta = '<a href="/n"><p>TITULAR AJENO CON FORESTÍN</p></a>'
    const inicio = Date.now()
    const salida = quitarTarjetasEnlazadas(tarjeta.repeat(500))
    expect(Date.now() - inicio).toBeLessThan(1000)
    expect(salida).not.toContain('FORESTÍN')
  })
})

describe('limpiarHtmlDeNavegacion — el caso completo', () => {
  // Réplica reducida de la estructura real que produjo el falso positivo: sin <article>, un
  // <main> que envuelve todo, cuerpo corto y un listado cronológico de titulares ajenos.
  const PAGINA = `<html><body><main>
      <h1>PDI DETIENE A HOMBRE INVESTIGADO EN LA VÍA PÚBLICA</h1>
      <h2>El detenido quedó a disposición del tribunal.</h2>
      <p>Detectives de la policía realizaron el procedimiento durante la madrugada.</p>
      <div class="mas-noticias">
        <a href="/club-forestin"><picture><img src="c.jpg"></picture>
          <p class="title">DAN INICIO A ACTIVIDADES DEL CLUB FORESTÍN EN PUERTO WILLIAMS</p></a>
        <a href="/otra"><picture><img src="o.jpg"></picture>
          <p class="title">CONSEJO REGIONAL APRUEBA FONDOS</p></a>
      </div>
    </main></body></html>`

  it('el titular ajeno enlazado desaparece y el cuerpo real sobrevive', () => {
    const salida = limpiarHtmlDeNavegacion(PAGINA)

    expect(salida).not.toContain('FORESTÍN')
    expect(salida).not.toContain('CONSEJO REGIONAL')
    expect(salida).toContain('Detectives de la policía')
    expect(salida).toContain('El detenido quedó a disposición')
  })
})
