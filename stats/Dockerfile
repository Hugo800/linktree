# Statistics service for hugobarthelmess.de (stats/server.mjs). No dependencies besides Node:
# SQLite comes with node:sqlite, the GeoIP reader is stats/geo.mjs. Data (SQLite, GeoIP database)
# lives in the volume /data.
FROM node:22-alpine
WORKDIR /app
COPY stats/*.mjs ./
ENV NODE_ENV=production STATS_DATA=/data PORT=8080
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 8080
CMD ["node", "--disable-warning=ExperimentalWarning", "server.mjs"]
