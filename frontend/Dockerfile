# Build context: raíz del repo (consistente con collector/Dockerfile y
# backend/Dockerfile, aunque este solo necesita frontend/).
FROM node:26-slim AS build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm install
COPY frontend/ ./
# Autoalojado en la raíz, detrás del reverse proxy ya existente en el servidor
# (ver vite.config.js). Override disponible si algún despliegue necesita un subpath.
ARG BASE_PATH=/
ENV BASE_PATH=${BASE_PATH}
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/frontend/dist /usr/share/nginx/html
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 8000
