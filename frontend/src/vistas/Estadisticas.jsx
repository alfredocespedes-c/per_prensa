import { useMemo } from 'react'
import { useDatos } from '../contexto/ProveedorDatos.jsx'
import Kpi from '../componentes/Kpi.jsx'
import { etiquetaCategoria } from '../utilidades/etiquetas.js'
import {
  agruparPorCategoria, agruparPorSentimiento,
  promedios
} from '../servicios/agregaciones.js'

export default function Estadisticas() {
  const { noticias, cargando, error } = useDatos()

  const stats = useMemo(() => {
    if (!noticias?.length) return null
    const conAnalisis = noticias.filter(n => n.analisis)
    return {
      total: noticias.length,
      conAnalisis: conAnalisis.length,
      medios: new Set(noticias.map(n => n.medioId)).size,
      categorias: new Set(noticias.flatMap(n => n.analisis?.categorias || [])).size,
      regiones: new Set(noticias.flatMap(n => n.analisis?.regiones || [])).size,
      ...promedios(conAnalisis),
    }
  }, [noticias])

  const porCategoria = useMemo(() => agruparPorCategoria(noticias || []), [noticias])
  const porSentimiento = useMemo(() => agruparPorSentimiento(noticias || []), [noticias])

  if (cargando) return <div className="estado">Cargando…</div>
  if (error) return <div className="estado estado-error">No se pudieron cargar las noticias: {error}</div>
  if (!stats) {
    return (
      <div style={{ padding: 'var(--pad-vista)', maxWidth: '1200px', margin: '0 auto' }}>
        <h1>Estadísticas</h1>
        <p style={{ color: 'var(--gris-tenue)', marginTop: '1rem' }}>
          Aún no hay noticias para calcular estadísticas.
        </p>
      </div>
    )
  }

  const numero = (valor) => (Number.isFinite(valor) ? valor : '—')

  return (
    <div style={{ padding: 'var(--pad-vista)', maxWidth: '1200px', margin: '0 auto' }}>
      <h1>Estadísticas</h1>

      {/* Métricas generales */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginTop: '2rem', marginBottom: '2rem' }}>
        <Kpi label="Noticias totales" valor={stats.total} />
        <Kpi label="Con análisis" valor={stats.conAnalisis} />
        <Kpi label="Medios únicos" valor={stats.medios} />
        <Kpi label="Categorías" valor={stats.categorias} />
        <Kpi label="Regiones" valor={stats.regiones} />
        <Kpi label="Promedio palabras" valor={numero(stats.palabras)} />
        <Kpi label="Promedio párrafos" valor={numero(stats.parrafos)} />
        <Kpi label="Tiempo lectura promedio" valor={Number.isFinite(stats.lectura) ? `${stats.lectura} min` : '—'} />
      </div>

      {/* Distribuciones */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 400px), 1fr))', gap: '2rem', marginTop: '2rem' }}>
        {/* Categorías */}
        <div style={{ background: 'var(--tarjeta)', padding: '1.5rem', borderRadius: '0.5rem', border: '1px solid var(--linea)' }}>
          <h3>Top categorías</h3>
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {porCategoria.slice(0, 10).map(c => (
              <li key={c.cat} style={{ padding: '0.75rem 0', borderBottom: '1px solid var(--linea)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>{etiquetaCategoria(c.cat)}</span>
                <strong>{c.cantidad}</strong>
              </li>
            ))}
          </ul>
        </div>

        {/* Sentimientos */}
        <div style={{ background: 'var(--tarjeta)', padding: '1.5rem', borderRadius: '0.5rem', border: '1px solid var(--linea)' }}>
          <h3>Distribución sentimientos</h3>
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {porSentimiento.filter(s => s.cantidad > 0).map(s => {
              const pct = stats?.conAnalisis ? Math.round((s.cantidad / stats.conAnalisis) * 100) : 0
              return (
                <li key={s.sentimiento} style={{ padding: '0.75rem 0', borderBottom: '1px solid var(--linea)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                    <span>{s.sentimiento.charAt(0).toUpperCase() + s.sentimiento.slice(1)}</span>
                    <strong>{s.cantidad} ({pct}%)</strong>
                  </div>
                  <div style={{ height: '8px', background: 'var(--linea)', borderRadius: '4px', overflow: 'hidden' }}>
                    <div
                      style={{
                        height: '100%',
                        width: `${pct}%`,
                        background: {
                          positiva: '#1E7A4A',
                          neutra: '#5B6B66',
                          negativa: '#B3402A',
                          mixta: '#C08A2D',
                        }[s.sentimiento],
                      }}
                    />
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      </div>
    </div>
  )
}
