Quiero mejorar una aplicación web existente.

IMPORTANTE

La aplicación YA EXISTE.

No quiero rehacerla.

No quiero cambiar la vista principal.

La página principal (/) ya funciona y debe mantenerse prácticamente igual.

Toda nueva funcionalidad debe agregarse mediante nuevas vistas, nuevos componentes y nuevos módulos.

La filosofía debe ser:

"La página principal continúa siendo el listado de noticias."

Toda la inteligencia adicional debe vivir en otras páginas.

-----------------------------------------------------

TECNOLOGÍA

La aplicación utiliza:

- Node.js
- HTML
- CSS
- JavaScript

Los datos se generan mediante GitHub Actions.

No existe backend.

No existen API REST.

No existen bases de datos.

Toda la información proviene de archivos JSON generados automáticamente.

No utilizar API Keys.

No utilizar servicios cloud.

Todo debe funcionar localmente.

-----------------------------------------------------

LIBRERÍAS RECOMENDADAS

Utilizar cuando corresponda:

Visualización

- Chart.js
- Leaflet
- ApexCharts (si mejora la experiencia)
- DataTables (solo donde aporte valor)

Búsqueda

- Fuse.js
- MiniSearch

NLP

- compromise
- natural
- node-nlp
- sentiment
- vader-sentiment

Extracción

- Mozilla Readability
- cheerio

Fechas

- dayjs

Utilidades

- lodash

Animaciones

- Motion One

Iconos

- Lucide Icons

Diseño

- CSS moderno
- Grid
- Flexbox
- Variables CSS
- Design Tokens

-----------------------------------------------------

ARQUITECTURA

Separar claramente:

/views

/components

/services

/utils

/styles

/data

No generar archivos gigantes.

Cada módulo debe tener una responsabilidad única.

-----------------------------------------------------

VISTA EXISTENTE

/

NO modificar significativamente.

Debe continuar mostrando:

- listado de noticias
- búsqueda
- filtros actuales

Solo permitir pequeñas mejoras visuales.

-----------------------------------------------------

NUEVAS VISTAS

/dashboard

Panel ejecutivo.

Debe mostrar:

KPIs

Noticias hoy

Noticias semana

Noticias mes

Noticias críticas

Noticias negativas

Noticias positivas

Eventos detectados

Medios monitoreados

Gráficos

Noticias por día

Noticias por región

Noticias por medio

Noticias por categoría

Noticias por sentimiento

Top palabras

Top organizaciones

Top personas

Top regiones

-----------------------------------------------------

/eventos

La aplicación debe detectar noticias similares.

Agruparlas automáticamente.

Mostrar una tarjeta por evento.

Ejemplo

Incendio Parque Nacional Conguillío

23 noticias

15 medios

Primera noticia

Última actualización

Impacto

Sentimiento promedio

Al entrar:

Timeline

Noticias relacionadas

Cobertura por medio

Mapa

-----------------------------------------------------

/mapa

Utilizar Leaflet.

Mostrar:

Noticias georreferenciadas

Regiones

Parques

Reservas

Comunas

Filtros laterales.

-----------------------------------------------------

/estadisticas

Panel completamente analítico.

Mostrar

Cantidad de noticias

Cantidad de medios

Cantidad de eventos

Promedio de palabras

Promedio tiempo lectura

Distribución por categorías

Distribución por sentimiento

Top medios

Top categorías

Top regiones

Top personas

Top instituciones

-----------------------------------------------------

/medios

Un listado de medios.

Cada medio tendrá su ficha.

Mostrar:

Cantidad noticias

Sentimiento promedio

Temas frecuentes

Cobertura histórica

Palabras frecuentes

Últimas noticias

-----------------------------------------------------

/regiones

Cada región tendrá una ficha.

Mostrar

Noticias

Eventos

Mapa

Instituciones

Parques

Reservas

Categorías frecuentes

-----------------------------------------------------

/buscar

Motor de búsqueda avanzado.

Debe buscar sobre:

Título

Contenido

Resumen

Personas

Organizaciones

Lugares

Categorías

Palabras clave

Mostrar filtros dinámicos.

-----------------------------------------------------

/configuracion

Preferencias del usuario.

Modo oscuro

Modo claro

Idioma

Cantidad noticias

Orden

Preferencias visuales

-----------------------------------------------------

ENRIQUECIMIENTO

Durante GitHub Actions enriquecer cada noticia.

Agregar:

contenido

tiempoLectura

sentimiento

polaridad

score

keywords

categorias

personas

organizaciones

lugares

regiones

comunas

parques

riesgo

prioridad

importancia

tipo

imagenes

autor

fechaReal

cantidadPalabras

cantidadParrafos

eventId

duplicados

similaridad

-----------------------------------------------------

DISEÑO

Inspirarse en:

Linear

Notion

GitHub

Vercel

Google News

Evitar dashboards recargados.

Mucho espacio.

Pocas líneas.

Tarjetas limpias.

Animaciones discretas.

Responsive.

-----------------------------------------------------

OBJETIVO

Antes de escribir código, analizar toda la aplicación existente para reutilizar componentes, mantener coherencia visual y evitar duplicar lógica.

No crear funcionalidades redundantes. Cada nueva vista debe aportar un objetivo claro y complementar la página principal, que seguirá siendo el punto de entrada para consultar las noticias recientes.