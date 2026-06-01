-- Migration 047: Distinct-Dateiliste für den Bestellungen-Ordnerbrowser
-- Feature: orders/overview
--
-- Bisher leitete die file-list API die Ordnerstruktur aus den ersten 500
-- orders-Zeilen ab (.limit(500)). Bei >500 Zeilen wurden ganze Lieferanten
-- (z.B. Blank) nie erreicht. Diese Funktion liefert pro Datei genau einen
-- Eintrag — unabhängig von der Zeilenanzahl.

CREATE OR REPLACE FUNCTION public.order_files()
RETURNS TABLE (file_id text, file_name text, supplier text, order_date date)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT DISTINCT ON (o.file_id)
    o.file_id, o.file_name, o.supplier, o.order_date
  FROM public.orders o
  WHERE o.file_id IS NOT NULL AND o.file_name IS NOT NULL
  ORDER BY o.file_id, o.order_date DESC NULLS LAST;
$$;
