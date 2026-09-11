-- Migration v2.5: add cause_medias and solution_medias JSON columns to pannes
-- Allows attaching photos and videos to the cause and solution sections of a panne.
-- Run on your PostgreSQL database before deploying v1.4.

ALTER TABLE pannes
    ADD COLUMN IF NOT EXISTS cause_medias JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS solution_medias JSONB DEFAULT '[]'::jsonb;

-- Backfill NULLs to empty arrays for consistency
UPDATE pannes SET cause_medias = '[]'::jsonb WHERE cause_medias IS NULL;
UPDATE pannes SET solution_medias = '[]'::jsonb WHERE solution_medias IS NULL;

ALTER TABLE pannes
    ALTER COLUMN cause_medias SET DEFAULT '[]'::jsonb,
    ALTER COLUMN solution_medias SET DEFAULT '[]'::jsonb;
