#!/bin/sh
# Corre el collector una vez de inmediato (para no quedar vacío hasta 59 minutos
# tras un despliegue) y luego deja supercronic a cargo del cron horario (ver crontab).
set -e

echo "[entrypoint] corrida inicial del collector..."
# timeout -s KILL: la corrida inicial NO debe poder bloquear el arranque de
# supercronic. `exec supercronic` (abajo) solo se alcanza cuando esta línea retorna;
# si el collector se colgara (p. ej. un sitio patológico), sin este tope el cron
# horario nunca arrancaría. SIGKILL porque un cuelgue síncrono ignora SIGTERM.
cd /app/collector && timeout -s KILL 50m node src/main.js \
  --salida /app/collector/datos/noticias.json \
  --historico /app/collector/datos/historico.json \
  || echo "[entrypoint] la corrida inicial falló o excedió 50m; supercronic seguirá intentando cada hora"

echo "[entrypoint] iniciando supercronic con /app/collector/crontab"
exec supercronic /app/collector/crontab
