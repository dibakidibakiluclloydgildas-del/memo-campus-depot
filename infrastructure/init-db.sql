-- Extensions nécessaires (exécutées à la création du volume de données).
-- Les migrations Prisma activent aussi ces extensions, mais les déclarer ici
-- garantit qu'elles existent même lors d'une restauration de sauvegarde.
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
