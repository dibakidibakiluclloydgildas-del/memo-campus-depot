# =============================================================================
# API MÉMO CAMPUS — image de production
# Inclut poppler (pdftotext/pdfinfo/pdftoppm) et Tesseract avec le français :
# sans ces outils, l'OCR des PDF numérisés et des photos ne fonctionnerait pas.
# =============================================================================
FROM node:20-bookworm-slim AS builder

WORKDIR /repo

RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN npm ci --workspace @memo/shared --workspace @memo/api --include-workspace-root

COPY packages/shared packages/shared
COPY apps/api apps/api

RUN npm run build -w @memo/shared \
 && npx prisma generate --schema apps/api/prisma/schema.prisma \
 && npm run build -w @memo/api

# --- Image finale -------------------------------------------------------------
FROM node:20-bookworm-slim AS runtime

ENV NODE_ENV=production \
    PORT=4000 \
    STORAGE_DIR=/data/storage

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      poppler-utils \
      tesseract-ocr \
      tesseract-ocr-fra \
      openssl \
      curl \
 && rm -rf /var/lib/apt/lists/* \
 && useradd --create-home --uid 10001 memo \
 && mkdir -p /data/storage && chown -R memo:memo /data

WORKDIR /app

COPY --from=builder --chown=memo:memo /repo/node_modules ./node_modules
COPY --from=builder --chown=memo:memo /repo/package.json ./package.json
COPY --from=builder --chown=memo:memo /repo/packages/shared/dist ./packages/shared/dist
COPY --from=builder --chown=memo:memo /repo/packages/shared/package.json ./packages/shared/package.json
COPY --from=builder --chown=memo:memo /repo/apps/api/dist ./apps/api/dist
COPY --from=builder --chown=memo:memo /repo/apps/api/prisma ./apps/api/prisma
COPY --from=builder --chown=memo:memo /repo/apps/api/package.json ./apps/api/package.json

USER memo
WORKDIR /app/apps/api

EXPOSE 4000

# Les migrations sont appliquées puis le serveur démarre.
# `migrate deploy` est idempotent et sûr en production (aucun reset possible).
CMD ["sh", "-c", "npx prisma migrate deploy --schema prisma/schema.prisma && node dist/main.js"]
