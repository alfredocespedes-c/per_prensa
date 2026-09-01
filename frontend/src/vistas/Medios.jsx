import { useMemo } from 'react'
import { useDatos } from '../contexto/ProveedorDatos.jsx'
import ChipSentimiento from '../componentes/ChipSentimiento.jsx'
import { etiquetaCategoria } from '../utilidades/etiquetas.js'

export default function Medios() {
  const { noticias, cargando, error } = useDatos()

  const medios = useMemo(() => {
    if (!noticias?.length) return []
    const grupos = {}
    noticias.forEach(n => {
      if (!grupos[n.medioId]) {
        grupos[n.medioId] = {
          medioId: n.medioId,
          nombre: n.medioNombre,
          noticias: [],
          sentimientos: {},
          categorias: {},
        }
      }
      grupos[n.medioId].noticias.push(n)
      if (n.analisis?.sentimiento) {
        grupos[n.medioId].sentimientos[n.analisis.sentimiento] = (grupos[n.medioId].sentimientos[n.analisis.sentimiento] || 0) + 1
      }
      if (n.analisis?.categorias) {
        n.analisis.categorias.forEach(cat => {
          grupos[n.medioId].categorias[cat] = (grupos[n.medioId].categorias[cat] || 0) + 1
        })
      }
    })
    return Object.values(grupos).sort((a, b) => b.noticias.length - a.noticias.length)
  }, [noticias])

  const sentimentoPromedio = (sentimientos) => {
    const total = Object.values(sentimientos).reduce((a, b) => a + b, 0) || 1
    const pos = (sentimientos.positiva || 0) / total
    const neg = (sentimientos.negativa || 0) / total
    if (pos > neg && pos > 0.3) return 'positiva'
    if (neg > pos && neg > 0.3) return 'negativa'
    return 'neutra'
  }

  if (cargando) return <div className="estado">Cargando…</div>
  if (error) return <div className="estado estado-error">No se pudieron cargar las noticias: {error}</div>

  return (
    <div style={{ padding: 'var(--pad-vista)', maxWidth: '1200px', margin: '0 auto' }}>
      <h1>Medios monitoreados ({medios.length})</h1>

      {medios.length === 0 && (
        <p style={{ color: 'var(--gris-tenue)' }}>No hay medios con noticias en este momento.</p>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 350px), 1fr))', gap: '1.5rem', marginTop: '2rem' }}>
        {medios.map(medio => {
          const topCats = Object.entries(medio.categorias)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 3)
            .map(([cat]) => cat)
          return (
            <div
              key={medio.medioId}
              style={{
                background: 'var(--tarjeta)',
                border: '1px solid var(--linea)',
                borderRadius: '0.5rem',
                padding: '1.5rem',
              }}
            >
              <h3 style={{ marginTop: 0, marginBottom: '0.25rem' }}>{medio.nombre}</h3>
              <div style={{ fontSize: '0.7rem', color: 'var(--gris-tenue)', marginBottom: '1rem' }}>{medio.medioId}</div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem', fontSize: '0.875rem' }}>
                <div>
                  <div style={{ color: 'var(--gris-tenue)', fontSize: '0.75rem', marginBottom: '0.25rem' }}>Noticias</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: '600' }}>{medio.noticias.length}</div>
                </div>
                <div>
                  <div style={{ color: 'var(--gris-tenue)', fontSize: '0.75rem', marginBottom: '0.25rem' }}>Sentimiento</div>
                  <ChipSentimiento sentimiento={sentimentoPromedio(medio.sentimientos)} />
                </div>
              </div>

              {topCats.length > 0 && (
                <div style={{ marginBottom: '1rem' }}>
                  <div style={{ color: 'var(--gris-tenue)', fontSize: '0.75rem', marginBottom: '0.5rem' }}>Temas frecuentes</div>
                  <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                    {topCats.map(cat => (
                      <span
                        key={cat}
                        style={{
                          fontSize: '0.7rem',
                          padding: '0.25rem 0.5rem',
                          background: 'var(--fondo)',
                          borderRadius: '0.25rem',
                          color: 'var(--gris)',
                        }}
                      >
                        {etiquetaCategoria(cat)}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ fontSize: '0.75rem', color: 'var(--gris-tenue)', padding: '0.75rem', background: 'var(--fondo)', borderRadius: '0.5rem' }}>
                <div><strong>Análisis disponible:</strong> {Object.entries(medio.sentimientos).map(([s, c]) => `${s} (${c})`).join(', ')}</div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
