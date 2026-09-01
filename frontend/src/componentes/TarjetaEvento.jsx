import { ChevronDown } from 'lucide-react'
import { Link, createSearchParams } from 'react-router-dom'
import ChipSentimiento from './ChipSentimiento.jsx'
import NoticiaItem from './NoticiaItem.jsx'
import { sentimientoPredominante } from '../utilidades/eventos.js'
import { formatoFechaCorta } from '../utilidades/fechas.js'

// Cuántas noticias se muestran al desplegar la tarjeta. El resto vive en el detalle:
// un evento grande (los hay de 50+) reventaría el listado si se volcara entero acá.
const MAXIMO_EN_ACORDEON = 6

export default function TarjetaEvento({ evento, expandido, alAlternar }) {
  const idPanel = `evento-panel-${evento.eventId}`
  const visibles = evento.noticias.slice(0, MAXIMO_EN_ACORDEON)
  const ocultas = evento.noticias.length - visibles.length

  // El eventId es `evt:<URL canónica>`: trae `:`, `//` y a veces `?` o `#`. Se codifica
  // con createSearchParams, NUNCA con un template literal — parsePath de react-router
  // parte por `#` antes que por `?` y un `#` crudo rompería la ruta.
  const enlaceDetalle = {
    pathname: '/eventos',
    search: `?${createSearchParams({ evento: evento.eventId })}`,
  }

  return (
    <article className="tarjeta-evento" data-expandido={expandido ? 'true' : 'false'}>
      <h3 className="tarjeta-evento-titulo">
        <button
          type="button"
          className="tarjeta-evento-cabecera"
          aria-expanded={expandido}
          aria-controls={idPanel}
          onClick={alAlternar}
        >
          <span>{evento.titulo}</span>
          <ChevronDown size={18} className="tarjeta-evento-chevron" aria-hidden="true" />
        </button>
      </h3>

      <div className="tarjeta-evento-chips">
        <ChipSentimiento sentimiento={sentimientoPredominante(evento.sentimientos)} />
        <span className="chip-importancia">Importancia: {evento.importancia}</span>
      </div>

      <p className="tarjeta-evento-resumen">
        <strong>{evento.noticias.length}</strong> noticia{evento.noticias.length !== 1 ? 's' : ''} en{' '}
        <strong>{evento.medios.length}</strong> medio{evento.medios.length !== 1 ? 's' : ''}
        <span className="tarjeta-evento-fecha">{formatoFechaCorta(evento.fecha)}</span>
      </p>

      {expandido && (
        <div id={idPanel} className="tarjeta-evento-panel">
          <div className="grilla-noticias">
            {visibles.map((n) => (
              <NoticiaItem key={n.id} noticia={n} />
            ))}
          </div>
          <Link to={enlaceDetalle} className="enlace-evento">
            {ocultas > 0 ? `Ver el evento completo (${ocultas} más) →` : 'Ver el evento completo →'}
          </Link>
        </div>
      )}
    </article>
  )
}
