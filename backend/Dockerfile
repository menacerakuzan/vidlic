# Stage 1: Builder
FROM node:20-alpine AS builder

# Optimized: Avoid puppeteer chromium download during build (saves tons of time)
# and skip prisma post-install to handle it manually after copying schema
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PRISMA_SKIP_POSTINSTALL_GENERATE=true

WORKDIR /app

# Alpine dependencies for prisma and native modules (bcrypt, etc.)
RUN apk add --no-cache libc6-compat openssl python3 make g++ gcompat

COPY package*.json ./
RUN npm ci

COPY . .
RUN npx prisma generate
RUN npm run build

# Prune dev-dependencies to keep final image small
RUN npm prune --production

# Stage 2: Runner
FROM node:20-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

# Add runtime dependencies for Alpine
RUN apk add --no-cache libc6-compat openssl gcompat

# Instead of re-installing everything, copy pruned node_modules from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/prisma ./prisma/
COPY --from=builder /app/dist ./dist/
COPY --from=builder /app/src/domains/ui-presets/data ./dist/domains/ui-presets/data

EXPOSE 8000

CMD ["node", "dist/main.js"]
