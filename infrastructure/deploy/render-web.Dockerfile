# =============================================================================
# Web MÉMO CAMPUS — image pour Render / Railway (contexte de build = racine)
# =============================================================================
FROM node:20-bookworm-slim AS builder

WORKDIR /repo

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
RUN npm ci --workspace @memo/shared --workspace @memo/web --include-workspace-root

COPY packages/shared packages/shared
COPY apps/web apps/web

# Variables de build (Next.js fige certaines valeurs à la compilation)
ARG API_INTERNAL_URL=http://127.0.0.1:4000
ENV API_INTERNAL_URL=$API_INTERNAL_URL
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build -w @memo/shared && npm run build -w @memo/web

# --- Image finale -------------------------------------------------------------
FROM node:20-bookworm-slim AS runtime

ENV NODE_ENV=production \
    PORT=3000 \
    NEXT_TELEMETRY_DISABLED=1

RUN apt-get update && apt-get install -y --no-install-recommends curl \
 && rm -rf /var/lib/apt/lists/* \
 && useradd --create-home --uid 10002 memo

WORKDIR /app

COPY --from=builder --chown=memo:memo /repo/apps/web/.next ./.next
COPY --from=builder --chown=memo:memo /repo/apps/web/public ./public
COPY --from=builder --chown=memo:memo /repo/apps/web/package.json ./package.json
COPY --from=builder --chown=memo:memo /repo/apps/web/next.config.ts ./next.config.ts
COPY --from=builder --chown=memo:memo /repo/node_modules ./node_modules

USER memo
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3000/ > /dev/null || exit 1

CMD ["npx", "next", "start", "-H", "0.0.0.0", "-p", "3000"]
