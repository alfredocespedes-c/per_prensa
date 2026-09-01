import { useId, useMemo, useState } from 'react'
import { claseMapa, cortesMapa } from '../utilidades/mapa.js'
import { etiquetaRegion } from '../utilidades/etiquetas.js'
import './MapaChile.css'

// Mapa coroplético de Chile en SVG. Sin Leaflet y sin teselas externas, por tres
// razones concretas:
//
//  1. Relación de aspecto. Chile continental mide 9,3° de ancho por 38,5° de alto: en
//     un contenedor de 620 px de alto, un mapa continuo sale de 118 px de ancho y la
//     Metropolitana de 12x11 px. Eso no se arregla configurando un motor de mapas; se
//     arregla controlando el viewBox, que es justo lo que Leaflet no deja hacer.
//     Por eso las tres bandas (Norte / Centro / Sur), como en los atlas chilenos:
//     mismo alto, ~605 px de ancho, Metropolitana de 60x54 px. La ESCALA ES LA MISMA
//     en las tres bandas, así que las áreas siguen siendo comparables.
//  2. Tema. El color sale del token de la rampa (--mapa-0 … --mapa-5), así que el
//     cambio claro/oscuro es
//     gratis. Con Leaflet habría que resolver los tokens a hex, observar data-theme
//     con MutationObserver y llamar setStyle() capa por capa.
//  3. Accesibilidad. Un <path tabIndex role="link"> es navegable con teclado sin pelear
//     con la gestión del DOM de una librería.

// Proyección equirrectangular con paralelo estándar -38°. Mercator NO sirve: infla
// Magallanes 1,8 veces respecto de Arica, y una coropleta se lee por área.
const LAT0 = -38
const K = Math.cos((LAT0 * Math.PI) / 180)
const proyectar = ([lon, lat]) => [lon * K, -lat]

// El territorio insular (Rapa Nui en lon -109,45, Juan Fernández en -80) SÍ está en los
// datos —son dos Parques Nacionales de CONAF— pero queda fuera del ENCUADRE: si no, el
// mapa se aleja hasta abarcar el Pacífico y Chile continental queda en una hebra. Los
// bboxes se calculan ignorando esos puntos y el clipPath de cada banda los recorta.
const LON_MIN_ENCUADRE = -76

const BANDAS = [
  { id: 'norte', etiqueta: 'Norte', slugs: ['arica-parinacota', 'tarapaca', 'antofagasta', 'atacama', 'coquimbo'] },
  { id: 'centro', etiqueta: 'Centro', slugs: ['valparaiso', 'metropolitana', 'ohiggins', 'maule', 'nuble', 'biobio', 'araucania', 'los-rios'] },
  { id: 'sur', etiqueta: 'Sur', slugs: ['los-lagos', 'aysen', 'magallanes'] },
]

const CANALETA = 10
const ALTO_MIN_PARA_NUMERO = 14
// Franja superior para los rótulos Norte/Centro/Sur. Van ARRIBA y no al pie: sin ellos
// a la vista, el mapa se lee como tres trozos sueltos de Chile en vez de tres bandas.
const ALTO_ROTULOS = 20

