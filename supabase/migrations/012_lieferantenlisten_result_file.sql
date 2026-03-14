-- Add result_file_path column for N8N-processed (filtered) output file
ALTER TABLE lieferantenlisten ADD COLUMN IF NOT EXISTS result_file_path TEXT;
