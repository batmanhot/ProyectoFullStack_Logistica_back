# ── Etapa 1: build ────────────────────────────────────────────────
# Compila TypeScript y genera el cliente de Prisma. Incluye python3/
# make/g++ porque bcrypt tiene un binding nativo que a veces necesita
# compilarse si no hay un binario prebuilto para esta plataforma exacta.
FROM node:22-bookworm-slim AS builder
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

# La imagen base trae npm 10.x, que valida el lockfile distinto (y más
# estricto) que el npm 11.x usado para generarlo localmente — con 10.x
# `npm ci` rechaza este lockfile con "Missing ... from lock file" aunque
# el árbol de dependencias sea válido. Se actualiza para que valide igual
# que en desarrollo.
RUN npm install -g npm@11

# Evita que Puppeteer descargue ~300MB de Chromium bundleado durante el
# build — en runtime se usa el Chromium del sistema (ver etapa 2).
ENV PUPPETEER_SKIP_DOWNLOAD=true

COPY package.json package-lock.json ./
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

COPY tsconfig*.json nest-cli.json ./
COPY src ./src
RUN npm run build

# ── Etapa 2: runtime ──────────────────────────────────────────────
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# `chromium` de Debian trae resueltas todas sus dependencias de sistema
# (libnss3, libgtk, etc.) vía apt — más simple y liviano que listarlas
# una por una para el Chromium bundleado de Puppeteer.
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY package.json ./

EXPOSE 3000
CMD ["node", "dist/main"]
