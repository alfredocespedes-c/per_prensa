// Historico arma SU PROPIA fila de noticia con <article> y no delega en NoticiaItem.
//
// Este archivo existe por un error concreto: al eliminar las imágenes de prensa, tanto el
// comentario de NoticiaItem.jsx como CLAUDE.md afirmaban que esa tarjeta era «el único
// punto de pintado de noticias del proyecto», y de ahí que su guarda «cubriera todo». Una
// auditoría adversarial demostró que era falso: esta vista pinta noticias por su cuenta y
// quedaba fuera de la única guarda que sostiene la decisión del departamento legal.
//
// La lección que fija este archivo: la guarda tiene que estar donde se PINTA, no donde
// alguien supone que se pinta.
//
// Se cubren los DOS orígenes de datos de la vista, porque no son equivalentes:
//  - el remoto pasa por `aplanar()` (servicios/historico-api.js), que ya es una lista
//    blanca y descarta `imagen` por construcción;
//  - el LOCAL sale de localStorage tal cual, sin lista blanca, y ese almacenamiento
//    puede contener noticias guardadas por una versión anterior del sistema, con su
//    `imagen`. Es el camino por el que un og:image viejo podría reaparecer hoy.
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Historico from './Historico.jsx'

const FOTO = 'https://mediouno.cl/foto.jpg'

const noticia = (id) => ({
  id,
  url: `https://mediouno.cl/${id}`,
  medioId: 'medio-uno',
  medioNombre: 'Medio Uno',
  seccionId: 'digital',
  titular: `CONAF y el manejo forestal, nota ${id}`,
  fecha: new Date().toISOString(),
  analisis: { sentimiento: 'neutra', categorias: [], importancia: 'medio', riesgo: 'bajo' },
  // Campo de una versión anterior, inyectado a propósito.
  imagen: FOTO,
})

const pintar = () =>
  render(
    <MemoryRouter>
      <Historico />
    </MemoryRouter>,
  )

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('Historico — sin imágenes de prensa (origen remoto)', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          pagina: 1,
          tamanoPagina: 50,
          total: 2,
          resultados: [noticia('n1'), noticia('n2')],
        }),
      })),
    )
  })

  it('no pinta ningún <img> aunque las noticias traigan imagen', async () => {
    const { container } = pintar()
    await screen.findAllByText(/CONAF y el manejo forestal/)

    expect(container.querySelectorAll('img')).toHaveLength(0)
    expect(container.querySelectorAll('picture, source')).toHaveLength(0)
  })

  it('la URL de la imagen no llega al DOM por ninguna vía, ni como background', async () => {
    const { container } = pintar()
    await screen.findAllByText(/CONAF y el manejo forestal/)

    expect(container.innerHTML).not.toContain('foto.jpg')
    expect(container.innerHTML).not.toMatch(/background-image/i)
  })

  it('sigue mostrando lo que sí corresponde: titular con enlace directo al medio', async () => {
    // Una guarda que solo comprueba ausencias pasaría en verde con la vista vacía. Esto
    // ancla que la ausencia de imágenes no se logró rompiendo el histórico.
    const { container } = pintar()
    await screen.findAllByText(/CONAF y el manejo forestal/)

    const enlaces = [...container.querySelectorAll('a[href^="https://mediouno.cl"]')]
    expect(enlaces.length).toBeGreaterThan(0)
    expect(enlaces[0]).toHaveAttribute('target', '_blank')
    expect(enlaces[0]).toHaveAttribute('rel', 'noopener noreferrer')
  })
})

describe('Historico — sin imágenes de prensa (respaldo local, sin lista blanca)', () => {
  beforeEach(() => {
    // Backend caído: la vista cae al histórico del navegador (fail-open). Se siembra
    // localStorage con el shape que dejaría una versión ANTERIOR del sistema, con imagen.
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('backend caído') }))
    localStorage.setItem(
      'coipo-historico-local',
      JSON.stringify({
        version: 2,
        noticias: {
          vieja1: {
            id: 'vieja1',
            url: 'https://mediouno.cl/vieja1',
            medioNombre: 'Medio Uno',
            titular: 'CONAF y el manejo forestal, nota antigua',
            fecha: new Date().toISOString(),
            primeraVista: new Date().toISOString(),
            ultimaVista: new Date().toISOString(),
            imagen: FOTO,
          },
        },
      }),
    )
  })

  it('una noticia guardada por una versión vieja tampoco pinta su imagen', async () => {
    const { container } = pintar()
    await screen.findAllByText(/CONAF y el manejo forestal/)

    expect(container.querySelectorAll('img')).toHaveLength(0)
    expect(container.innerHTML).not.toContain('foto.jpg')
  })
})
