// El proveedor de datos es el único puente frontend ↔ API: si falla, la regla
// es degradar con un error visible, jamás una página en blanco.
import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ProveedorDatos, useDatos } from './ProveedorDatos.jsx'
import { ContextoSesion } from './ProveedorSesion.jsx'
import { cargarNoticias } from '../servicios/datos.js'

vi.mock('../servicios/datos.js', () => ({ cargarNoticias: vi.fn() }))
vi.mock('../servicios/historico-local.js', () => ({ actualizarHistoricoLocal: vi.fn() }))

function Sonda() {
  const { noticias, secciones, generadoEn, cargando, error } = useDatos()
  if (cargando) return <p>cargando…</p>
  if (error) return <p>error: {error}</p>
  return (
    <div>
      <p>generado: {generadoEn}</p>
      <p>secciones: {secciones.length}</p>
      <ul>
        {noticias.map((n) => (
          <li key={n.id}>{n.titular}</li>
        ))}
      </ul>
    </div>
  )
}

// ProveedorDatos depende de la fase de sesión: /api/noticias devuelve dos cargas útiles
// distintas según haya cookie o no. Acá se inyecta la fase directamente para poder
// controlarla sin levantar ProveedorSesion (que consultaría /api/me).
function conSesion(fase, children) {
  return <ContextoSesion.Provider value={{ fase }}>{children}</ContextoSesion.Provider>
}

function renderProveedor(fase = 'anonimo') {
  return render(conSesion(fase, <ProveedorDatos><Sonda /></ProveedorDatos>))
}

describe('ProveedorDatos', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('expone noticias, secciones y generadoEn tras la carga', async () => {
    cargarNoticias.mockResolvedValue({
      noticias: [{ id: 'https://a.cl/1', titular: 'CONAF anuncia plan' }],
      secciones: [{ id: 'digital', nombre: 'Digital', orden: 4 }],
      generadoEn: '2026-08-01T13:05:00.000Z',
    })

    renderProveedor()

    expect(screen.getByText('cargando…')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('CONAF anuncia plan')).toBeInTheDocument())
    expect(screen.getByText('secciones: 1')).toBeInTheDocument()
    expect(screen.getByText(/generado: 2026-08-01/)).toBeInTheDocument()
  })

  it('guarda las noticias cargadas en el histórico local (no se pierden al rotar)', async () => {
    const { actualizarHistoricoLocal } = await import('../servicios/historico-local.js')
    const noticias = [{ id: 'https://a.cl/1', titular: 'CONAF' }]
    cargarNoticias.mockResolvedValue({ noticias, secciones: [], generadoEn: null })

    renderProveedor()

    await waitFor(() => expect(actualizarHistoricoLocal).toHaveBeenCalledWith(noticias))
  })

  it('si la API falla, expone el error y listas vacías (nunca página en blanco)', async () => {
    cargarNoticias.mockRejectedValue(new Error('API caída'))

    renderProveedor()

    await waitFor(() => expect(screen.getByText('error: API caída')).toBeInTheDocument())
  })

  it('useDatos fuera del proveedor lanza un error claro', () => {
    const silenciar = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Sonda />)).toThrow('useDatos debe usarse dentro de ProveedorDatos')
    silenciar.mockRestore()
  })

  // --- Recarga al cambiar la sesión ------------------------------------------------
  // El fallo más probable de la separación en dos superficies: /api/noticias entrega al
  // anónimo una carga útil SIN `analisis`, y las vistas internas (Dashboard, Buscar,
  // Eventos, Mapa, Regiones…) lo leen. Si el proveedor no volviera a pedir los datos al
  // autenticarse, esas vistas quedarían vacías sin ningún error visible.

  it('no pide datos mientras la sesión se está verificando', async () => {
    // Pedir acá garantizaría dos peticiones y un parpadeo: primero la carga útil
    // pública y enseguida la interna.
    cargarNoticias.mockResolvedValue({ noticias: [], secciones: [], generadoEn: null })

    renderProveedor('verificando')

    expect(cargarNoticias).not.toHaveBeenCalled()
    expect(screen.getByText('cargando…')).toBeInTheDocument()
  })

  it('vuelve a pedir los datos cuando el usuario pasa de anónimo a autenticado', async () => {
    cargarNoticias.mockResolvedValue({ noticias: [], secciones: [], generadoEn: null })

    const { rerender } = renderProveedor('anonimo')
    await waitFor(() => expect(cargarNoticias).toHaveBeenCalledTimes(1))

    rerender(conSesion('autenticado', <ProveedorDatos><Sonda /></ProveedorDatos>))

    await waitFor(() => expect(cargarNoticias).toHaveBeenCalledTimes(2))
  })

  it('no repite la petición si la fase no cambió', async () => {
    cargarNoticias.mockResolvedValue({ noticias: [], secciones: [], generadoEn: null })

    const { rerender } = renderProveedor('autenticado')
    await waitFor(() => expect(cargarNoticias).toHaveBeenCalledTimes(1))

    rerender(conSesion('autenticado', <ProveedorDatos><Sonda /></ProveedorDatos>))

    expect(cargarNoticias).toHaveBeenCalledTimes(1)
  })
})
