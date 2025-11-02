# ========= STAGE 1: deps =========
FROM node:20-alpine AS deps
WORKDIR /app

# Copiamos manifest y lock (si existe)
COPY package*.json ./

# Si hay lock -> npm ci, si no -> npm install
RUN if [ -f package-lock.json ]; then \
    npm ci --no-audit --no-fund ; \
    else \
    npm install --no-audit --no-fund ; \
    fi

# ========= STAGE 2: build =========
FROM node:20-alpine AS build
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY package*.json ./
COPY tsconfig.json ./
# Código fuente
COPY src ./src
# OpenAPI para /docs
COPY openapi.yaml ./openapi.yaml
# Si usas docs.ts compilado, colócalo bajo src/ (recomendado) para que entre al build

RUN npm run build

# ========= STAGE 3: runner =========
FROM node:20-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app

# usuario no root y wget para healthcheck
RUN addgroup -S nodejs && adduser -S nodeuser -G nodejs \
    && apk add --no-cache wget

COPY package*.json ./

# Instala solo prod deps; si no hay lockfile, fallback sin romper
RUN if [ -f package-lock.json ]; then \
    npm ci --omit=dev --no-audit --no-fund ; \
    else \
    npm install --omit=dev --no-audit --no-fund ; \
    fi

# Copiamos build y spec
COPY --from=build /app/dist ./dist
COPY --from=build /app/openapi.yaml ./openapi.yaml

# ⚠️ Cambia el puerto por servicio:
# customers-api -> 3001, orders-api -> 3002, lambda -> 3003
EXPOSE 3002

USER nodeuser
CMD ["node", "dist/server.js"]
