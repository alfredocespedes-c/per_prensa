import { useState, useMemo, useEffect } from 'react'
import { useDatos } from '../contexto/ProveedorDatos.jsx'
import NoticiaItem from '../componentes/NoticiaItem.jsx'
import { construirIndice, buscar, obtenerFacetas, filtrarNoticias } from '../servicios/busqueda.js'
import { Search } from 'lucide-react'

export default function Buscar() {
  const { noticias, secciones } = useDatos()
  const [query, setQuery] = useState('')
  const [filtros, setFiltros] = useState({})
  const [resultados, setResultados] = useState([])

  // Construir índice una sola vez
  useEffect(() => {
    if (noticias?.length) {
      construirIndice(noticias)
    }
  }, [noticias])

  // Ejecutar búsqueda y filtrado
  useEffect(() => {
    if (!noticias?.length) return

    let res = noticias
    if (query.trim()) {
      const ids = buscar(query).map(r => r.id)
      res = res.filter(n => ids.includes(n.id))
    }
    res = filtrarNoticias(res, filtros)
    setResultados(res)
  }, [query, filtros, noticias])

  const facetas = useMemo(() => obtenerFacetas(noticias || []), [noticias])

  return (
    <div className="vista-buscar">
      <h1>Búsqueda avanzada</h1>

      {/* La grilla vive en CSS y no en `style` inline porque necesita un breakpoint: con
          '250px 1fr' fijo, a 390 px la columna de resultados quedaba en ~90 px y los
          titulares salían a una letra por línea. Un estilo inline no admite media query. */}
      <div className="buscar-disposicion">
        {/* Sidebar: Filtros */}
        <aside>
          {/* Búsqueda */}
          <div style={{ marginBottom: '2rem' }}>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', marginBottom: '0.5rem' }}>
              Búsqueda
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--tarjeta)', border: '1px solid var(--linea)', borderRadius: '0.5rem', padding: '0.5rem' }}>
              <Search size={16} style={{ color: 'var(--gris)' }} />
              <input
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Buscar…"
                style={{
                  flex: 1,
                  border: 'none',
                  background: 'transparent',
                  fontSize: '0.875rem',
                  outline: 'none',
                }}
              />
            </div>
          </div>

          {/* Secciones */}
          <div style={{ marginBottom: '2rem' }}>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', marginBottom: '0.5rem' }}>
              Sección
            </label>
            <select
              value={filtros.seccion || ''}
              onChange={e => setFiltros({ ...filtros, seccion: e.target.value || undefined })}
              style={{
                width: '100%',
                padding: '0.5rem',
                borderRadius: '0.5rem',
                border: '1px solid var(--linea)',
                background: 'var(--tarjeta)',
                fontSize: '0.875rem',
              }}
            >
              <option value="">Todas</option>
              {secciones?.map(s => (
                <option key={s.id} value={s.id}>{s.nombre} ({facetas.secciones[s.id] || 0})</option>
              ))}
            </select>
          </div>

          {/* Sentimiento */}
          {Object.keys(facetas.sentimientos || {}).length > 0 && (
            <div style={{ marginBottom: '2rem' }}>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', marginBottom: '0.5rem' }}>
                Sentimiento
              </label>
              <select
                value={filtros.sentimiento || ''}
                onChange={e => setFiltros({ ...filtros, sentimiento: e.target.value || undefined })}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  borderRadius: '0.5rem',
                  border: '1px solid var(--linea)',
                  background: 'var(--tarjeta)',
                  fontSize: '0.875rem',
                }}
              >
                <option value="">Todos</option>
                {Object.entries(facetas.sentimientos).map(([sent, count]) => (
                  <option key={sent} value={sent}>{sent} ({count})</option>
                ))}
              </select>
            </div>
          )}

          {/* Riesgo */}
          {Object.keys(facetas.riesgos || {}).length > 0 && (
            <div style={{ marginBottom: '2rem' }}>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', marginBottom: '0.5rem' }}>
                Riesgo
              </label>
              <select
                value={filtros.riesgo || ''}
                onChange={e => setFiltros({ ...filtros, riesgo: e.target.value || undefined })}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  borderRadius: '0.5rem',
                  border: '1px solid var(--linea)',
                  background: 'var(--tarjeta)',
                  fontSize: '0.875rem',
                }}
              >
                <option value="">Todos</option>
                {Object.entries(facetas.riesgos).map(([riesgo, count]) => (
                  <option key={riesgo} value={riesgo}>{riesgo} ({count})</option>
                ))}
              </select>
            </div>
          )}

          {/* Ámbito */}
          <div style={{ marginBottom: '2rem' }}>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', marginBottom: '0.5rem' }}>
              Ámbito
            </label>
            <select
              value={filtros.ambito || ''}
              onChange={e => setFiltros({ ...filtros, ambito: e.target.value || undefined })}
              style={{
                width: '100%',
                padding: '0.5rem',
                borderRadius: '0.5rem',
                border: '1px solid var(--linea)',
                background: 'var(--tarjeta)',
                fontSize: '0.875rem',
              }}
            >
              <option value="">Todos</option>
              <option value="nacional">Nacional</option>
              <option value="regional">Regional</option>
              <option value="internacional">Internacional</option>
            </select>
          </div>

          {/* Período */}
          <div style={{ marginBottom: '2rem' }}>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', marginBottom: '0.5rem' }}>
              Período
            </label>
            <select
              value={filtros.periodo || ''}
              onChange={e => setFiltros({ ...filtros, periodo: e.target.value || undefined })}
              style={{
                width: '100%',
                padding: '0.5rem',
                borderRadius: '0.5rem',
                border: '1px solid var(--linea)',
                background: 'var(--tarjeta)',
                fontSize: '0.875rem',
              }}
            >
              <option value="">Todas las fechas</option>
              <option value="hoy">Hoy</option>
              <option value="hoy-ayer">Hoy + Ayer</option>
            </select>
          </div>
        </aside>

        {/* Main: Resultados */}
        <main>
          <div style={{ fontSize: '0.875rem', color: 'var(--gris-tenue)', marginBottom: '1rem' }}>
            {resultados.length} resultado{resultados.length !== 1 ? 's' : ''}
          </div>
          {resultados.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--gris-tenue)' }}>
              No se encontraron resultados
            </div>
          ) : (
            <div className="grilla-noticias">
              {resultados.map(noticia => (
                <NoticiaItem key={noticia.id} noticia={noticia} />
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
