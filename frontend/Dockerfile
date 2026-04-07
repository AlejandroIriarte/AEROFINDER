# =============================================================================
# AEROFINDER — Imagen del Frontend (Next.js 14 App Router)
# Multi-stage: deps → builder → runner
#
# Requiere next.config.js con output: 'standalone'
# Código creado en FE-1
# =============================================================================

# ── Etapa 1: instalación de dependencias ─────────────────────────────────────
FROM node:20-alpine AS deps

RUN apk add --no-cache libc6-compat

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --only=production


# ── Etapa 2: build de producción ─────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Instalar todas las dependencias (incluyendo devDependencies para el build)
COPY package.json package-lock.json* ./
RUN npm ci

# Copiar código fuente
COPY . .

# Variables públicas necesarias en build time (se exponen en el bundle JS)
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_WS_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL

# Build con output standalone para imagen mínima
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build


# ── Etapa 3: imagen de runtime mínima ────────────────────────────────────────
FROM node:20-alpine AS runner

RUN apk add --no-cache curl

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Usuario sin privilegios
RUN addgroup -S aerofinder && adduser -S nextjs -G aerofinder

# Copiar solo lo necesario del build standalone
COPY --from=builder --chown=nextjs:aerofinder /app/.next/standalone ./
COPY --from=builder --chown=nextjs:aerofinder /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:aerofinder /app/public ./public

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -f http://localhost:3000 || exit 1

CMD ["node", "server.js"]