export default function MapaChile({
  geo,
  conteos,
  compacto = false,
  seleccionada = null,
  alSeleccionar,
}) {
  const uid = useId().replace(/:/g, '')
  const [encima, setEncima] = useState(null)

  const alto = compacto ? 300 : 620

  const disposicion = useMemo(() => {
    if (!geo) return null

    const porSlug = new Map()
    for (const feature of geo.features) {
      const anillos = feature.geometry.coordinates.map(([anillo]) => anillo.map(proyectar))
      const d = anillos
        .map((puntos) => `M${puntos.map(([x, y]) => `${x.toFixed(4)},${y.toFixed(4)}`).join('L')}Z`)
        .join('')

      let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity
      for (const puntos of anillos) {
        for (const [x, y] of puntos) {
          if (x / K < LON_MIN_ENCUADRE) continue
          if (x < xMin) xMin = x
          if (x > xMax) xMax = x
          if (y < yMin) yMin = y
          if (y > yMax) yMax = y
        }
      }

      porSlug.set(feature.properties.slug, {
        slug: feature.properties.slug,
        d,
        label: proyectar(feature.properties.label),
        xMin, xMax, yMin, yMax,
      })
    }

    const bandas = BANDAS.map((banda) => {
      const features = banda.slugs.map((slug) => porSlug.get(slug)).filter(Boolean)
      const xMin = Math.min(...features.map((f) => f.xMin))
      const xMax = Math.max(...features.map((f) => f.xMax))
      const yMin = Math.min(...features.map((f) => f.yMin))
      const yMax = Math.max(...features.map((f) => f.yMax))
      return { ...banda, features, xMin, xMax, yMin, yMax }
    })

    // Una sola escala para las tres bandas: si cada una se escalara a su propio alto,
    // las áreas dejarían de ser comparables y el coroplético mentiría.
    const altoMayor = Math.max(...bandas.map((b) => b.yMax - b.yMin))
    const escala = alto / altoMayor

    const dy = compacto ? 0 : ALTO_ROTULOS
    let x = 0
    for (const banda of bandas) {
      banda.dx = x
      banda.dy = dy
      banda.ancho = (banda.xMax - banda.xMin) * escala
      banda.alto = (banda.yMax - banda.yMin) * escala
      // translate lleva el origen del bbox de la banda a (dx, dy); scale hace el resto.
      banda.transform = `translate(${(banda.dx - banda.xMin * escala).toFixed(3)} ${(banda.dy - banda.yMin * escala).toFixed(3)}) scale(${escala.toFixed(5)})`
      x += banda.ancho + CANALETA
    }

    return { porSlug, bandas, escala, ancho: x - CANALETA, altoTotal: alto + dy }
  }, [geo, alto, compacto])

  if (!disposicion) return null

  const { bandas, escala, ancho, altoTotal } = disposicion
  const maximo = Math.max(0, ...Object.values(conteos ?? {}))
  const cortes = cortesMapa(maximo)

  const bandaDe = (slug) => bandas.find((b) => b.slugs.includes(slug))
  const enPantalla = (banda, [x, y]) => [
    banda.dx + (x - banda.xMin) * escala,
    banda.dy + (y - banda.yMin) * escala,
  ]

  const activar = (slug) => alSeleccionar?.(slug)

  const bandaSeleccionada = seleccionada ? bandaDe(seleccionada) : null
  const featureSeleccionada = seleccionada ? disposicion.porSlug.get(seleccionada) : null

  const nEncima = encima ? (conteos?.[encima] ?? 0) : null

  return (
    <div className={`mapa-chile ${compacto ? 'compacto' : ''}`}>
      {/* Línea de estado con alto reservado, no un globo flotante: sirve igual para el
          ratón y para el teclado (donde no hay cursor que seguir), no tapa los rótulos
          de banda y no desplaza el layout al aparecer. */}
      <p className="mapa-estado" role="status">
        {encima ? (
          <>
            <strong>{etiquetaRegion(encima)}</strong> — {nEncima} noticia
            {nEncima !== 1 ? 's' : ''}
          </>
        ) : (
          <span className="mapa-estado-vacio">
            {alSeleccionar ? 'Pasa el cursor o tabula por las regiones' : ' '}
          </span>
        )}
      </p>

      <svg
        viewBox={`0 0 ${ancho.toFixed(1)} ${altoTotal}`}
        className="mapa-chile-svg"
        role="img"
        aria-label="Mapa de Chile por región: noticias detectadas en la ventana actual"
      >
        <defs>
          {bandas.map((banda) => (
            <clipPath key={banda.id} id={`${uid}-clip-${banda.id}`}>
              <rect x={banda.dx - 1} y={banda.dy - 1} width={banda.ancho + 2} height={banda.alto + 2} />
            </clipPath>
          ))}
          {/* patternUnits="userSpaceOnUse" se resuelve en el espacio del path, que está
              ESCALADO por el <g>: sin dividir el paso por la escala (~39x) la trama
              saldría gigante y taparía la región entera. */}
          <pattern
            id={`${uid}-sin`}
            width={6 / escala}
            height={6 / escala}
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <rect width={6 / escala} height={6 / escala} className="mapa-trama-fondo" />
            <line
              x1="0" y1="0" x2="0" y2={6 / escala}
              className="mapa-trama-linea"
              strokeWidth={1.2 / escala}
            />
          </pattern>
        </defs>

        {bandas.map((banda) => (
          <g key={banda.id} clipPath={`url(#${uid}-clip-${banda.id})`}>
            <g transform={banda.transform}>
              {banda.features.map((feature) => {
                const n = conteos?.[feature.slug] ?? 0
                const clase = claseMapa(n, cortes)
                return (
                  <path
                    key={feature.slug}
                    d={feature.d}
                    className={`mapa-region ${clase} ${encima === feature.slug ? 'encima' : ''}`}
                    // La trama de "sin noticias" no puede vivir en CSS: su id es único
                    // por instancia del componente.
                    fill={n === 0 ? `url(#${uid}-sin)` : undefined}
                    // Sin esto el borde de 0,75 px se multiplica por la escala (~39) y
                    // el mapa queda cubierto de líneas de 30 px.
                    vectorEffect="non-scaling-stroke"
                    tabIndex={alSeleccionar ? 0 : undefined}
                    role={alSeleccionar ? 'link' : undefined}
                    aria-label={
                      alSeleccionar
                        ? `${etiquetaRegion(feature.slug)}, ${n} noticia${n !== 1 ? 's' : ''}. Ver sus noticias`
                        : undefined
                    }
                    onClick={alSeleccionar ? () => activar(feature.slug) : undefined}
                    onKeyDown={
                      alSeleccionar
                        ? (e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              activar(feature.slug)
                            }
                          }
                        : undefined
                    }
                    onMouseEnter={() => setEncima(feature.slug)}
                    onMouseLeave={() => setEncima((s) => (s === feature.slug ? null : s))}
                    onFocus={() => setEncima(feature.slug)}
                    onBlur={() => setEncima((s) => (s === feature.slug ? null : s))}
                  >
                    <title>{`${etiquetaRegion(feature.slug)}: ${n} noticia${n !== 1 ? 's' : ''}`}</title>
                  </path>
                )
              })}
            </g>
          </g>
        ))}

        {/* El resalte va al final y duplicado: subirle el stroke-width in situ no basta,
            porque los vecinos lo tapan por orden de pintado. */}
        {featureSeleccionada && bandaSeleccionada && (
          <g clipPath={`url(#${uid}-clip-${bandaSeleccionada.id})`} style={{ pointerEvents: 'none' }}>
            <g transform={bandaSeleccionada.transform}>
              <path d={featureSeleccionada.d} className="mapa-region-resalte" vectorEffect="non-scaling-stroke" />
            </g>
          </g>
        )}

        {/* Rótulos y números FUERA de los <g> escalados: dentro, la tipografía se
            escalaría con el mapa. */}
        {!compacto &&
          bandas.map((banda) => (
            <text
              key={`rotulo-${banda.id}`}
              x={banda.dx + banda.ancho / 2}
              y={ALTO_ROTULOS - 7}
              className="mapa-banda-rotulo"
              textAnchor="middle"
            >
              {banda.etiqueta}
            </text>
          ))}

        {!compacto &&
          bandas.flatMap((banda) =>
            banda.features.map((feature) => {
              const n = conteos?.[feature.slug] ?? 0
              if (!n) return null
              if ((feature.yMax - feature.yMin) * escala < ALTO_MIN_PARA_NUMERO) return null
              const [x, y] = enPantalla(banda, feature.label)
              const clase = claseMapa(n, cortes)
              return (
                <text
                  key={`n-${feature.slug}`}
                  x={x}
                  y={y + 4}
                  textAnchor="middle"
                  className={`mapa-numero ${clase}`}
                >
                  {n}
                </text>
              )
            }),
          )}
      </svg>
    </div>
  )
}
