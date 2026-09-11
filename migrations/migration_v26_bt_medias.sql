-- Migration v2.6: add cause_medias and solution_medias JSON columns to bons_travail
-- Allows attaching photos and videos to BT (avant/après travaux, observations terrain).

ALTER TABLE bons_travail
    ADD COLUMN IF NOT EXISTS cause_medias JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS solution_medias JSONB DEFAULT '[]'::jsonb;

UPDATE bons_travail SET cause_medias = '[]'::jsonb WHERE cause_medias IS NULL;
UPDATE bons_travail SET solution_medias = '[]'::jsonb WHERE solution_medias IS NULL;

ALTER TABLE bons_travail
    ALTER COLUMN cause_medias SET DEFAULT '[]'::jsonb,
    ALTER COLUMN solution_medias SET DEFAULT '[]'::jsonb;
