// La tarjeta de noticia es el corazón del boletín: titular con link directo a
// la nota original y extracto con la mención resaltada (criterios SECOM).
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import NoticiaItem from './NoticiaItem.jsx'

const noticiaBase = (sobrescribe = {}) => ({
  id: 'https://mediouno.cl/nota-1',
  url: 'https://mediouno.cl/nota-1',
  medioId: 'medio-uno',
  medioNombre: 'Medio Uno',
  seccionId: 'digital',
  titular: 'CONAF anuncia plan de manejo forestal',
  fecha: new Date().toISOString(),
  fechaDeteccion: new Date().toISOString(),
  extracto: [
    { texto: 'La ', resaltado: false },
    { texto: 'CONAF', resaltado: true },
    { texto: ' presentó el plan en la región.', resaltado: false },
  ],
  // Sin `imagen`: la API ya no envía ese campo en ninguna superficie. Los casos que
  // necesitan una lo inyectan a propósito, para comprobar que igual no se pinta.
  analisis: null,
  ...sobrescribe,
})

describe('NoticiaItem', () => {
  it('el titular es un link directo a la nota original en pestaña nueva', () => {
    render(<NoticiaItem noticia={noticiaBase()} />)
    const link = screen.getByRole('link', { name: /CONAF anuncia plan/ })
    expect(link).toHaveAttribute('href', 'https://mediouno.cl/nota-1')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('la mención va resaltada con <mark> (formato del boletín antiguo)', () => {
    const { container } = render(<NoticiaItem noticia={noticiaBase()} />)
    const marca = container.querySelector('mark')
    expect(marca).not.toBeNull()
    expect(marca.textContent).toBe('CONAF')
  })

  it('muestra el nombre del medio', () => {
    render(<NoticiaItem noticia={noticiaBase()} />)
    expect(screen.getByText('Medio Uno')).toBeInTheDocument()
  })

  it('sin análisis, la tarjeta cae al tono neutro (ninguna queda sin señal)', () => {
    const { container } = render(<NoticiaItem noticia={noticiaBase({ analisis: null })} />)
    expect(container.querySelector('article').className).toContain('sentimiento-neutra')
  })

  it('el tono del análisis colorea la tarjeta', () => {
    const { container } = render(
      <NoticiaItem noticia={noticiaBase({ analisis: { sentimiento: 'negativa' } })} />,
    )
    expect(container.querySelector('article').className).toContain('sentimiento-negativa')
  })

  it('un ámbito conocido agrega su chip; uno desconocido no rompe', () => {
    render(<NoticiaItem noticia={noticiaBase({ analisis: { ambito: 'nacional' } })} />)
    expect(screen.getByText('Nacional')).toBeInTheDocument()
    render(<NoticiaItem noticia={noticiaBase({ analisis: { ambito: 'marciano' } })} />)
    expect(screen.queryByText('marciano')).not.toBeInTheDocument()
  })

  it('un extracto que solo repite el titular se omite (no duplicar texto)', () => {
    const { container } = render(
      <NoticiaItem
        noticia={noticiaBase({
          extracto: [{ texto: 'CONAF anuncia plan de manejo forestal', resaltado: false }],
        })}
      />,
    )
    expect(container.querySelector('.tarjeta-extracto')).toBeNull()
  })

  it('un extracto largo se trunca manteniendo visible la mención resaltada', () => {
    const relleno = 'palabra '.repeat(120) // ~960 caracteres antes de la mención
    const { container } = render(
      <NoticiaItem
        noticia={noticiaBase({
          extracto: [
            { texto: relleno, resaltado: false },
            { texto: 'CONAF', resaltado: true },
            { texto: ' cierra el párrafo.', resaltado: false },
          ],
        })}
      />,
    )
    const extracto = container.querySelector('.tarjeta-extracto')
    expect(extracto.textContent.length).toBeLessThan(600)
    expect(container.querySelector('.tarjeta-extracto mark')).not.toBeNull()
  })

  // --- Sin imágenes, en NINGUNA superficie -------------------------------------------
  // Decisión del departamento legal: las imágenes de noticias desaparecen de la portada
  // pública y de la vista interna. La cadena se cortó en origen (el collector ya no extrae
  // el og:image, la columna salió de la base); esta guarda cubre el último eslabón.
  //
  // ALCANCE, corregido tras una auditoría: NoticiaItem NO es el único punto de pintado del
  // proyecto. Las vistas de boletín sí delegan acá, pero `vistas/Historico.jsx` arma su
  // propia fila con <article> y no pasa por este componente; su guarda vive en
  // Historico.test.jsx. Una vista nueva que pinte noticias necesita la suya.

  it.each(['publica', 'interna'])(
    'aunque la noticia traiga imagen, la superficie %s no pinta ningún <img> externo',
    (superficie) => {
      const { container } = render(
        <NoticiaItem
          noticia={noticiaBase({ imagen: 'https://mediouno.cl/foto.jpg' })}
          superficie={superficie}
        />,
      )

      // CERO <img> de cualquier clase dentro de la tarjeta. La versión anterior de esta
      // guarda filtraba por `/^https?:/` sobre el src, y una auditoría adversarial
      // demostró que dejaba pasar tres formas de reponer la foto sin ponerse roja:
      // un src relativo servido por un proxy propio (`/api/.../miniatura`), un
      // protocolo-relativo (`//cdn.medio.cl/foto.jpg` — que SÍ es una petición a un
      // tercero), y un `data:`/`blob:`. Aserción sobre la CONDUCTA, no sobre la forma de
      // la URL: esta tarjeta no pinta imágenes, punto. El banner institucional vive en
      // Cabecera, fuera de este componente, así que no hay falso positivo que excusar.
      expect(container.querySelectorAll('img')).toHaveLength(0)
      expect(container.querySelectorAll('picture, source, svg image')).toHaveLength(0)

      // Y tampoco por CSS ni por ninguna otra vía: ni la URL ni un background-image.
      expect(container.innerHTML).not.toContain('foto.jpg')
      expect(container.innerHTML).not.toMatch(/background-image|url\(/i)
    },
  )

  it('la tarjeta es de solo texto: no queda ni el bloque visual ni el monograma', () => {
    // El monograma con la inicial del medio era el sustituto cuando faltaba la foto.
    // También se fue: la decisión no era "otra imagen", era ninguna.
    const { container } = render(<NoticiaItem noticia={noticiaBase()} />)

    // Por ESTRUCTURA, no por nombres de clase heredados: una lista de cinco selectores
    // viejos no ve una clase nueva, que es exactamente cómo volvería el monograma.
    // La tarjeta tiene un único hijo, .tarjeta-cuerpo, y dentro solo hay texto.
    const tarjeta = container.querySelector('.tarjeta')
    expect([...tarjeta.children].map((c) => c.className)).toEqual(['tarjeta-cuerpo'])

    // El monograma era la inicial del medio suelta en su propio nodo. `medioNombre` sí
    // aparece completo en .chip-medio; lo que no debe existir es un nodo cuyo texto sea
    // UNA sola letra, que es la forma que tenía.
    const sueltos = [...tarjeta.querySelectorAll('*')].filter(
      (n) => n.children.length === 0 && /^\s*\S\s*$/.test(n.textContent ?? ''),
    )
    expect(sueltos.map((n) => n.textContent.trim())).toEqual([])
  })

  it('muestra el autor para atribución en la vista interna', () => {
    const { container } = render(
      <NoticiaItem noticia={noticiaBase({ autor: 'María González' })} superficie="interna" />,
    )
    expect(container.querySelector('.tarjeta-autor').textContent).toContain('María González')
  })

  it('NO muestra el nombre del autor en la portada pública', () => {
    // El backend directamente no lo envía a un anónimo; esto cubre que la tarjeta
    // tampoco lo pinte si por alguna vía llegara.
    const { container } = render(
      <NoticiaItem noticia={noticiaBase({ autor: 'José Carvajal Vega' })} superficie="publica" />,
    )
    expect(container.querySelector('.tarjeta-autor')).toBeNull()
    expect(container.textContent).not.toContain('Carvajal')
  })

  // --- Superficie pública ------------------------------------------------------------
  // El backend directamente no envía `extracto` ni `analisis` a un anónimo; estos casos
  // cubren que la tarjeta tampoco los pinte si por alguna vía llegaran.

  it('en la superficie pública no muestra el extracto', () => {
    const { container } = render(<NoticiaItem noticia={noticiaBase()} superficie="publica" />)
    expect(container.querySelector('.tarjeta-extracto')).toBeNull()
  })

  it('en la superficie pública no muestra el tono ni como filete ni como tooltip', () => {
    const { container } = render(
      <NoticiaItem
        noticia={noticiaBase({ analisis: { sentimiento: 'negativa', ambito: 'regional' } })}
        superficie="publica"
      />,
    )
    const tarjeta = container.querySelector('.tarjeta')
    expect(tarjeta.className).not.toMatch(/sentimiento-/)
    expect(tarjeta).not.toHaveAttribute('title')
    expect(container.querySelector('.chip-ambito')).toBeNull()
  })

  // --- Marca de "hoy" ---------------------------------------------------------------
  // SECOM revisa a las 08:00 dentro de una ventana que arrastra semanas.

  it('marca con texto las noticias de hoy, no solo con color', () => {
    // Un distintivo solo cromático deja fuera a quien no lo distingue y desaparece en una
    // proyección: por eso la aserción es sobre el TEXTO.
    const { container } = render(
      <NoticiaItem noticia={noticiaBase({ fecha: new Date().toISOString() })} />,
    )
    expect(container.querySelector('.chip-hoy').textContent).toBe('HOY')
    expect(container.querySelector('.tarjeta').className).toContain('tarjeta-de-hoy')
  })

  it('no marca una noticia de días anteriores', () => {
    const anteayer = new Date(Date.now() - 2 * 86_400_000).toISOString()
    const { container } = render(<NoticiaItem noticia={noticiaBase({ fecha: anteayer })} />)
    expect(container.querySelector('.chip-hoy')).toBeNull()
  })

  it('la marca no filtra ni reordena: la noticia se pinta igual', () => {
    // Es aditiva a propósito. Si ocultara o moviera algo, sería un filtro disfrazado.
    const { container } = render(
      <NoticiaItem noticia={noticiaBase({ fecha: new Date().toISOString() })} />,
    )
    expect(container.querySelector('.tarjeta-titular').textContent).toContain('CONAF anuncia')
    expect(container.querySelector('.tarjeta-extracto')).not.toBeNull()
  })

  it('marca también en la superficie pública', () => {
    const { container } = render(
      <NoticiaItem noticia={noticiaBase({ fecha: new Date().toISOString() })} superficie="publica" />,
    )
    expect(container.querySelector('.chip-hoy')).not.toBeNull()
  })

  it('NO marca cuando la vista ya está filtrada por hoy', () => {
    // La portada abre en «Hoy»: ahí todas las tarjetas son de hoy y un distintivo que las
    // señale a todas no distingue nada, solo repite ruido 900 veces.
    const { container } = render(
      <NoticiaItem noticia={noticiaBase({ fecha: new Date().toISOString() })} marcarHoy={false} />,
    )
    expect(container.querySelector('.chip-hoy')).toBeNull()
    expect(container.querySelector('.tarjeta').className).not.toContain('tarjeta-de-hoy')
  })

  it('la superficie interna conserva extracto y tono', () => {
    const { container } = render(
      <NoticiaItem
        noticia={noticiaBase({ analisis: { sentimiento: 'negativa' } })}
        superficie="interna"
      />,
    )
    expect(container.querySelector('.tarjeta-extracto')).not.toBeNull()
    expect(container.querySelector('.tarjeta').className).toMatch(/sentimiento-negativa/)
  })
})
