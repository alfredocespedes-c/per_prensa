import { Suspense, lazy } from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import BannerInstitucional from './componentes/BannerInstitucional.jsx'
import BarraNavegacion from './componentes/BarraNavegacion.jsx'
import PieInstitucional from './componentes/PieInstitucional.jsx'
import RutaProtegida from './componentes/RutaProtegida.jsx'
import { ProveedorDatos } from './contexto/ProveedorDatos.jsx'
import { ProveedorSesion } from './contexto/ProveedorSesion.jsx'
import Portada from './vistas/Portada.jsx'

// Fase 1
const Dashboard = lazy(() => import('./vistas/Dashboard.jsx'))
const Buscar = lazy(() => import('./vistas/Buscar.jsx'))
const Configuracion = lazy(() => import('./vistas/Configuracion.jsx'))

// Fase 2
const Eventos = lazy(() => import('./vistas/Eventos.jsx'))
const Estadisticas = lazy(() => import('./vistas/Estadisticas.jsx'))
const Medios = lazy(() => import('./vistas/Medios.jsx'))

// Fase 3
const Mapa = lazy(() => import('./vistas/Mapa.jsx'))
const Regiones = lazy(() => import('./vistas/Regiones.jsx'))

// Extra
const Historico = lazy(() => import('./vistas/Historico.jsx'))

// PÚBLICA: un medio que quiere que se retire su nota no tiene —ni debe necesitar— una
// cuenta en COIPO IAM para pedirlo.
const SolicitudRetiro = lazy(() => import('./vistas/SolicitudRetiro.jsx'))

function EstadoCarga() {
  return <div className="estado">Cargando…</div>
}

// Azúcar para no repetir el envoltorio en cada ruta.
const protegida = (elemento) => <RutaProtegida>{elemento}</RutaProtegida>

function App() {
  return (
    // La PORTADA es pública: se lee sin iniciar sesión. Por eso ProveedorDatos va
    // fuera de cualquier puerta — carga /api/noticias, que el backend sirve sin
    // cookie. El resto de las vistas se protege una por una con RutaProtegida, y
    // el backend responde 401 en sus endpoints igual (la puerta del frontend es
    // solo presentación: saltársela no da acceso a nada).
    <ProveedorSesion>
      <ProveedorDatos>
        {/* HashRouter enruta con lo que va después del #, que no incluye el
            subpath de Pages: NUNCA pasarle basename (deja la página en blanco).
            El callback de OAuth lo atiende el backend (/auth/callback), no este
            router: React nunca ve `code` ni `state`. */}
        <HashRouter>
          {/* El banner va sobre la barra y NO es sticky: al hacer scroll queda la
              barra verde arriba. Se renderiza en todas las rutas, así que la marca
              institucional ya no depende de que la vista sea la portada. */}
          <BannerInstitucional />
          <BarraNavegacion />
          <Suspense fallback={<EstadoCarga />}>
            <Routes>
              {/* RAÍZ PÚBLICA: el boletín se lee sin iniciar sesión. `/publica`
                  es un alias del mismo componente, para poder compartir un enlace
                  que diga explícitamente que no requiere cuenta. */}
              <Route path="/" element={<Portada />} />
              <Route path="/publica" element={<Portada />} />
              {/* Vía de retiro, pública a propósito: la exige el deber de atribución. */}
              <Route path="/retiro" element={<SolicitudRetiro />} />
              <Route path="/dashboard" element={protegida(<Dashboard />)} />
              <Route path="/buscar" element={protegida(<Buscar />)} />
              <Route path="/eventos" element={protegida(<Eventos />)} />
              <Route path="/estadisticas" element={protegida(<Estadisticas />)} />
              <Route path="/medios" element={protegida(<Medios />)} />
              <Route path="/mapa" element={protegida(<Mapa />)} />
              <Route path="/regiones" element={protegida(<Regiones />)} />
              <Route path="/historico" element={protegida(<Historico />)} />
              <Route
                path="/configuracion"
                element={
                  <RutaProtegida titulo="La configuración requiere iniciar sesión">
                    <Configuracion />
                  </RutaProtegida>
                }
              />
              {/* El backend redirige acá cuando el login falla; la pantalla de
                  error la pinta BarraNavegacion/Portada leyendo el ?error= */}
              <Route path="/acceso" element={<Navigate to="/" replace />} />
              {/* Sin este comodín, una ruta desconocida renderiza la barra sobre
                  un área vacía: la "página en blanco" literal. */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
          {/* Fuera de <Routes>: la atribución y la vía de retiro deben verse en TODAS
              las vistas, no solo en la portada. */}
          <PieInstitucional />
        </HashRouter>
      </ProveedorDatos>
    </ProveedorSesion>
  )
}

export default App
