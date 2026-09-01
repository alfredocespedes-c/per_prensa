import { useMemo } from 'react'
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts'
import { useDatos } from '../contexto/ProveedorDatos.jsx'
import Kpi from '../componentes/Kpi.jsx'
import { etiquetaCategoria, etiquetaRegion } from '../utilidades/etiquetas.js'
import {
  calcularKpis, agruparPorDia, agruparPorMedio, agruparPorCategoria,
  agruparPorSentimiento, topPalabras, topOrganizaciones,
  topRegiones, promedios
} from '../servicios/agregaciones.js'

const COLORES_SENTIMIENTO = {
  positiva: '#1E7A4A', neutra: '#5B6B66', negativa: '#B3402A', mixta: '#C08A2D'
}

export default function Dashboard() {
  const { noticias, cargando, error } = useDatos()

  const kpis = useMemo(() => calcularKpis(noticias), [noticias])
  const porDia = useMemo(() => agruparPorDia(noticias || []), [noticias])
  const porMedio = useMemo(() => agruparPorMedio(noticias || []), [noticias])
  const porCategoria = useMemo(
    () => agruparPorCategoria(noticias || []).map((c) => ({ ...c, etiqueta: etiquetaCategoria(c.cat) })),
    [noticias],
  )
  const porSentimiento = useMemo(() => agruparPorSentimiento(noticias || []).filter((s) => s.cantidad > 0), [noticias])
  const palabras = useMemo(() => topPalabras(noticias || []), [noticias])
  const orgs = useMemo(() => topOrganizaciones(noticias || []), [noticias])
  const regiones = useMemo(() => topRegiones(noticias || []), [noticias])
  const prom = useMemo(() => promedios(noticias || []), [noticias])

  if (cargando) return <div className="estado">Cargando…</div>
  if (error) return <div className="estado estado-error">No se pudieron cargar las noticias: {error}</div>
  if (!noticias?.length) {
    return (
      <div style={{ padding: 'var(--pad-vista)', maxWidth: '1200px', margin: '0 auto' }}>
        <h1>Dashboard</h1>
        <p style={{ color: 'var(--gris-tenue)', marginTop: '1rem' }}>Aún no hay noticias para analizar.</p>
      </div>
    )
  }

  const conAnalisis = noticias.filter((n) => n.analisis).length

  return (
    <div style={{ padding: 'var(--pad-vista)', maxWidth: '1200px', margin: '0 auto' }}>
      <h1>Dashboard</h1>
      {conAnalisis < noticias.length && (
        <p style={{ color: 'var(--gris-tenue)', fontSize: '0.85rem', margin: '0.5rem 0 0' }}>
          Análisis disponible en {conAnalisis} de {noticias.length} noticias; los indicadores
          de sentimiento y categorías se calculan sobre ese subconjunto.
        </p>
      )}

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginTop: '2rem', marginBottom: '2rem' }}>
        <Kpi label="Hoy" valor={kpis.hoy} />
        <Kpi label="Esta semana" valor={kpis.semana} />
        <Kpi label="Este mes" valor={kpis.mes} />
        <Kpi label="Noticias críticas" valor={kpis.criticas} acento="#B3402A" />
        <Kpi label="Negativas" valor={kpis.negativas} acento="#B3402A" />
        <Kpi label="Positivas" valor={kpis.positivas} acento="#1E7A4A" />
        <Kpi label="Medios únicos" valor={kpis.medios} />
        <Kpi label="Tiempo promedio lectura" valor={Number.isFinite(prom.lectura) ? `${prom.lectura} min` : '—'} />
      </div>

      {/* Gráficos */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 400px), 1fr))', gap: '2rem', marginTop: '2rem' }}>
        {/* Noticias por día */}
        <div style={{ background: 'var(--tarjeta)', padding: '1rem', borderRadius: '0.5rem', border: '1px solid var(--linea)' }}>
          <h3>Noticias por día</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={porDia}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--linea)" />
              <XAxis dataKey="dia" stroke="var(--gris)" />
              <YAxis stroke="var(--gris)" />
              <Tooltip />
              <Line type="monotone" dataKey="cantidad" stroke="var(--verde)" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Sentimiento */}
        <div style={{ background: 'var(--tarjeta)', padding: '1rem', borderRadius: '0.5rem', border: '1px solid var(--linea)' }}>
          <h3>Distribución por sentimiento</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie data={porSentimiento} dataKey="cantidad" label nameKey="sentimiento" cx="50%" cy="50%" outerRadius={80}>
                {porSentimiento.map(e => <Cell key={e.sentimiento} fill={COLORES_SENTIMIENTO[e.sentimiento]} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Top medios */}
        <div style={{ background: 'var(--tarjeta)', padding: '1rem', borderRadius: '0.5rem', border: '1px solid var(--linea)' }}>
          <h3>Top 10 medios</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={porMedio}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--linea)" />
              <XAxis dataKey="nombre" stroke="var(--gris)" angle={-45} textAnchor="end" height={80} />
              <YAxis stroke="var(--gris)" />
              <Tooltip />
              <Bar dataKey="cantidad" fill="var(--verde)" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Top categorías */}
        <div style={{ background: 'var(--tarjeta)', padding: '1rem', borderRadius: '0.5rem', border: '1px solid var(--linea)' }}>
          <h3>Top categorías</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={porCategoria}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--linea)" />
              <XAxis dataKey="etiqueta" stroke="var(--gris)" angle={-45} textAnchor="end" height={100} interval={0} fontSize={12} />
              <YAxis stroke="var(--gris)" />
              <Tooltip />
              <Bar dataKey="cantidad" fill="var(--verde)" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Tops */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2rem', marginTop: '2rem' }}>
        <div style={{ background: 'var(--tarjeta)', padding: '1rem', borderRadius: '0.5rem', border: '1px solid var(--linea)' }}>
          <h3>Top palabras</h3>
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {palabras.map(p => (
              <li key={p.palabra} style={{ padding: '0.5rem 0', borderBottom: '1px solid var(--linea)' }}>
                <strong>{p.palabra}</strong> ({p.freq})
              </li>
            ))}
          </ul>
        </div>

        <div style={{ background: 'var(--tarjeta)', padding: '1rem', borderRadius: '0.5rem', border: '1px solid var(--linea)' }}>
          <h3>Top organizaciones</h3>
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {orgs.map(o => (
              <li key={o.org} style={{ padding: '0.5rem 0', borderBottom: '1px solid var(--linea)' }}>
                <strong>{o.org}</strong> ({o.freq})
              </li>
            ))}
          </ul>
        </div>


        <div style={{ background: 'var(--tarjeta)', padding: '1rem', borderRadius: '0.5rem', border: '1px solid var(--linea)' }}>
          <h3>Top regiones</h3>
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {regiones.map(r => (
              <li key={r.region} style={{ padding: '0.5rem 0', borderBottom: '1px solid var(--linea)' }}>
                <strong>{etiquetaRegion(r.region)}</strong> ({r.freq})
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
