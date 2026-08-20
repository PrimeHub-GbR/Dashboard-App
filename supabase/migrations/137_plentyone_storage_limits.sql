-- Migration: Storage-Buckets für die PlentyONE-Migration anpassen
-- Feature: features/plentyone/overview.md

-- 1) Der Amazon-Bericht "Bericht zu allen Angeboten" ist eine Tab-getrennte .txt.
--    Der Bucket liess bisher nur text/csv und Excel zu -> der Upload scheiterte mit
--    "mime type text/plain; charset=utf-8 is not supported".
UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'text/csv',
  'text/plain',
  'text/tab-separated-values',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel'
]
WHERE id = 'workflow-uploads';

-- 2) Ein Cover-Paket mit 250 Bildern wiegt rund 70 MB (Messung: 15 Cover = 4,2 MB).
--    Das bisherige Limit von 50 MB haette jeden ZIP-Upload abgewiesen.
UPDATE storage.buckets
SET file_size_limit = 209715200   -- 200 MB
WHERE id = 'workflow-results';
