import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import Seccion from './Seccion.jsx'

const noticia = (id) => ({
  id,
  url: id,
  medioNombre: 'Medio Uno',
  titular: `Titular de ${id}`,
  fecha: new Date().toISOString(),
  extracto: [],
  analisis: null,
})

describe('Seccion', () => {
  it('muestra el nombre de la sección y el conteo de noticias', () => {
    render(
      <Seccion
        seccion={{ id: 'digital', nombre: 'Digital', orden: 4 }}
        noticias={[noticia('https://a.cl/1'), noticia('https://a.cl/2')]}
      />,
    )
    expect(screen.getByRole('heading', { name: /Digital/ })).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getAllByRole('article')).toHaveLength(2)
  })

  it('una sección sin noticias no se pinta (el boletín no muestra secciones vacías)', () => {
    const { container } = render(
      <Seccion seccion={{ id: 'radio', nombre: 'Radio', orden: 3 }} noticias={[]} />,
    )
    expect(container).toBeEmptyDOMElement()
  })
})
