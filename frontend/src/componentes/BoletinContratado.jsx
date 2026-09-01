import { useEffect, useState } from 'react'
import { ChevronDown, ChevronRight, ExternalLink } from 'lucide-react'
import { useSesion } from '../contexto/ProveedorSesion.jsx'
import { obtenerBoletinContratadoActual } from '../servicios/boletin-contratado-api.js'
import { diaEnChileISO, formatoDiaLargo } from '../utilidades/fechas.js'

const PROVEEDOR = 'Simbiu MediaStation'

/**
 * Boletín de prensa del servicio que CONAF tiene CONTRATADO, dividido por secciones.
 *
 * Va ARRIBA de todo el boletín propio porque SECOM confía más en el servicio contratado
 * que en nuestro recolector, y solo se ve con sesión iniciada — cualquier sesión, no solo
 * admin: el desglose ES el boletín, no un dato de operación.
 *
 * QUÉ SE MUESTRA DE CADA NOTICIA: titular, medio y fecha. NO el extracto, aunque el
 * boletín lo trae: dos líneas del texto del medio son reproducción de contenido ajeno y
 * la decisión fue quedarse en la referencia. Y NINGUNA IMAGEN — el documento trae 278
 * (recortes, capturas de TV, cabeceras de medios) y ninguna llega hasta acá.
 *
 * SECCIONES PLEGADAS POR DEFECTO. Un boletín trae ~270 noticias: desplegarlas todas
 * enterraría el boletín propio, que empieza justo debajo. Lo que se ve de un vistazo es
 * la forma del día —cuántas de CONAF en impresos, cuántas digitales— y se abre lo que
 * interese. Clicar un titular abre esa noticia en el sitio del proveedor, igual que
 * clicarla dentro del boletín.
 *
 * FETCH PROPIO, no useDatos(). ProveedorDatos.cargar() es un único try: si cargarNoticias()
 * lanza, nada posterior se ejecuta. Este bloque tiene que sobrevivir a que NUESTRO boletín
 * se caiga —es justo el día en que más se necesita—, y colgarlo del mismo proveedor haría
 * que esa independencia fuera declarada pero no real.
 */
export default function BoletinContratado() {
  const { fase, usuario } = useSesion()
  const [boletin, setBoletin] = useState(null)
  const [fallo, setFallo] = useState(false)
  const [abierta, setAbierta] = useState(null)

  useEffect(() => {
    // Ninguna petición si no hay sesión confirmada. En 'anonimo' el backend respondería
    // 401 igual, pero pedirlo dejaría rastro de que el bloque existe; en 'verificando'
    // provocaría un parpadeo encima de los filtros.
    if (fase !== 'autenticado') {
      setBoletin(null)
      setFallo(false)
      return undefined
    }
    let cancelado = false
    obtenerBoletinContratadoActual()
      .then((datos) => {
        if (!cancelado) {
          setBoletin(datos)
          setFallo(false)
        }
      })
      .catch((err) => {
        // Una sesión expirada la gestiona ProveedorSesion por el evento global; acá no
        // se pinta nada, para no duplicar el mensaje.
        if (!cancelado && !err?.sesionExpirada) setFallo(true)
      })
    return () => {
      cancelado = true
    }
  }, [fase])

  if (fase !== 'autenticado') return null

  const esAdmin = Boolean(usuario?.esAdmin)

  if (fallo) {
    // Este bloque no puede, bajo ninguna circunstancia, hacer que la portada parezca
    // caída: eso es el error nº 1 declarado inaceptable por SECOM. Quien no puede actuar
    // sobre el problema tampoco necesita enterarse.
    if (!esAdmin) return null
    return (
      <p className="boletin-contratado-aviso">
        No se pudo consultar el boletín del servicio contratado.
      </p>
    )
  }

  if (!boletin) {
    if (!esAdmin) return null
    return (
      <p className="boletin-contratado-aviso">
        Todavía no se ha registrado ningún boletín de {PROVEEDOR}.{' '}
        {/* <a> y NO <Link>: Portada.test.jsx no envuelve en MemoryRouter, y un <Link>
            nuevo en la portada rompería esa suite entera. Con HashRouter navega igual. */}
        <a className="boletin-contratado-accion" href="#/configuracion">
          Revisar en Configuración
        </a>
      </p>
    )
  }

  // Comparación de STRINGS: convertir 'YYYY-MM-DD' a Date lo retrocedería un día en
  // Chile. Ver utilidades/fechas.js::diaEnChileISO.
  const esDeHoy = boletin.fecha === diaEnChileISO()
  const secciones = boletin.secciones ?? []
  const total = secciones.reduce((suma, s) => suma + s.noticias.length, 0)

  return (
    <section
      className={`boletin-contratado${esDeHoy ? '' : ' boletin-contratado-desactualizado'}`}
      aria-label="Boletín del servicio contratado"
    >
      <p className="boletin-contratado-rotulo">Boletín de prensa · servicio contratado</p>
      {/* La fecha va SIEMPRE, y nunca se rotula como "de hoy" si no lo es: presentar el
          de ayer como el del día sería peor que no mostrar nada. */}
      <p className="boletin-contratado-fecha">
        {formatoDiaLargo(boletin.fecha)}
        {total > 0 && <span className="boletin-contratado-total">{total} noticias</span>}
      </p>

      {!esDeHoy && (
        <p className="boletin-contratado-nota">
          Es el último disponible. <strong>Todavía no se ha registrado el de hoy.</strong>
          {esAdmin && (
            <>
              {' '}
              <a className="boletin-contratado-accion" href="#/configuracion">
                Revisar o corregir
              </a>
            </>
          )}
        </p>
      )}

      {secciones.length > 0 ? (
        <ul className="boletin-contratado-secciones">
          {secciones.map((seccion) => {
            const clave = `${seccion.concepto}|${seccion.tipo}`
            const desplegada = abierta === clave
            return (
              <li key={clave} className="boletin-contratado-seccion">
                <button
                  type="button"
                  className="boletin-contratado-cabecera"
                  aria-expanded={desplegada}
                  onClick={() => setAbierta(desplegada ? null : clave)}
                >
                  {desplegada ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                  <span className="boletin-contratado-concepto">{seccion.concepto}</span>
                  <span className="boletin-contratado-tipo">{seccion.tipo}</span>
                  <span className="boletin-contratado-cuenta">{seccion.noticias.length}</span>
                </button>

                {desplegada && (
                  <ul className="boletin-contratado-noticias">
                    {seccion.noticias.map((noticia, i) => (
                      <li key={`${noticia.url}-${i}`} className="boletin-contratado-noticia">
                        {/* Abre la noticia en el sitio del proveedor, exactamente igual
                            que clicarla dentro del boletín. Nada se aloja acá. */}
                        <a href={noticia.url} target="_blank" rel="noopener noreferrer">
                          {noticia.titular}
                        </a>
                        <span className="boletin-contratado-atribucion">
                          {noticia.medio}
                          {noticia.fecha && <> · {formatoDiaLargo(noticia.fecha)}</>}
                          {noticia.pagina && <> · pág. {noticia.pagina}</>}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="boletin-contratado-nota">
          El desglose de este boletín todavía no se ha procesado.
        </p>
      )}

      <p className="boletin-contratado-nota">
        Lo elabora {PROVEEDOR}, el servicio de monitoreo contratado por CONAF. Cada noticia
        se abre en el sitio del proveedor.{' '}
        <a
          className="boletin-contratado-enlace-completo"
          href={boletin.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          Abrir el boletín completo <ExternalLink size={13} aria-hidden="true" />
        </a>
      </p>
    </section>
  )
}
