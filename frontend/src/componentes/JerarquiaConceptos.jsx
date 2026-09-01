import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import ListaOrdenable from './ListaOrdenable.jsx'
import { fijarTiposOcultos, reordenarConceptos, reordenarTipos } from '../servicios/conceptos-api.js'

/**
 * Árbol de dos niveles que gobierna la presentación del boletín:
 *
 *   Concepto 1            <- arrastrable entre sí (orden del boletín)
 *     Medios escritos     <- arrastrable; el orden es GLOBAL, la visibilidad es por concepto
 *     Radios
 *     ...
 *   Concepto 2
 *     ...
 *
 * El orden de los TIPOS es global por decisión de diseño: arrastrar "Radio" sobre
 * "Televisión" en cualquier concepto los reordena en todos. Lo que sí es por concepto es
 * ocultar un tipo, y por eso el interruptor del ojo vive dentro de cada concepto.
 *
 * Ese matiz se dice en pantalla, no solo acá: un admin que arrastra dentro de «CONAF» y
 * ve cambiar también «Parque Nacional» pensaría que es un error.
 */
export default function JerarquiaConceptos({ conceptos, secciones, editable, alGuardar }) {
  const [orden, setOrden] = useState(conceptos)
  const [tipos, setTipos] = useState(secciones)
  const [abierto, setAbierto] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState(null)

  const conPersistencia = async (accion, optimista, revertir) => {
    optimista()
    setGuardando(true)
    setError(null)
    try {
      await accion()
      alGuardar?.()
    } catch (err) {
      if (!err?.sesionExpirada) {
        setError(err.message)
        revertir()
      }
    } finally {
      setGuardando(false)
    }
  }

  const reordenarNivel1 = (nuevos) => {
    const previo = orden
    conPersistencia(
      () => reordenarConceptos(nuevos.map((c, i) => ({ id: String(c.id), orden: i + 1 }))),
      () => setOrden(nuevos),
      () => setOrden(previo),
    )
  }

  const reordenarNivel2 = (nuevos) => {
    const previo = tipos
    conPersistencia(
      () => reordenarTipos(nuevos.map((s, i) => ({ id: s.id, orden: i + 1 }))),
      () => setTipos(nuevos),
      () => setTipos(previo),
    )
  }

  const alternarVisibilidad = (concepto, seccionId) => {
    const ocultos = concepto.tiposOcultos ?? []
    const nuevos = ocultos.includes(seccionId)
      ? ocultos.filter((id) => id !== seccionId)
      : [...ocultos, seccionId]
    const previo = orden
    conPersistencia(
      () => fijarTiposOcultos(concepto.id, nuevos),
      () =>
        setOrden(orden.map((c) => (c.id === concepto.id ? { ...c, tiposOcultos: nuevos } : c))),
      () => setOrden(previo),
    )
  }

  if (orden.length === 0) {
    return <p className="conceptos-ayuda">Agregue un concepto de búsqueda para ordenar el boletín.</p>
  }

  return (
    <div className="jerarquia">
      <p className="conceptos-ayuda">
        Este árbol define <strong>cómo se ordena el boletín</strong>: primero por concepto,
        y dentro de cada concepto por tipo de medio. El orden se guarda al soltar y se
        aplica en la próxima corrida.
      </p>
      <p className="conceptos-ayuda">
        El orden de los <strong>tipos de medio es global</strong>: si los reordena dentro de
        un concepto, cambian en todos. Lo que sí es propio de cada concepto es{' '}
        <strong>ocultar</strong> un tipo con el ojo.
      </p>

      {error && <p className="conceptos-error">{error}</p>}

      <ListaOrdenable
        items={orden}
        onReordenar={reordenarNivel1}
        etiquetaDe={(c) => `el concepto ${c.texto}`}
        deshabilitado={!editable || guardando}
      >
        {(concepto) => (
          <div className="jerarquia-concepto">
            <button
              type="button"
              className="jerarquia-titulo"
              aria-expanded={abierto === concepto.id}
              onClick={() => setAbierto(abierto === concepto.id ? null : concepto.id)}
            >
              {concepto.texto}
              <span className="jerarquia-conteo">
                {(concepto.tiposOcultos?.length ?? 0) > 0
                  ? `${tipos.length - concepto.tiposOcultos.length}/${tipos.length} tipos`
                  : `${tipos.length} tipos`}
              </span>
            </button>

            {abierto === concepto.id && (
              <ListaOrdenable
                items={tipos}
                onReordenar={reordenarNivel2}
                etiquetaDe={(s) => `el tipo ${s.nombre}`}
                deshabilitado={!editable || guardando}
              >
                {(seccion) => {
                  const oculto = (concepto.tiposOcultos ?? []).includes(seccion.id)
                  return (
                    <span className={`jerarquia-tipo ${oculto ? 'jerarquia-tipo-oculto' : ''}`}>
                      <button
                        type="button"
                        className="conceptos-accion"
                        aria-pressed={!oculto}
                        aria-label={
                          oculto
                            ? `Mostrar ${seccion.nombre} en ${concepto.texto}`
                            : `Ocultar ${seccion.nombre} en ${concepto.texto}`
                        }
                        disabled={!editable || guardando}
                        onClick={() => alternarVisibilidad(concepto, seccion.id)}
                      >
                        {oculto ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                      {seccion.nombre}
                    </span>
                  )
                }}
              </ListaOrdenable>
            )}
          </div>
        )}
      </ListaOrdenable>
    </div>
  )
}
