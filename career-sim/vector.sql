-- Drop old embedding if exists
ALTER TABLE Resume DROP COLUMN IF EXISTS embedding;
ALTER TABLE JobText DROP COLUMN IF EXISTS embedding;

-- Add VECTOR columns (Gemini = 768d)
ALTER TABLE Resume ADD COLUMN embedding VECTOR(768);
ALTER TABLE JobText ADD COLUMN embedding VECTOR(768);
