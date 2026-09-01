import { useCallback, useEffect, useState } from 'react'
import { Check, X } from 'lucide-react'
import { listarRetiros, resolverRetiro } from '../servicios/retiros-api.js'

const ETIQUETA_AMBITO = { noticia: 'Nota', medio: 'Medio completo' }
const ETIQUETA_ESTADO = { pendiente: 'Pendiente', aplicado: 'Aplicado', rechazado: 'Rechazado' }

function fechaCorta(iso) {
  try {
    return new Date(iso).toLocaleDateString('es-CL', { timeZone: 'America/Santiago' })
  } catch {
    return '—'
  }
}

/**
 * Bandeja de solicitudes de retiro (solo admin).
 *
 * La clave es EDITABLE antes de aplicar, y eso no es un detalle de comodidad: el
 * formulario lo rellena un medio, que escribirá su dominio ("ejemplo.cl"), mientras que
 * el filtro de lectura compara contra el `medio_id` que usa el recolector ("ejemplo").
 * Sin esta corrección, aplicar la solicitud no ocultaría nada y nadie entendería por qué.
 */
export default function PanelRetiros() {
  const [retiros, setRetiros] = useState(null)
  const [error, setError] = useState(null)
  const [aviso, setAviso] = useState(null)
  const [claves, setClaves] = useState({})
  const [guardando, setGuardando] = useState(false)

  const cargar = useCallback(async () => {
    try {
      const datos = await listarRetiros()
      setRetiros(datos.retiros)
      setError(null)
    } catch (err) {
      if (err?.sesionExpirada) return
      setError(err.message)
    }
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  const resolver = async (retiro, estado) => {
    setGuardando(true)
    setError(null)
    setAviso(null)
    try {
      const clave = (claves[retiro.id] ?? retiro.clave).trim()
      await resolverRetiro(retiro.id, estado, clave)
      await cargar()
      setAviso(
        estado === 'aplicado'
          ? `Retiro aplicado. El contenido deja de mostrarse de inmediato, sin esperar la próxima corrida.`
          : 'Solicitud rechazada.',
      )
    } catch (err) {
      if (!err?.sesionExpirada) setError(err.message)
    } finally {
      setGuardando(false)
    }
  }

  if (error && !retiros) return <p className="estado estado-error">{error}</p>
  if (!retiros) return <p className="estado">Cargando solicitudes…</p>

  return (
    <section className="conceptos">
      <h2>Solicitudes de retiro</h2>
      <p className="conceptos-ayuda">
        Las envía cualquiera desde el formulario público, sin cuenta. <strong>Enviar una
        solicitud no retira nada</strong>: hay que aplicarla acá. Al aplicarla, el contenido
        desaparece de la portada pública y de la vista interna de inmediato, sin esperar la
        corrida horaria; y el recolector deja de volver a ingresarlo.
      </p>

      {error && <p className="conceptos-error">{error}</p>}
      {aviso && <p className="conceptos-ok">{aviso}</p>}

      {retiros.length === 0 ? (
        <p className="conceptos-vacio">No hay solicitudes.</p>
      ) : (
        <ul className="conceptos-lista">
          {retiros.map((retiro) => (
            <li key={retiro.id} className="retiro-item">
              <div className="retiro-cabecera">
                <span className={`retiro-estado retiro-estado-${retiro.estado}`}>
                  {ETIQUETA_ESTADO[retiro.estado]}
                </span>
                <span className="retiro-ambito">{ETIQUETA_AMBITO[retiro.ambito]}</span>
                <span className="retiro-fecha">{fechaCorta(retiro.creadoEn)}</span>
              </div>

              <label className="campo">
                <span>{retiro.ambito === 'medio' ? 'Identificador del medio' : 'URL de la nota'}</span>
                <input
                  type="text"
                  value={claves[retiro.id] ?? retiro.clave}
                  onChange={(e) => setClaves({ ...claves, [retiro.id]: e.target.value })}
                  disabled={guardando}
                />
                {retiro.ambito === 'medio' && (
                  <small>
                    Debe ser el id que usa el recolector (por ejemplo <code>la-tercera</code>),
                    no el dominio.
                  </small>
                )}
              </label>

              {retiro.solicitante && (
                <p className="retiro-dato">
                  {retiro.solicitante}
                  {retiro.contacto && <> · {retiro.contacto}</>}
                </p>
              )}
              {retiro.motivo && <p className="retiro-motivo">{retiro.motivo}</p>}
              {retiro.aplicadoPor && (
                <p className="retiro-dato">Aplicado por {retiro.aplicadoPor}</p>
              )}

              <div className="retiro-acciones">
                {retiro.estado !== 'aplicado' && (
                  <button type="button" disabled={guardando} onClick={() => resolver(retiro, 'aplicado')}>
                    <Check size={14} /> Aplicar
                  </button>
                )}
                {retiro.estado === 'aplicado' && (
                  <button type="button" disabled={guardando} onClick={() => resolver(retiro, 'pendiente')}>
                    Revertir
                  </button>
                )}
                {retiro.estado !== 'rechazado' && (
                  <button type="button" disabled={guardando} onClick={() => resolver(retiro, 'rechazado')}>
                    <X size={14} /> Rechazar
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
