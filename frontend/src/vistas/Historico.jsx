import { useEffect, useState } from 'react'
import { obtenerHistoricoRemoto } from '../servicios/historico-api.js'
import { obtenerHistoricoLocal } from '../servicios/historico-local.js'
import { formatoFechaCorta } from '../utilidades/fechas.js'
import { etiquetaCategoria } from '../utilidades/etiquetas.js'

const COLORES_SENTIMIENTO = {
  positiva: 'var(--sent-positiva)',
  neutra: 'var(--sent-neutra)',
  negativa: 'var(--sent-negativa)',
  mixta: 'var(--sent-mixta)',
}

const COLORES_IMPORTANCIA = {
  bajo: '#5B6B66',
  medio: '#C08A2D',
  alto: '#B3402A',
}

const TAMANO_PAGINA = 50

export default function Historico() {
  const [noticias, setNoticias] = useState([])
  const [pagina, setPagina] = useState(1)
  const [total, setTotal] = useState(0)
  const [cargando, setCargando] = useState(true)
  const [usandoLocal, setUsandoLocal] = useState(false)

  useEffect(() => {
    let cancelado = false
    setCargando(true)
    obtenerHistoricoRemoto({ pagina, tamanoPagina: TAMANO_PAGINA })
      .then((resultado) => {
        if (cancelado) return
        setNoticias(resultado.resultados)
        setTotal(resultado.total)
        setUsandoLocal(false)
      })
      .catch(() => {
        if (cancelado) return
        // Sin conexión al backend: mostrar el histórico local de este navegador
        // (fail-open, coherente con el resto del proyecto).
        setNoticias(obtenerHistoricoLocal())
        setTotal(0)
        setUsandoLocal(true)
      })
      .finally(() => {
        if (!cancelado) setCargando(false)
      })
    return () => {
      cancelado = true
    }
  }, [pagina])

  if (cargando) {
    return (
      <div style={{ padding: 'var(--pad-vista)', maxWidth: '1200px', margin: '0 auto' }}>
        <h1>Histórico de noticias</h1>
        <p style={{ color: 'var(--gris-tenue)', textAlign: 'center', marginTop: '2rem' }}>Cargando…</p>
      </div>
    )
  }

  if (!noticias.length) {
    return (
      <div style={{ padding: 'var(--pad-vista)', maxWidth: '1200px', margin: '0 auto' }}>
        <h1>Histórico de noticias</h1>
        <p style={{ color: 'var(--gris-tenue)', textAlign: 'center', marginTop: '2rem' }}>
          Aún no hay noticias en el histórico
        </p>
      </div>
    )
  }

  const totalPaginas = usandoLocal ? 1 : Math.max(1, Math.ceil(total / TAMANO_PAGINA))

  return (
    <div style={{ padding: 'var(--pad-vista)', maxWidth: '1200px', margin: '0 auto' }}>
      <h1>Histórico de noticias</h1>
      <p style={{ color: 'var(--gris-tenue)', marginBottom: '2rem' }}>
        {usandoLocal
          ? `${noticias.length} noticias guardadas localmente en este navegador (sin conexión al servidor)`
          : `${total} noticias en el archivo del servidor · página ${pagina} de ${totalPaginas}`}
      </p>

      <div
        style={{
          display: 'grid',
          gap: '1rem',
          gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))',
        }}
      >
        {noticias.map((noticia) => (
          <article
            key={noticia.id}
            title={noticia.sentimiento ? `Cobertura ${noticia.sentimiento}` : 'Sin análisis'}
            style={{
              border: '1px solid var(--linea)',
              borderLeft: `4px solid ${COLORES_SENTIMIENTO[noticia.sentimiento] || COLORES_SENTIMIENTO.neutra}`,
              borderRadius: '0.5rem',
              padding: '1rem',
              background: 'var(--tarjeta)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--gris)', textTransform: 'uppercase' }}>
                {noticia.medioNombre}
              </span>
            </div>

            <a
              href={noticia.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'block',
                fontSize: '0.95rem',
                fontWeight: '600',
                color: 'var(--color-institucional)',
                textDecoration: 'none',
                marginBottom: '0.5rem',
                lineHeight: '1.4',
              }}
              title={noticia.titular}
            >
              {noticia.titular.length > 100 ? noticia.titular.slice(0, 100) + '…' : noticia.titular}
            </a>

            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem', fontSize: '0.75rem', color: 'var(--gris-tenue)' }}>
              <span>{formatoFechaCorta(noticia.fecha)}</span>
              {Number.isFinite(noticia.importancia) && (
                <span
                  style={{
                    background: COLORES_IMPORTANCIA[noticia.importancia > 70 ? 'alto' : noticia.importancia > 40 ? 'medio' : 'bajo'],
                    color: 'white',
                    padding: '0.2rem 0.5rem',
                    borderRadius: '0.25rem',
                    fontSize: '0.7rem',
                  }}
                >
                  Importancia: {Math.round(noticia.importancia)}%
                </span>
              )}
            </div>

            {noticia.categorias?.length > 0 && (
              <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                {noticia.categorias.slice(0, 2).map((cat) => (
                  <span
                    key={cat}
                    style={{
                      fontSize: '0.65rem',
                      background: 'var(--linea)',
                      padding: '0.2rem 0.4rem',
                      borderRadius: '0.2rem',
                    }}
                  >
                    {etiquetaCategoria(cat)}
                  </span>
                ))}
              </div>
            )}
          </article>
        ))}
      </div>

      {!usandoLocal && totalPaginas > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', marginTop: '2rem' }}>
          <button
            type="button"
            onClick={() => setPagina((p) => Math.max(1, p - 1))}
            disabled={pagina <= 1}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '0.375rem',
              border: '1px solid var(--linea)',
              background: 'var(--tarjeta)',
              cursor: pagina <= 1 ? 'not-allowed' : 'pointer',
            }}
          >
            ← Más recientes
          </button>
          <button
            type="button"
            onClick={() => setPagina((p) => p + 1)}
            disabled={pagina >= totalPaginas}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '0.375rem',
              border: '1px solid var(--linea)',
              background: 'var(--tarjeta)',
              cursor: pagina >= totalPaginas ? 'not-allowed' : 'pointer',
            }}
          >
            Más antiguas →
          </button>
        </div>
      )}
    </div>
  )
}
