import { Link, useLocation } from 'react-router-dom'
import { Home, BarChart3, Search, Settings, Zap, TrendingUp, Building2, Map, MapPin, Clock, LogOut, LogIn } from 'lucide-react'
import ControlTema from './ControlTema.jsx'
import { useSesion } from '../contexto/ProveedorSesion.jsx'
import './BarraNavegacion.css'

export default function BarraNavegacion() {
  const location = useLocation()
  const ruta = location.pathname
  const { fase, usuario, cerrarSesion, iniciarSesion } = useSesion()
  const anonimo = fase === 'anonimo' || fase === 'noConfigurada' || fase === 'error'

  const enlaces = [
    { ruta: '/', etiqueta: 'Inicio', icono: Home },
    { ruta: '/dashboard', etiqueta: 'Dashboard', icono: BarChart3 },
    { ruta: '/buscar', etiqueta: 'Buscar', icono: Search },
    { ruta: '/eventos', etiqueta: 'Eventos', icono: Zap },
    { ruta: '/estadisticas', etiqueta: 'Estadísticas', icono: TrendingUp },
    { ruta: '/medios', etiqueta: 'Medios', icono: Building2 },
    { ruta: '/mapa', etiqueta: 'Mapa', icono: Map },
    { ruta: '/regiones', etiqueta: 'Regiones', icono: MapPin },
    { ruta: '/historico', etiqueta: 'Histórico', icono: Clock },
  ]
  // Configuración va FUERA de la lista desplazable, junto a la identidad: con 10
  // enlaces la barra desborda y el último queda fuera de pantalla — y es
  // justamente donde vive la administración de conceptos.

  return (
    <nav className="barra-navegacion">
      <div className="barra-contenido">
        {/* Sin marca de texto: el banner institucional que va encima ya identifica la
            app, y estos ~70 px se los queda la lista de enlaces, que con 9 entradas
            ya hacía scroll horizontal en pantallas medianas. El enlace al inicio lo
            lleva el propio banner. */}
        <ul className="barra-enlaces">
          {enlaces.map(({ ruta: rutaEnlace, etiqueta, icono: Icono }) => (
            <li key={rutaEnlace}>
              <Link
                to={rutaEnlace}
                className={`barra-enlace ${ruta === rutaEnlace ? 'activo' : ''}`}
                title={etiqueta}
              >
                <Icono size={18} />
                <span>{etiqueta}</span>
              </Link>
            </li>
          ))}
        </ul>
        <div className="barra-sesion">
          {/* Antes del bloque de sesión y SIN condicionar a `usuario`: el tema es una
              preferencia de accesibilidad, no una función del panel. Estaba enterrado en
              /#/configuracion, que exige sesión, así que quien lee la portada pública no
              tenía forma de cambiarlo. */}
          <ControlTema />
          {/* Solo con sesión: para un anónimo no significa nada, y el botón de
              ingreso ocupa su lugar. */}
          {usuario && (
            <Link
              to="/configuracion"
              className={`barra-sesion-config ${ruta === '/configuracion' ? 'activo' : ''}`}
              title={usuario.esAdmin ? 'Configuración y conceptos' : 'Configuración'}
            >
              <Settings size={16} />
              <span>Configuración</span>
            </Link>
          )}
          {usuario && (
            <>
              <span className="barra-sesion-usuario" title={usuario.email}>{usuario.usuario}</span>
              {/* El rol es informativo. Quien manda es el backend: aunque alguien
                  editara esto, las escrituras siguen exigiendo rol admin allá. */}
              {usuario.esAdmin && <span className="barra-sesion-rol">admin</span>}
              <button type="button" className="barra-sesion-salir" onClick={cerrarSesion} title="Cerrar sesión">
                <LogOut size={14} />
              </button>
            </>
          )}
          {anonimo && (
            // La portada es pública, así que un anónimo no ve una puerta sino una
            // invitación: puede leer el boletín y entrar solo si necesita el resto.
            <button
              type="button"
              className="barra-sesion-config"
              onClick={() => iniciarSesion('/')}
              title="Ingresar con tu cuenta de CONAF"
            >
              <LogIn size={16} />
              <span>Iniciar sesión</span>
            </button>
          )}
        </div>
      </div>
    </nav>
  )
}
