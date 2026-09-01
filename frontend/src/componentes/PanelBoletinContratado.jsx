import { useCallback, useEffect, useState } from 'react'
import { Check, Trash2 } from 'lucide-react'
import {
  eliminarBoletinContratado,
  listarBoletinesContratados,
  registrarBoletinContratado,
} from '../servicios/boletin-contratado-api.js'
import { diaEnChileISO, formatoDiaLargo } from '../utilidades/fechas.js'

/**
 * Boletín del servicio contratado: registro y CORRECCIÓN (solo admin).
 *
 * El enlace ya NO se pega a mano en el caso normal: lo registra solo el servicio
 * `boletin-correo`, que lee el buzón de Gmail cada mañana, filtra por remitente y saca el
 * enlace del cuerpo del correo. Este panel queda para dos cosas:
 *
 *   1. Corregir un día que llegó mal (o cargarlo si el correo nunca llegó).
 *   2. Ver qué hay registrado y de dónde salió (columna «origen»).
 *
 * Una corrección hecha acá queda con origen `manual` y el servicio de correo NO la pisa
 * en la revisión siguiente: un proceso periódico no puede deshacer una decisión humana.
 *
 * Lo que se guarda es el ENLACE. Ni el boletín, ni sus titulares, ni sus imágenes.
 */
export default function PanelBoletinContratado() {
  const [boletines, setBoletines] = useState(null)
  const [fecha, setFecha] = useState(diaEnChileISO)
  const [url, setUrl] = useState('')
  const [error, setError] = useState(null)
  const [aviso, setAviso] = useState(null)
  const [alerta, setAlerta] = useState(null)
  const [guardando, setGuardando] = useState(false)
  // Confirmación en dos pasos con el propio botón. Nada de window.confirm: jsdom no lo
  // implementa y el test se caería por un motivo que no es el que prueba.
  const [porBorrar, setPorBorrar] = useState(null)

  const cargar = useCallback(async () => {
    try {
      const datos = await listarBoletinesContratados()
      setBoletines(datos.boletines)
      setError(null)
    } catch (err) {
      if (err?.sesionExpirada) return
      setError(err.message)
    }
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  const registrar = async (evento) => {
    evento.preventDefault()
    setGuardando(true)
    setError(null)
    setAviso(null)
    setAlerta(null)
    try {
      const datos = await registrarBoletinContratado({ fecha, url: url.trim() })
      setUrl('')
      setAviso(`Boletín del ${formatoDiaLargo(datos.boletin.fecha)} registrado.`)
      // El aviso de identificador que retrocede NO bloquea: se muestra aparte para que
      // el admin decida si se equivocó de enlace.
      if (datos.aviso) setAlerta(datos.aviso)
      await cargar()
    } catch (err) {
      if (!err?.sesionExpirada) setError(err.message)
    } finally {
      setGuardando(false)
    }
  }

  const quitar = async (boletin) => {
    if (porBorrar !== boletin.id) {
      setPorBorrar(boletin.id)
      return
    }
    setGuardando(true)
    setError(null)
    try {
      await eliminarBoletinContratado(boletin.id)
      setPorBorrar(null)
      setAviso('Registro eliminado.')
      await cargar()
    } catch (err) {
      if (!err?.sesionExpirada) setError(err.message)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <section className="conceptos">
      <h2>Boletín de prensa contratado</h2>
      <p className="conceptos-ayuda">
        El boletín que envía cada mañana <strong>Simbiu MediaStation</strong>, el servicio
        de monitoreo contratado por CONAF, aparece arriba de todo en la portada{' '}
        <strong>solo para quienes hayan iniciado sesión</strong>. El enlace{' '}
        <strong>se registra solo</strong>: un servicio lee el correo diario y lo extrae. Use
        este formulario únicamente para <strong>corregir</strong> un día que haya quedado
        mal, o para cargarlo si el correo no llegó; lo que registre acá queda como{' '}
        <em>manual</em> y la lectura del correo ya no lo modifica. No se guarda nada del
        contenido del boletín: únicamente el enlace, que se abre en el sitio del proveedor.
      </p>

      <form className="conceptos-form" onSubmit={registrar}>
        <label className="campo">
          <span>Fecha del boletín</span>
          <input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            disabled={guardando}
            required
          />
        </label>
        <label className="campo">
          <span>Enlace</span>
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://mediastation.simbiu.es/Documents/Download/…"
            disabled={guardando}
            required
          />
        </label>
        <button type="submit" disabled={guardando || !url.trim()}>
          <Check size={14} /> Corregir
        </button>
      </form>

      {error && <p className="conceptos-error">{error}</p>}
      {aviso && <p className="conceptos-ok">{aviso}</p>}
      {alerta && <p className="conceptos-error">{alerta}</p>}

      {boletines === null ? (
        <p className="estado">Cargando registro…</p>
      ) : boletines.length === 0 ? (
        <p className="conceptos-vacio">Todavía no se ha registrado ningún boletín.</p>
      ) : (
        <ul className="conceptos-lista">
          {boletines.map((boletin) => (
            <li key={boletin.id} className="retiro-item">
              <div className="retiro-cabecera">
                <span className="retiro-fecha">{formatoDiaLargo(boletin.fecha)}</span>
                <span className="retiro-ambito">documento {boletin.documentoId}</span>
                <span className="retiro-ambito">{boletin.origen}</span>
              </div>
              {boletin.registradoPor && (
                <p className="retiro-dato">Registrado por {boletin.registradoPor}</p>
              )}
              <div className="retiro-acciones">
                <a href={boletin.url} target="_blank" rel="noopener noreferrer">
                  Abrir
                </a>
                <button type="button" disabled={guardando} onClick={() => quitar(boletin)}>
                  <Trash2 size={14} /> {porBorrar === boletin.id ? 'Confirmar' : 'Quitar'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
