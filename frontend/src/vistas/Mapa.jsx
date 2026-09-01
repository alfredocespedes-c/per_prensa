import { useEffect, useMemo, useState } from 'react'
import { createSearchParams, useNavigate } from 'react-router-dom'
import LeyendaMapa from '../componentes/LeyendaMapa.jsx'
import MapaChile from '../componentes/MapaChile.jsx'
import { useDatos } from '../contexto/ProveedorDatos.jsx'
import { agruparPorRegion, conteosPorRegion, rankingRegiones } from '../servicios/agregaciones.js'
import { cargarGeoRegiones } from '../servicios/geo.js'
import { etiquetaRegion } from '../utilidades/etiquetas.js'

export default function Mapa() {
  const { noticias, cargando, error } = useDatos()
  const navegar = useNavigate()
  const [geo, setGeo] = useState(null)
  const [errorGeo, setErrorGeo] = useState(null)

  useEffect(() => {
    let vigente = true
    cargarGeoRegiones().then(
      (datos) => vigente && setGeo(datos),
      (e) => vigente && setErrorGeo(e.message),
    )
    return () => {
      vigente = false
    }
  }, [])

  const slugs = useMemo(() => geo?.features.map((f) => f.properties.slug) ?? [], [geo])
  const agregado = useMemo(() => agruparPorRegion(noticias, slugs), [noticias, slugs])
  const conteos = useMemo(() => conteosPorRegion(agregado.porRegion), [agregado])
  const ranking = useMemo(() => rankingRegiones(agregado.porRegion), [agregado])

  if (cargando) return <div className="estado">Cargando…</div>
  if (error) return <div className="estado estado-error">No se pudieron cargar las noticias: {error}</div>

  const irARegion = (slug) =>
    navegar({ pathname: '/regiones', search: `?${createSearchParams({ region: slug })}` })

  return (
    <div className="vista">
      <h1>Mapa de noticias</h1>
      <p className="vista-bajada">
        Intensidad de cobertura por región en la ventana actual. Haz clic en una región
        para ver sus noticias.
      </p>

      {errorGeo && (
        <p className="estado estado-error">No se pudo cargar la geometría del mapa: {errorGeo}</p>
      )}

      {agregado.conNoticias === 0 && !errorGeo && (
        <p className="mapa-nota">
          Aún no hay noticias con región detectada. El mapa se poblará a medida que el
          análisis geográfico procese la ventana.
        </p>
      )}

      <div className="mapa-disposicion">
        <div>
          {geo ? (
            <MapaChile geo={geo} conteos={conteos} alSeleccionar={irARegion} />
          ) : (
            !errorGeo && <div className="estado">Cargando mapa…</div>
          )}
          <LeyendaMapa maximo={agregado.maximo} />
        </div>

        <aside className="mapa-ranking" aria-label="Regiones por cantidad de noticias">
          <h2>Ranking</h2>
          <ol>
            {ranking.map((region) => (
              <li key={region.slug}>
                <button type="button" onClick={() => irARegion(region.slug)}>
                  <span>{etiquetaRegion(region.slug)}</span>
                  <span className={region.total ? 'mapa-ranking-cifra' : 'mapa-ranking-cifra cero'}>
                    {region.total}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </div>
  )
}
