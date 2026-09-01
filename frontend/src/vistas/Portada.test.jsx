// La portada abre filtrada en HOY. SECOM la revisa a las 08:00 y la ventana arrastra
// ~900 noticias de varias semanas: abrir en «Todas» obliga a filtrar cada mañana antes
// de poder trabajar.
import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Portada from './Portada.jsx'
import { ContextoDatos } from '../contexto/ProveedorDatos.jsx'
import { ContextoSesion } from '../contexto/ProveedorSesion.jsx'
import { obtenerBoletinContratadoActual } from '../servicios/boletin-contratado-api.js'

vi.mock('../servicios/historico-local.js', () => ({ actualizarHistoricoLocal: vi.fn() }))
// El bloque del boletín contratado vive dentro de la portada y hace su propio fetch:
// sin este mock, test-setup.js lo haría lanzar («fetch sin mockear»).
vi.mock('../servicios/boletin-contratado-api.js', () => ({
  obtenerBoletinContratadoActual: vi.fn(async () => null),
}))

// Sin esto el espía acumula las llamadas de los tests anteriores del archivo y la
// aserción "ni siquiera se pide" pasaría a medir el archivo entero, no el caso.
beforeEach(() => {
  vi.clearAllMocks()
})

const BOLETIN = {
  id: 1,
  fecha: '2026-08-26',
  url: 'https://mediastation.simbiu.es/Documents/Download/2754012',
  documentoId: '2754012',
  proveedor: 'simbiu',
}

const haceDias = (n) => new Date(Date.now() - n * 86_400_000).toISOString()

const noticia = (id, fecha) => ({
  id,
  url: `https://mediouno.cl/${id}`,
  medioId: 'medio-uno',
  medioNombre: 'Medio Uno',
  seccionId: 'digital',
  titular: `Titular ${id}`,
  fecha,
  fechaDeteccion: fecha,
  extracto: [{ texto: 'CONAF', resaltado: true }],
  conceptoPrincipal: 'CONAF',
})

function pintar(noticias, { fase = 'autenticado', ...extra } = {}) {
  const datos = {
    noticias,
    secciones: [{ id: 'digital', nombre: 'Digital', orden: 4 }],
    conceptos: [{ texto: 'CONAF', orden: 1 }],
    generadoEn: new Date().toISOString(),
    cargando: false,
    error: null,
    historico: null,
    cargarHistorico: vi.fn(),
    ...extra,
  }
  return render(
    <ContextoSesion.Provider value={{ fase }}>
      <ContextoDatos.Provider value={datos}>
        <Portada />
      </ContextoDatos.Provider>
    </ContextoSesion.Provider>,
  )
}

/** El botón de un período, por su etiqueta exacta (las tres comparten prefijo "Hoy"). */
const boton = (etiqueta) =>
  screen.getAllByRole('button').find((b) => b.textContent.startsWith(etiqueta))

describe('Portada: período por defecto', () => {
  it('abre filtrada en HOY, no en TODAS', () => {
    pintar([noticia('hoy-1', haceDias(0)), noticia('vieja', haceDias(20))])

    expect(boton('Hoy y ayer')).toHaveAttribute('aria-pressed', 'false')
    expect(boton('Todas')).toHaveAttribute('aria-pressed', 'false')
    // El de "Hoy" a secas: el único cuyo texto empieza por "Hoy" sin " y ayer".
    const hoy = screen.getAllByRole('button').find((b) => /^Hoy\d/.test(b.textContent))
    expect(hoy).toHaveAttribute('aria-pressed', 'true')
  })

  it('solo muestra las noticias de hoy al abrir', () => {
    pintar([noticia('hoy-1', haceDias(0)), noticia('vieja', haceDias(20))])

    expect(screen.getByText('Titular hoy-1')).toBeInTheDocument()
    expect(screen.queryByText('Titular vieja')).not.toBeInTheDocument()
  })

  it('no repite la marca HOY cuando el filtro ya es hoy', () => {
    // Todas las tarjetas visibles son de hoy: marcarlas todas no distingue nada.
    const { container } = pintar([noticia('a', haceDias(0)), noticia('b', haceDias(0))])

    expect(container.querySelectorAll('.chip-hoy')).toHaveLength(0)
  })

  it('sin noticias de hoy explica qué hacer, no deja la página muda', () => {
    // Es el caso de las 08:00 en un día tranquilo, o antes de la primera corrida. La
    // página vacía a esa hora es el error #1 declarado inaceptable por SECOM, así que el
    // vacío tiene que decir cómo salir de él.
    pintar([noticia('vieja', haceDias(20))])

    const mensaje = screen.getByText(/Todavía no entran noticias hoy/)
    // El vacío tiene que decir cómo salir de él, no solo constatar que está vacío.
    expect(mensaje.textContent).toMatch(/Hoy y ayer/)
    expect(mensaje.textContent).toMatch(/Todas/)
  })

  it('los contadores de los tres períodos siguen siendo correctos', () => {
    // El usuario decide si cambia de período mirando estos números; si contaran solo lo
    // filtrado, «Todas» mostraría el mismo valor que «Hoy» y el filtro sería inútil.
    pintar([noticia('a', haceDias(0)), noticia('b', haceDias(1)), noticia('c', haceDias(30))])

    expect(boton('Todas').textContent).toContain('3')
    expect(boton('Hoy y ayer').textContent).toContain('2')
    const hoy = screen.getAllByRole('button').find((b) => /^Hoy\d/.test(b.textContent))
    expect(hoy.textContent).toContain('1')
  })
})

describe('boletín del servicio contratado en la portada', () => {
  it('sobrevive a que /api/noticias falle', async () => {
    // El requisito central: SECOM confía MÁS en el servicio contratado que en nuestro
    // recolector, así que el día en que lo nuestro se cae es justo el día en que ese
    // enlace tiene que seguir ahí. Si alguien "simplifica" MarcoPortada y devuelve el
    // <p> de error pelado, este test es lo único que lo detiene.
    obtenerBoletinContratadoActual.mockResolvedValueOnce(BOLETIN)

    const { container } = pintar([], { cargando: false, error: 'API caída' })

    expect(screen.getByText(/No se pudieron cargar las noticias/)).toBeInTheDocument()
    await waitFor(() => {
      expect(container.querySelector('.boletin-contratado-enlace-completo')).toHaveAttribute(
        'href',
        BOLETIN.url,
      )
    })
  })

  it('sigue visible mientras el boletín propio carga', async () => {
    obtenerBoletinContratadoActual.mockResolvedValueOnce(BOLETIN)

    const { container } = pintar([], { cargando: true })

    await waitFor(() => {
      expect(container.querySelector('.boletin-contratado')).not.toBeNull()
    })
  })

  it('un anónimo no lo ve, y ni siquiera se pide', async () => {
    obtenerBoletinContratadoActual.mockResolvedValue(BOLETIN)

    const { container } = pintar([noticia('a', haceDias(0))], { fase: 'anonimo' })

    expect(container.querySelector('.boletin-contratado')).toBeNull()
    expect(obtenerBoletinContratadoActual).not.toHaveBeenCalled()
  })
})
