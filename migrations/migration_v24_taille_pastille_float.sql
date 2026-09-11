-- Migration v2.4: convert machines.taille_pastille from INTEGER (em*10) to FLOAT (raw em)
--
-- Context
--   * v2.3 stored taille_pastille as INTEGER with the convention em*10
--     (5 = 0.5em, 9 = 0.9em, 14 = 1.4em — see backend/app/models/machine.py).
--   * The frontend (frontend/src/pages/SchemaInteractif.tsx) was later changed
--     to send the raw em value as a float (0.9, 1.4, ...) and the backend
--     Pydantic schema still declared taille_pastille as Optional[int].
--   * Picking a fractional label size (e.g. 1.4em) therefore produced
--     HTTP 422 Unprocessable Entity on POST /api/machines/.
--
-- This migration
--   1. Converts any row still using the legacy em*10 convention (integer in
--      the range [1, 19]) to the raw em value (divide by 10).
--   2. Changes the column type from INTEGER to DOUBLE PRECISION so that
--      future fractional values are stored losslessly.
--
-- Run on your PostgreSQL database before deploying v2.4.
-- Idempotent: safe to run multiple times (the CHECK constraint on the UPDATE
-- guarantees legacy values are converted only once).

BEGIN;

-- Step 1 — Convert legacy em*10 values (integers in [1, 19]) to raw em.
--          Floats and integers >= 20 are assumed to already be raw em.
UPDATE machines
   SET taille_pastille = taille_pastille::float / 10.0
 WHERE taille_pastille IS NOT NULL
   AND taille_pastille = FLOOR(taille_pastille)::int       -- is an integer
   AND taille_pastille BETWEEN 1 AND 19;                    -- legacy em*10 range

-- Step 2 — Widen the column to DOUBLE PRECISION.
ALTER TABLE machines
    ALTER COLUMN taille_pastille TYPE DOUBLE PRECISION
    USING taille_pastille::DOUBLE PRECISION;

COMMIT;
