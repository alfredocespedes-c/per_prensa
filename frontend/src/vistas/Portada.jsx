import { useMemo, useState } from 'react'
import { useDatos } from '../contexto/ProveedorDatos.jsx'
import NoticiaItem from '../componentes/NoticiaItem.jsx'
import { esHoy, esHoyOAyer } from '../utilidades/fechas.js'

function normalizarTitular(titular) {
  return String(titular ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9ñ]/g, '')
}

function quitarDuplicados(lista) {
  const vistos = new Set()
  return lista.filter((n) => {
    const clave = normalizarTitular(n.titular)
    if (!clave || vistos.has(clave)) return false
    vistos.add(clave)
    return true
  })
}

function fechaLarga() {
  return new Intl.DateTimeFormat('es-CL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date())
}

export default function Portada() {
  const { noticias = [], conceptos = [], cargando, error } = useDatos()
  const [periodo, setPeriodo] = useState('hoy')
  const [tema, setTema] = useState('todos')

  const base = useMemo(() => quitarDuplicados(noticias), [noticias])
  const conteos = useMemo(() => ({
    todas: base.length,
    hoy: base.filter((n) => esHoy(n.fecha)).length,
    'hoy-ayer': base.filter((n) => esHoyOAyer(n.fecha)).length,
  }), [base])

  const filtradas = useMemo(() => base.filter((n) => {
    const fechaOk = periodo === 'hoy' ? esHoy(n.fecha) : periodo === 'hoy-ayer' ? esHoyOAyer(n.fecha) : true
    const temaOk = tema === 'todos' || n.conceptoPrincipal === tema
    return fechaOk && temaOk
  }), [base, periodo, tema])

  if (cargando) return <main className="portada-editorial"><p className="estado">Cargando noticias…</p></main>
  if (error) return <main className="portada-editorial"><p className="estado estado-error">No se pudieron cargar las noticias: {error}</p></main>

  const principal = filtradas[0]
  const secundarias = filtradas.slice(1, 4)
  const resto = filtradas.slice(4)
  const medios = new Set(filtradas.map((n) => n.medioNombre)).size
  const temas = new Set(filtradas.map((n) => n.conceptoPrincipal)).size
  const ranking = Object.entries(filtradas.reduce((acc, n) => {
    acc[n.medioNombre] = (acc[n.medioNombre] || 0) + 1
    return acc
  }, {})).sort((a, b) => b[1] - a[1]).slice(0, 5)

  return (
    <main className="portada-editorial">
      <header className="editorial-cabecera">
        <div>
          <p className="editorial-kicker">MONITOREO DE PRENSA</p>
          <h1>Prensa de hoy</h1>
          <p className="editorial-fecha">{fechaLarga()}</p>
        </div>
        <div className="editorial-resumen">
          <strong>{filtradas.length}</strong><span>noticias</span>
          <strong>{medios}</strong><span>medios</span>
          <strong>{temas}</strong><span>temas</span>
        </div>
      </header>

      <div className="editorial-filtros">
        <div className="filtro-periodo" role="group" aria-label="Filtrar por fecha">
          {[['hoy','Hoy'],['hoy-ayer','Hoy y ayer'],['todas','Todas']].map(([id, etiqueta]) => (
            <button key={id} className={`filtro-periodo-boton ${periodo === id ? 'activo' : ''}`} onClick={() => setPeriodo(id)}>
              {etiqueta}<span className="filtro-periodo-conteo">{conteos[id]}</span>
            </button>
          ))}
        </div>
        <div className="editorial-temas">
          <button className={tema === 'todos' ? 'activo' : ''} onClick={() => setTema('todos')}>Todos los temas</button>
          {conceptos.map((c) => <button key={c.texto} className={tema === c.texto ? 'activo' : ''} onClick={() => setTema(c.texto)}>{c.texto}</button>)}
        </div>
      </div>

      {!principal ? <p className="estado">No hay noticias para este filtro.</p> : <>
        <section className="editorial-destacadas">
          <article className="noticia-principal">
            <div className="principal-meta"><span>{principal.medioNombre}</span><span>{principal.conceptoPrincipal}</span></div>
            <h2>{principal.titular}</h2>
            <p>{principal.extracto?.map((x) => x.texto).join(' ')}</p>
            <a href={principal.url} target="_blank" rel="noreferrer">Ver noticia completa →</a>
          </article>
          <div className="editorial-secundarias">
            {secundarias.map((n) => <NoticiaItem key={n.id} noticia={n} superficie="interna" marcarHoy={false} />)}
          </div>
        </section>

        <section className="editorial-cuerpo">
          <div className="editorial-feed">
            <div className="editorial-titulo-linea"><h2>Últimas noticias</h2><span>{resto.length} publicaciones</span></div>
            <div className="editorial-lista">
              {resto.map((n) => <NoticiaItem key={n.id} noticia={n} superficie="interna" marcarHoy={periodo !== 'hoy'} />)}
            </div>
          </div>
          <aside className="editorial-lateral">
            <div className="lateral-bloque">
              <p className="lateral-rotulo">RADAR DE MEDIOS</p>
              <h3>Más publicaciones</h3>
              {ranking.map(([medio, total], i) => <div className="ranking-medio" key={medio}><b>{String(i+1).padStart(2,'0')}</b><span>{medio}</span><strong>{total}</strong></div>)}
            </div>
            <div className="lateral-bloque">
              <p className="lateral-rotulo">TEMAS DEL DÍA</p>
              <div className="nube-temas">{conceptos.map((c) => <button key={c.texto} onClick={() => setTema(c.texto)}>{c.texto}</button>)}</div>
            </div>
          </aside>
        </section>
      </>}
    </main>
  )
}
