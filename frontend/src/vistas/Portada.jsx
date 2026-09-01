import { useEffect, useMemo, useRef, useState } from 'react'
import { useDatos } from '../contexto/ProveedorDatos.jsx'
import { esHoy, esHoyOAyer } from '../utilidades/fechas.js'

function normalizarTitular(titular) {
  return String(titular ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9ñ]/g, '')
}
function quitarDuplicados(lista) {
  const vistos = new Set()
  return lista.filter((n) => { const clave = normalizarTitular(n.titular); if (!clave || vistos.has(clave)) return false; vistos.add(clave); return true })
}
function fechaLarga() { return new Intl.DateTimeFormat('es-CL', { weekday:'long', day:'numeric', month:'long', year:'numeric' }).format(new Date()) }
function textoExtracto(n) { return n.extracto?.map((x) => x.texto).join(' ').trim() || 'Sin resumen disponible.' }

function NoticiaScroll({ noticia, indice }) {
  const ref = useRef(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const nodo = ref.current
    if (!nodo) return
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: .38, rootMargin: '-8% 0px -14% 0px' })
    observer.observe(nodo)
    return () => observer.disconnect()
  }, [])
  return <article ref={ref} className={`noticia-scroll ${visible ? 'visible' : ''}`}>
    <div className="noticia-scroll-numero">{String(indice + 1).padStart(2,'0')}</div>
    <div className="noticia-scroll-contenido">
      <div className="noticia-scroll-meta"><span>{noticia.medioNombre}</span><span>{noticia.conceptoPrincipal}</span></div>
      <h3>{noticia.titular}</h3>
      <div className="noticia-scroll-reveal">
        <p>{textoExtracto(noticia)}</p>
        <a href={noticia.url} target="_blank" rel="noreferrer">Leer noticia completa <span>↗</span></a>
      </div>
    </div>
  </article>
}

export default function Portada() {
  const { noticias = [], conceptos = [], cargando, error } = useDatos()
  const [periodo, setPeriodo] = useState('hoy')
  const [tema, setTema] = useState('todos')
  const base = useMemo(() => quitarDuplicados(noticias), [noticias])
  const conteos = useMemo(() => ({ todas:base.length, hoy:base.filter(n=>esHoy(n.fecha)).length, 'hoy-ayer':base.filter(n=>esHoyOAyer(n.fecha)).length }), [base])
  const filtradas = useMemo(() => base.filter(n => (periodo==='hoy'?esHoy(n.fecha):periodo==='hoy-ayer'?esHoyOAyer(n.fecha):true) && (tema==='todos'||n.conceptoPrincipal===tema)), [base,periodo,tema])
  if (cargando) return <main className="portada-editorial"><p className="estado">Cargando noticias…</p></main>
  if (error) return <main className="portada-editorial"><p className="estado estado-error">No se pudieron cargar las noticias: {error}</p></main>
  const medios = new Set(filtradas.map(n=>n.medioNombre)).size
  const temas = new Set(filtradas.map(n=>n.conceptoPrincipal)).size
  const ranking = Object.entries(filtradas.reduce((a,n)=>{a[n.medioNombre]=(a[n.medioNombre]||0)+1;return a},{})).sort((a,b)=>b[1]-a[1]).slice(0,5)
  return <main className="portada-editorial portada-dinamica">
    <header className="editorial-cabecera"><div><p className="editorial-kicker">MONITOREO DE PRENSA</p><h1>Prensa de hoy</h1><p className="editorial-fecha">{fechaLarga()}</p></div><div className="editorial-resumen"><strong>{filtradas.length}</strong><span>noticias</span><strong>{medios}</strong><span>medios</span><strong>{temas}</strong><span>temas</span></div></header>
    <div className="editorial-filtros"><div className="filtro-periodo">{[['hoy','Hoy'],['hoy-ayer','Hoy y ayer'],['todas','Todas']].map(([id,e])=><button key={id} className={`filtro-periodo-boton ${periodo===id?'activo':''}`} onClick={()=>setPeriodo(id)}>{e}<span className="filtro-periodo-conteo">{conteos[id]}</span></button>)}</div><div className="editorial-temas"><button className={tema==='todos'?'activo':''} onClick={()=>setTema('todos')}>Todos los temas</button>{conceptos.map(c=><button key={c.texto} className={tema===c.texto?'activo':''} onClick={()=>setTema(c.texto)}>{c.texto}</button>)}</div></div>
    <section className="scroll-intro"><p className="editorial-kicker">ACTUALIDAD</p><h2>Lo que está pasando.</h2><p>Recorre los titulares. Cada historia revela su contexto a medida que avanzas.</p><span className="scroll-indicador">Desliza para explorar ↓</span></section>
    <section className="dinamica-layout"><div className="dinamica-feed">{filtradas.map((n,i)=><NoticiaScroll key={n.id} noticia={n} indice={i}/>)}</div><aside className="editorial-lateral dinamica-lateral"><div className="lateral-bloque"><p className="lateral-rotulo">RADAR DE MEDIOS</p><h3>Más publicaciones</h3>{ranking.map(([m,t],i)=><div className="ranking-medio" key={m}><b>{String(i+1).padStart(2,'0')}</b><span>{m}</span><strong>{t}</strong></div>)}</div><div className="lateral-bloque"><p className="lateral-rotulo">TEMAS DEL DÍA</p><div className="nube-temas">{conceptos.map(c=><button key={c.texto} onClick={()=>setTema(c.texto)}>{c.texto}</button>)}</div></div></aside></section>
  </main>
}
