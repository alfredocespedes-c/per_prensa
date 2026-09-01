import { useCallback, useEffect, useState } from 'react'
import { Plus, Trash2, EyeOff, Search } from 'lucide-react'
import JerarquiaConceptos from './JerarquiaConceptos.jsx'
import {
  actualizarConcepto,
  crearConcepto,
  eliminarConcepto,
  listarConceptos,
  obtenerImpacto,
} from '../servicios/conceptos-api.js'

// hour12:false — en Chile el horario se lee en 24 h; sin esto es_CL rinde "01:00 p. m."
const HORA_CHILE = {
  timeZone: 'America/Santiago',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
}

function formatearHoraChile(iso) {
  try {
    return new Date(iso).toLocaleTimeString('es-CL', HORA_CHILE)
  } catch {
    return '—'
  }
}

/** ¿Estamos entre las 07:00 y las 08:00 de Chile? SECOM revisa el boletín a las 08:00. */
function esHoraCritica() {
  const hora = Number(
    new Date().toLocaleString('es-CL', { timeZone: 'America/Santiago', hour: '2-digit', hour12: false }),
  )
  return hora === 7
}

export default function PanelConceptos() {
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState(null)
  const [aviso, setAviso] = useState(null)
  const [texto, setTexto] = useState('')
  const [tipo, setTipo] = useState('incluir')
  const [guardando, setGuardando] = useState(false)
  const [impacto, setImpacto] = useState(null)
  const [conceptoInspeccionado, setConceptoInspeccionado] = useState(null)

  const cargar = useCallback(async () => {
    try {
      setDatos(await listarConceptos())
      setError(null)
    } catch (err) {
      if (err?.sesionExpirada) return
      setError(err.message)
    }
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  const editable = datos?.editable === true

  const conDatos = async (accion, mensajeOk) => {
    setGuardando(true)
    setError(null)
    setAviso(null)
    try {
      await accion()
      await cargar()
      if (mensajeOk) setAviso(mensajeOk)
    } catch (err) {
      if (!err?.sesionExpirada) setError(err.message)
    } finally {
      setGuardando(false)
    }
  }

  const agregar = (evento) => {
    evento.preventDefault()
    if (!texto.trim()) return
    conDatos(async () => {
      await crearConcepto(texto.trim(), tipo)
      setTexto('')
    }, `«${texto.trim()}» agregado. Se aplicará en la próxima corrida.`)
  }

  const verImpacto = async (concepto) => {
    if (conceptoInspeccionado === concepto) {
      setConceptoInspeccionado(null)
      setImpacto(null)
      return
    }
    try {
      setConceptoInspeccionado(concepto)
      setImpacto(await obtenerImpacto(concepto))
    } catch (err) {
      if (!err?.sesionExpirada) setError(err.message)
    }
  }

  if (error && !datos) return <p className="estado estado-error">{error}</p>
  if (!datos) return <p className="estado">Cargando conceptos…</p>

  const incluidos = datos.conceptos.filter((c) => c.tipo === 'incluir')
  const excluidos = datos.conceptos.filter((c) => c.tipo === 'excluir')
  const cuentaOcultas = (concepto) =>
    impacto?.porConcepto?.find((p) => p.concepto === concepto)?.ocultas

  const listaDe = (conceptos, esExclusion) => (
    <ul className="conceptos-lista">
      {conceptos.length === 0 && <li className="conceptos-vacio">Ninguno.</li>}
      {conceptos.map((concepto) => (
        <li key={concepto.id} className="conceptos-item">
          <span className="conceptos-texto">{concepto.texto}</span>
          {esExclusion && (
            <button
              type="button"
              className="conceptos-accion"
              title="Ver qué noticias oculta"
              onClick={() => verImpacto(concepto.texto)}
              disabled={!editable}
            >
              <Search size={14} />
              {cuentaOcultas(concepto.texto) !== undefined && (
                <span className="conceptos-cuenta">{cuentaOcultas(concepto.texto)}</span>
              )}
            </button>
          )}
          {editable && (
            <button
              type="button"
              className="conceptos-accion conceptos-accion-quitar"
              title="Quitar"
              disabled={guardando}
              onClick={() =>
                conDatos(
                  () => eliminarConcepto(concepto.id),
                  `«${concepto.texto}» quitado. Se aplicará en la próxima corrida.`,
                )
              }
            >
              <Trash2 size={14} />
            </button>
          )}
          {editable && (
            <button
              type="button"
              className="conceptos-accion"
              title={esExclusion ? 'Mover a búsqueda' : 'Mover a exclusión'}
              disabled={guardando}
              onClick={() =>
                conDatos(() =>
                  actualizarConcepto(concepto.id, { tipo: esExclusion ? 'incluir' : 'excluir' }),
                )
              }
            >
              <EyeOff size={14} />
            </button>
          )}
        </li>
      ))}
    </ul>
  )

  return (
    <section className="conceptos">
      <h2>Conceptos</h2>
      <p className="conceptos-ayuda">
        Un concepto puede ser una palabra o una frase. La detección no distingue mayúsculas ni
        tildes y respeta los límites de palabra: «CONAF» encuentra «Conaf» y «(CONAF)», pero no
        «CONAFE».
      </p>

      {!editable && (
        <p className="conceptos-ayuda conceptos-solo-lectura">
          Estás viendo esta lista en modo consulta. Para editarla necesitas el rol{' '}
          <strong>admin</strong> en COIPO IAM.
        </p>
      )}

      <p className="conceptos-ayuda">
        Los cambios <strong>no se aplican de inmediato</strong>: el recolector corre cada hora en
        punto. Lo que edites ahora entrará en la corrida de las{' '}
        <strong>{formatearHoraChile(datos.proximaAplicacion)}</strong> y el boletín lo reflejará
        poco después.
      </p>

      {esHoraCritica() && (
        <p className="conceptos-aviso-critico">
          SECOM revisa el boletín a las 08:00. Este cambio recién se aplicará en la corrida de las
          08:00, así que podría no alcanzar a verse reflejado.
        </p>
      )}

      {editable && (
        <form className="conceptos-form" onSubmit={agregar}>
          <input
            type="text"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Ej.: Corporación Nacional Forestal"
            maxLength={80}
            aria-label="Texto del concepto"
          />
          <select value={tipo} onChange={(e) => setTipo(e.target.value)} aria-label="Tipo de concepto">
            <option value="incluir">Buscar</option>
            <option value="excluir">Excluir</option>
          </select>
          <button type="submit" disabled={guardando || !texto.trim()}>
            <Plus size={16} /> Agregar
          </button>
        </form>
      )}

      {error && <p className="conceptos-error">{error}</p>}
      {aviso && <p className="conceptos-ok">{aviso}</p>}

      {/* Nivel 1 + nivel 2: cómo se ORDENA el boletín. Va antes de las listas de
          administración porque es lo que SECOM ve reflejado en la portada. */}
      <h3>Orden del boletín</h3>
      <JerarquiaConceptos
        key={incluidos.map((c) => `${c.id}:${c.orden}`).join('|')}
        conceptos={incluidos}
        secciones={datos.secciones ?? []}
        editable={editable}
        alGuardar={cargar}
      />

      <div className="conceptos-columnas">
        <div>
          <h3>Conceptos de búsqueda ({incluidos.length})</h3>
          <p className="conceptos-ayuda">
            Quitar uno detiene la recolección <strong>futura</strong>; las noticias ya publicadas
            siguen en el boletín. Para ocultarlas hay que agregarlo como concepto de exclusión.
          </p>
          {listaDe(incluidos, false)}
        </div>

        <div>
          <h3>Conceptos de exclusión ({excluidos.length})</h3>
          <p className="conceptos-ayuda">
            Excluir <strong>no borra noticias: las oculta</strong>. Si más adelante quitas el
            concepto, vuelven a aparecer en la siguiente corrida.
          </p>
          {listaDe(excluidos, true)}
        </div>
      </div>

      {conceptoInspeccionado && impacto && (
        <div className="conceptos-impacto">
          <h3>
            «{conceptoInspeccionado}» oculta {cuentaOcultas(conceptoInspeccionado) ?? 0} noticia(s)
          </h3>
          {impacto.titulares.length === 0 ? (
            <p className="conceptos-ayuda">
              Ninguna noticia de la ventana actual la menciona. Si esperabas lo contrario, revisa
              cómo está escrito el concepto.
            </p>
          ) : (
            <ul className="conceptos-titulares">
              {impacto.titulares.map((noticia) => (
                <li key={noticia.id}>
                  <a href={noticia.url} target="_blank" rel="noreferrer noopener">
                    {noticia.titular}
                  </a>
                  <span className="conceptos-medio">{noticia.medioNombre}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}
