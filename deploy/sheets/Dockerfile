FROM node:24.19.0-bookworm-slim@sha256:a9f5f7c91a432850b2a8a7797adf5eadb6c733ceed61167806cee7ea7fbc29df

RUN npm install --global npm@12.0.2
WORKDIR /app
COPY package.json package-lock.json ./
COPY scripts/check-toolchain.mjs scripts/check-toolchain.mjs
# The existing bridge launcher uses tsx, which is a development dependency.
RUN npm ci --include=dev --no-audit --no-fund && npm cache clean --force
COPY src/lib/ src/lib/
COPY scripts/sheets-bridge.ts scripts/sheets-bridge.ts
RUN mkdir -p /data && chown node:node /data

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    TIDEPATH_SHEETS_HOST=0.0.0.0 \
    TIDEPATH_SHEETS_PORT=3220 \
    TIDEPATH_SHEETS_DATA=/data
USER node
EXPOSE 3220
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:3220/health',{signal:AbortSignal.timeout(3000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--import", "tsx", "scripts/sheets-bridge.ts"]
