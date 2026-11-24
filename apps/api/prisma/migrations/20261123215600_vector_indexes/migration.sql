-- Index vectoriel HNSW pour la recherche sémantique (RAG) sur les chunks de cours.
-- pgvector >= 0.5 : hnsw autorise l'insertion continue, contrairement à ivfflat
-- qui nécessite un réentraînement. distance cosinus normalisée.
CREATE INDEX IF NOT EXISTS "Chunk_embedding_hnsw_idx"
  ON "Chunk" USING hnsw ("embedding" vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Recherche plein texte française de secours (si aucun embedding disponible).
ALTER TABLE "Chunk" ADD COLUMN IF NOT EXISTS "content_tsv" tsvector
  GENERATED ALWAYS AS (to_tsvector('french', coalesce("content", ''))) STORED;
CREATE INDEX IF NOT EXISTS "Chunk_content_tsv_idx" ON "Chunk" USING gin ("content_tsv");

-- Trigrammes sur les titres pour la recherche/autocomplétion de bibliothèque.
CREATE INDEX IF NOT EXISTS "Document_title_trgm_idx" ON "Document" USING gin ("title" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Subject_name_trgm_idx" ON "Subject" USING gin ("name" gin_trgm_ops);
