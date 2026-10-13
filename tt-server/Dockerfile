FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY *.js ./
ENV NODE_ENV=production DATA_DIR=/data PORT=8787 TRUST_PROXY=1
VOLUME /data
EXPOSE 8787
# Runs as root so a mounted /data disk is writable on every host.
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:8787/health || exit 1
CMD ["node", "server.js"]
