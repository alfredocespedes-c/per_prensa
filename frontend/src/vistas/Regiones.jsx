import { useEffect, useMemo, useState } from 'react'
import { Link, createSearchParams, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import MapaChile from '../componentes/MapaChile.jsx'
import NoticiaItem from '../componentes/NoticiaItem.jsx'
import { useDatos } from '../contexto/ProveedorDatos.jsx'
import { agruparPorRegion, conteosPorRegion, rankingRegiones } from '../servicios/agregaciones.js'
import { cargarGeoRegiones } from '../servicios/geo.js'
import { etiquetaCategoria, etiquetaRegion } from '../utilidades/etiquetas.js'

function porFechaDesc(a, b) {
  return new Date(b.fecha ?? 0) - new Date(a.fecha ?? 0)
}

function DetalleRegion({ region }) {
  const topCats = Object.entries(region.categorias)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 6)

  return (
    <div>
      <Link to="/regiones" className="enlace-volver">
        <ArrowLeft size={16} aria-hidden="true" /> Todas las regiones
      </Link>

      <h1>{etiquetaRegion(region.slug)}</h1>
      <p className="vista-bajada">
        {region.total} noticia{region.total !== 1 ? 's' : ''} en la ventana actual
        {topCats.length > 0 && ` · ${topCats.map(([c]) => etiquetaCategoria(c)).join(', ')}`}
      </p>

      {region.total === 0 ? (
        <div className="estado-vacio">
          No hay noticias con esta región detectada en la ventana actual.
        </div>
      ) : (
        <div className="grilla-noticias">
          {[...region.noticias].sort(porFechaDesc).map((n) => (
            <NoticiaItem key={n.id} noticia={n} />
          ))}
        </div>
      )}
    </div>
  )
}

export default function Regiones() {
  const { noticias, cargando, error } = useDatos()
  const navegar = useNavigate()
  const [parametros] = useSearchParams()
  const [geo, setGeo] = useState(null)

  useEffect(() => {
    let vigente = true
    // Un fallo acá degrada a la grilla de tarjetas sin mapa; no rompe la vista.
    cargarGeoRegiones().then(
      (datos) => vigente && setGeo(datos),
      () => {},
    )
    return () => {
      vigente = false
    }
  }, [])

  const slugs = useMemo(() => geo?.features.map((f) => f.properties.slug) ?? [], [geo])
  const agregado = useMemo(() => agruparPorRegion(noticias, slugs), [noticias, slugs])
  const conteos = useMemo(() => conteosPorRegion(agregado.porRegion), [agregado])
  const ranking = useMemo(() => rankingRegiones(agregado.porRegion), [agregado])

  const slugPedido = parametros.get('region')

  if (cargando) return <div className="estado">Cargando…</div>
  if (error) return <div className="estado estado-error">No se pudieron cargar las noticias: {error}</div>

  if (slugPedido) {
    const region = agregado.porRegion[slugPedido]
    return (
      <div className="vista">
        {region ? (
          <DetalleRegion region={region} />
        ) : (
          <div className="estado-vacio">
            <p>«{slugPedido}» no es una región de Chile.</p>
            <Link to="/regiones" className="enlace-evento">
              Ver todas las regiones →
            </Link>
          </div>
        )}
      </div>
    )
  }

  const irARegion = (slug) =>
    navegar({ pathname: '/regiones', search: `?${createSearchParams({ region: slug })}` })

  return (
    <div className="vista">
      <h1>Regiones ({agregado.conNoticias} con noticias)</h1>
      <p className="vista-bajada">
        Haz clic en una región del mapa o en una tarjeta para ver sus noticias.
      </p>

      {geo && (
        <div className="regiones-mapa">
          <MapaChile geo={geo} conteos={conteos} compacto alSeleccionar={irARegion} />
        </div>
      )}

      <div className="grilla-regiones">
        {ranking.map((region) => {
          const topCats = Object.entries(region.categorias)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 3)
          return (
            <button
              key={region.slug}
              type="button"
              className={`tarjeta-region ${region.total === 0 ? 'sin-noticias' : ''}`}
              onClick={() => irARegion(region.slug)}
            >
              <h3>{etiquetaRegion(region.slug)}</h3>
              <p className="tarjeta-region-cifra">{region.total}</p>
              <p className="tarjeta-region-pie">
                noticia{region.total !== 1 ? 's' : ''}
              </p>
              {topCats.length > 0 && (
                <ul className="tarjeta-region-categorias">
                  {topCats.map(([cat, conteo]) => (
                    <li key={cat}>
                      <span>{etiquetaCategoria(cat)}</span>
                      <strong>{conteo}</strong>
                    </li>
                  ))}
                </ul>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
