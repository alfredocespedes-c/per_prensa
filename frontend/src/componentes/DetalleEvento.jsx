import { useEffect } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'
import ChipSentimiento from './ChipSentimiento.jsx'
import NoticiaItem from './NoticiaItem.jsx'
import { sentimientoPredominante } from '../utilidades/eventos.js'
import { formatoFechaCorta } from '../utilidades/fechas.js'

// Un evento grande puede tener 37 medios: listarlos todos ocupa tres líneas de gris
// antes de la primera noticia. Se nombran los primeros y se cuenta el resto.
const MAXIMO_MEDIOS_LISTADOS = 12

export default function DetalleEvento({ evento }) {
  const mediosListados = evento.medios.slice(0, MAXIMO_MEDIOS_LISTADOS)
  const mediosRestantes = evento.medios.length - mediosListados.length

  // Al abrir un evento desde el fondo del listado, sin esto el detalle aparece
  // scrolleado a media página.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [evento.eventId])

  return (
    <div className="detalle-evento">
      <Link to="/eventos" className="enlace-volver">
        <ArrowLeft size={16} aria-hidden="true" /> Volver a eventos
      </Link>

      <h1 className="detalle-evento-titulo">{evento.titulo}</h1>

      <div className="detalle-evento-meta">
        <ChipSentimiento sentimiento={sentimientoPredominante(evento.sentimientos)} />
        <span className="chip-importancia">Importancia: {evento.importancia}</span>
        <span className="detalle-evento-cifras">
          {evento.noticias.length} noticia{evento.noticias.length !== 1 ? 's' : ''} ·{' '}
          {evento.medios.length} medio{evento.medios.length !== 1 ? 's' : ''} ·{' '}
          {formatoFechaCorta(evento.fecha)}
        </span>
      </div>

      <p className="detalle-evento-medios">
        {mediosListados.join(' · ')}
        {mediosRestantes > 0 && ` y ${mediosRestantes} medio${mediosRestantes !== 1 ? 's' : ''} más`}
      </p>

      <div className="grilla-noticias">
        {evento.noticias.map((n) => (
          <NoticiaItem key={n.id} noticia={n} />
        ))}
      </div>
    </div>
  )
}
