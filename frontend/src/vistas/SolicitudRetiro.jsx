import { useState } from 'react'
import { CORREO_RETIRO } from '../componentes/PieInstitucional.jsx'
import { enviarSolicitudRetiro } from '../servicios/retiros-api.js'

const AMBITOS = [
  { id: 'noticia', etiqueta: 'Una nota puntual', ayuda: 'Pegue la dirección exacta de la nota.' },
  { id: 'medio', etiqueta: 'Todo un medio', ayuda: 'Indique el nombre o el dominio del medio.' },
]

/**
 * Formulario PÚBLICO de solicitud de retiro.
 *
 * Sin sesión a propósito: quien tiene derecho a pedir un retiro es el medio dueño del
 * contenido, y exigirle una cuenta en el IAM de CONAF para ejercerlo convertiría la vía
 * en un trámite inaccesible.
 *
 * La solicitud NO retira nada por sí sola: crea un registro que un administrador revisa
 * y aplica. Si bastara con enviar el formulario, cualquiera podría vaciar el boletín.
 * Una vez aplicado, el efecto sí es inmediato en ambas superficies (el filtro es de
 * lectura, no espera la corrida horaria del recolector).
 */
export default function SolicitudRetiro() {
  const [ambito, setAmbito] = useState('noticia')
  const [clave, setClave] = useState('')
  const [solicitante, setSolicitante] = useState('')
  const [contacto, setContacto] = useState('')
  const [motivo, setMotivo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [enviado, setEnviado] = useState(false)
  const [error, setError] = useState(null)

  const enviar = async (evento) => {
    evento.preventDefault()
    setEnviando(true)
    setError(null)
    try {
      await enviarSolicitudRetiro({ ambito, clave: clave.trim(), solicitante, contacto, motivo })
      setEnviado(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setEnviando(false)
    }
  }

  if (enviado) {
    return (
      <div className="vista">
        <h1>Solicitud recibida</h1>
        <p className="vista-bajada">
          Quedó registrada y la revisará la Unidad de Información y Análisis. Si necesita
          hacer seguimiento o aportar antecedentes, escriba a{' '}
          <a href={`mailto:${CORREO_RETIRO}`}>{CORREO_RETIRO}</a> indicando la dirección
          que informó.
        </p>
      </div>
    )
  }

  const ayuda = AMBITOS.find((a) => a.id === ambito).ayuda

  return (
    <div className="vista">
      <h1>Solicitud de retiro</h1>
      <p className="vista-bajada">
        Este sistema no aloja ni reproduce las notas de prensa: muestra el titular, la
        fecha, la autoría y un enlace a la publicación original. Aun así, si usted
        representa a un medio y quiere que dejemos de listar una nota —o todas las suyas—,
        puede pedirlo acá. No necesita tener cuenta.
      </p>

      <form className="formulario-retiro" onSubmit={enviar}>
        <fieldset>
          <legend>¿Qué quiere retirar?</legend>
          {AMBITOS.map((opcion) => (
            <label key={opcion.id} className="opcion-radio">
              <input
                type="radio"
                name="ambito"
                value={opcion.id}
                checked={ambito === opcion.id}
                onChange={() => setAmbito(opcion.id)}
              />
              {opcion.etiqueta}
            </label>
          ))}
        </fieldset>

        <label className="campo">
          <span>{ambito === 'noticia' ? 'Dirección de la nota' : 'Medio o dominio'}</span>
          <input
            type="text"
            required
            value={clave}
            onChange={(e) => setClave(e.target.value)}
            placeholder={ambito === 'noticia' ? 'https://…' : 'ejemplo.cl'}
            maxLength={500}
          />
          <small>{ayuda}</small>
        </label>

        <label className="campo">
          <span>Nombre y cargo de quien solicita</span>
          <input
            type="text"
            required
            value={solicitante}
            onChange={(e) => setSolicitante(e.target.value)}
            maxLength={200}
          />
        </label>

        <label className="campo">
          <span>Correo de contacto</span>
          <input
            type="email"
            required
            value={contacto}
            onChange={(e) => setContacto(e.target.value)}
            maxLength={200}
          />
          <small>Solo se usa para responder esta solicitud.</small>
        </label>

        <label className="campo">
          <span>Motivo (opcional)</span>
          <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={4} maxLength={2000} />
        </label>

        {error && <p className="conceptos-error">{error}</p>}

        <button type="submit" disabled={enviando || !clave.trim()}>
          {enviando ? 'Enviando…' : 'Enviar solicitud'}
        </button>
      </form>
    </div>
  )
}
