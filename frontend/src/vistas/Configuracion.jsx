import ControlTema from '../componentes/ControlTema.jsx'
import PanelBoletinContratado from '../componentes/PanelBoletinContratado.jsx'
import PanelConceptos from '../componentes/PanelConceptos.jsx'
import PanelRetiros from '../componentes/PanelRetiros.jsx'
import { useSesion } from '../contexto/ProveedorSesion.jsx'

export default function Configuracion() {
  const { usuario } = useSesion()

  return (
    <div style={{ padding: 'var(--pad-vista)', maxWidth: '1080px', margin: '0 auto' }}>
      <h1>Configuración</h1>

      <section style={{ marginTop: '2rem' }}>
        <h2>Tema</h2>
        {/* El MISMO componente que la barra de navegación, no una copia: cuando el
            control se movió a la barra para que lo alcanzara el público, mantener acá una
            segunda implementación garantizaba que se desincronizaran. */}
        <div style={{ marginTop: '1rem' }}>
          <ControlTema />
        </div>
      </section>

      <PanelConceptos />

      {/* La bandeja solo la ve el admin: el endpoint responde 403 a los demás y
          renderizarla igual dejaría un panel permanentemente en error. */}
      {usuario?.esAdmin && <PanelRetiros />}

      {/* Mismo criterio: el registro del boletín contratado es escritura de admin. */}
      {usuario?.esAdmin && <PanelBoletinContratado />}
    </div>
  )
}
