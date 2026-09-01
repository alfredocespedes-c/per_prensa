# Build context: raíz del repo (necesita copiar db/schema.sql, ver
# db/schema.sql y adaptadores/archivador-postgres.js para el porqué de este layout).
FROM node:26-slim

# supercronic: binario estático para cron dentro de contenedores (loguea el
# stdout/stderr del job a su propio stdout, no necesita root/syslog/cron del SO).
ENV SUPERCRONIC_VERSION=v0.2.47
ENV SUPERCRONIC_URL=https://github.com/aptible/supercronic/releases/download/${SUPERCRONIC_VERSION}/supercronic-linux-amd64
ENV SUPERCRONIC_SHA1SUM=712d2ece75da6f6e530192a151488578153e4e96

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl ca-certificates \
    && curl -fsSLo /usr/local/bin/supercronic "$SUPERCRONIC_URL" \
    && echo "${SUPERCRONIC_SHA1SUM}  /usr/local/bin/supercronic" | sha1sum -c - \
    && chmod +x /usr/local/bin/supercronic \
    && apt-get purge -y curl \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY db/schema.sql db/schema.sql

COPY collector/package.json collector/package-lock.json* collector/
RUN cd collector && npm install --omit=dev

COPY collector/src collector/src
COPY collector/crontab collector/crontab
COPY collector/docker-entrypoint.sh collector/docker-entrypoint.sh
RUN chmod +x collector/docker-entrypoint.sh

VOLUME ["/app/collector/datos"]

ENTRYPOINT ["/app/collector/docker-entrypoint.sh"]
