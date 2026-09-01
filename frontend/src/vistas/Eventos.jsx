import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import DetalleEvento from '../componentes/DetalleEvento.jsx'
import TarjetaEvento from '../componentes/TarjetaEvento.jsx'
import { useDatos } from '../contexto/ProveedorDatos.jsx'
import { agruparEventos, buscarEvento } from '../utilidades/eventos.js'

export default function Eventos() {
  const { noticias, cargando, error } = useDatos()
  const [parametros] = useSearchParams()
  // Qué tarjeta está desplegada. Estado efímero a propósito: la URL sirve para
  // compartir el detalle de un evento, no para restaurar micro-estado del listado.
  const [expandido, setExpandido] = useState(null)

  const eventos = useMemo(() => agruparEventos(noticias), [noticias])

  const eventIdPedido = parametros.get('evento')
  const eventoPedido = useMemo(() => buscarEvento(eventos, eventIdPedido), [eventos, eventIdPedido])

  if (cargando) return <div className="estado">Cargando…</div>
  if (error) return <div className="estado estado-error">No se pudieron cargar las noticias: {error}</div>

  return (
    <div className="vista">
      {eventIdPedido ? (
        eventoPedido ? (
          <DetalleEvento evento={eventoPedido} />
        ) : (
          // La ventana rueda: un enlace compartido caduca en horas. Decirlo, en vez
          // de redirigir en silencio y dejar al usuario pensando que erró el clic.
          <div className="estado-vacio">
            <p>
              Ese evento ya no está en la ventana de noticias (se muestran las ~100 más
              recientes).
            </p>
            <Link to="/eventos" className="enlace-evento">
              Ver los eventos actuales →
            </Link>
          </div>
        )
      ) : (
        <>
          <h1>Eventos detectados ({eventos.length})</h1>
          <p className="vista-bajada">
            Noticias de distintos medios que cubren el mismo hecho. Despliega una tarjeta
            para ver sus noticias.
          </p>

          {eventos.length === 0 ? (
            <div className="estado-vacio">No hay eventos agrupados</div>
          ) : (
            <div className="grilla-eventos">
              {eventos.map((evento) => (
                <TarjetaEvento
                  key={evento.eventId}
                  evento={evento}
                  expandido={expandido === evento.eventId}
                  alAlternar={() =>
                    setExpandido((actual) => (actual === evento.eventId ? null : evento.eventId))
                  }
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
