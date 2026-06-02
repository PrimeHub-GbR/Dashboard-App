-- Migration 051: Aufgaben in der Mitarbeiter-App
--
-- Erweitert das bestehende Aufgaben-System (Migration 023) um:
--   1. tasks.completed_by  -> wer die Aufgabe abgehakt hat (zusaetzlich zu completed_at)
--   2. task_comments       -> Kommentar-Thread mit optionalem Bild-Anhang
--   3. Storage-Bucket 'task-attachments' fuer Kommentar-Bilder
--   4. Verschaerfte RLS: Mitarbeitende sehen nur ihre zugewiesenen Aufgaben,
--      Admin/Manager (is_admin_or_manager) sehen alles und duerfen schreiben.
--   5. RPCs fuer Mitarbeiter-Aktionen ohne breite Schreibrechte:
--      set_my_task_status (abhaken / in Bearbeitung / wieder oeffnen).
--
-- WICHTIG: Das Web-Dashboard greift ueber den Service-Role-Key zu
-- (createSupabaseServiceClient) und umgeht RLS -> bleibt unveraendert.
-- Helper-Funktionen is_admin_or_manager() + current_employee_id() aus Mig. 041.

-- =========================================================================
-- 1. tasks.completed_by
-- =========================================================================
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS completed_by UUID REFERENCES public.employees(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.tasks.completed_by IS
  'employee_id desjenigen, der die Aufgabe als erledigt markiert hat (bei Mehrfach-Zuweisung: wer zuerst abgehakt hat).';

-- =========================================================================
-- 2. task_comments
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.task_comments (
  id                 UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id            UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  author_employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  body               TEXT,
  image_path         TEXT,            -- Pfad im Storage-Bucket 'task-attachments'
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT task_comments_not_empty CHECK (
    (body IS NOT NULL AND length(trim(body)) > 0) OR image_path IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS task_comments_task_idx ON public.task_comments(task_id);

ALTER TABLE public.task_comments ENABLE ROW LEVEL SECURITY;

-- =========================================================================
-- 3. Helper: ist die aktuelle Person dieser Aufgabe zugewiesen?
--    SECURITY DEFINER -> umgeht RLS auf task_assignees, vermeidet
--    Policy-Rekursion und ist performant.
-- =========================================================================
CREATE OR REPLACE FUNCTION public.is_assigned_to_task(p_task_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.task_assignees
    WHERE task_id = p_task_id
      AND employee_id = public.current_employee_id()
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_assigned_to_task(UUID) TO authenticated;

COMMENT ON FUNCTION public.is_assigned_to_task(UUID) IS
  'TRUE wenn die aktuell eingeloggte Person (current_employee_id) der Aufgabe zugewiesen ist.';

-- =========================================================================
-- 4. RLS tasks  (alte Allow-All-Policy ersetzen)
-- =========================================================================
DROP POLICY IF EXISTS "authenticated full access tasks" ON public.tasks;

-- Lesen: Chef alles, Mitarbeiter nur eigene zugewiesene Aufgaben
CREATE POLICY "tasks_select_role_or_assigned" ON public.tasks
FOR SELECT TO authenticated
USING (
  public.is_admin_or_manager()
  OR public.is_assigned_to_task(id)
);

-- Schreiben (anlegen/bearbeiten/zuweisen/loeschen): nur Chef.
-- Mitarbeiter-Statuswechsel laeuft ueber RPC set_my_task_status.
CREATE POLICY "tasks_insert_role" ON public.tasks
FOR INSERT TO authenticated
WITH CHECK (public.is_admin_or_manager());

CREATE POLICY "tasks_update_role" ON public.tasks
FOR UPDATE TO authenticated
USING (public.is_admin_or_manager())
WITH CHECK (public.is_admin_or_manager());

CREATE POLICY "tasks_delete_role" ON public.tasks
FOR DELETE TO authenticated
USING (public.is_admin_or_manager());

-- =========================================================================
-- 5. RLS task_assignees  (alte Allow-All-Policy ersetzen)
-- =========================================================================
DROP POLICY IF EXISTS "authenticated full access task_assignees" ON public.task_assignees;

-- Lesen: Chef alles. Mitarbeiter sieht ALLE Zuweisungs-Zeilen einer Aufgabe,
-- die ihm selbst zugewiesen ist -> bei Mehrfach-Delegation sichtbar, wem es
-- sonst noch zugewiesen ist ("egal wer es macht").
CREATE POLICY "task_assignees_select_role_or_self" ON public.task_assignees
FOR SELECT TO authenticated
USING (
  public.is_admin_or_manager()
  OR public.is_assigned_to_task(task_id)
);

-- Schreiben: nur Chef (Zuweisung erfolgt durch den Chef)
CREATE POLICY "task_assignees_write_role" ON public.task_assignees
FOR ALL TO authenticated
USING (public.is_admin_or_manager())
WITH CHECK (public.is_admin_or_manager());

-- =========================================================================
-- 6. RLS task_comments
-- =========================================================================
-- Lesen: wer die Aufgabe sehen darf, sieht auch ihre Kommentare
CREATE POLICY "task_comments_select" ON public.task_comments
FOR SELECT TO authenticated
USING (
  public.is_admin_or_manager()
  OR public.is_assigned_to_task(task_id)
);

-- Schreiben: man kommentiert im eigenen Namen und nur auf sichtbaren Aufgaben
CREATE POLICY "task_comments_insert" ON public.task_comments
FOR INSERT TO authenticated
WITH CHECK (
  author_employee_id = public.current_employee_id()
  AND (
    public.is_admin_or_manager()
    OR public.is_assigned_to_task(task_id)
  )
);

-- Loeschen: eigener Kommentar oder Chef
CREATE POLICY "task_comments_delete" ON public.task_comments
FOR DELETE TO authenticated
USING (
  public.is_admin_or_manager()
  OR author_employee_id = public.current_employee_id()
);

-- =========================================================================
-- 7. RPC: Mitarbeiter-Statuswechsel (abhaken / in Bearbeitung / oeffnen)
--    SECURITY DEFINER, prueft Zuweisung selbst -> kein breites UPDATE-Recht.
-- =========================================================================
CREATE OR REPLACE FUNCTION public.set_my_task_status(
  p_task_id UUID,
  p_status  TEXT
)
RETURNS public.tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_emp UUID := public.current_employee_id();
  v_row public.tasks;
BEGIN
  IF p_status NOT IN ('todo','in_progress','in_review','done','blocked') THEN
    RAISE EXCEPTION 'Ungueltiger Status: %', p_status;
  END IF;

  -- Berechtigung: Chef ODER der Aufgabe zugewiesen
  IF NOT public.is_admin_or_manager()
     AND NOT EXISTS (
       SELECT 1 FROM public.task_assignees
       WHERE task_id = p_task_id AND employee_id = v_emp
     ) THEN
    RAISE EXCEPTION 'Keine Berechtigung fuer diese Aufgabe';
  END IF;

  UPDATE public.tasks
  SET status       = p_status,
      completed_at = CASE WHEN p_status = 'done' THEN now() ELSE NULL END,
      completed_by = CASE WHEN p_status = 'done' THEN v_emp ELSE NULL END,
      updated_at   = now()
  WHERE id = p_task_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_my_task_status(UUID, TEXT) TO authenticated;

COMMENT ON FUNCTION public.set_my_task_status(UUID, TEXT) IS
  'Setzt den Status einer Aufgabe durch eine zugewiesene Person oder einen Chef. Bei done werden completed_at + completed_by gesetzt (wer zuerst abhakt, erledigt fuer alle).';

-- =========================================================================
-- 8. Storage-Bucket fuer Kommentar-Bilder
-- =========================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('task-attachments', 'task-attachments', false)
ON CONFLICT (id) DO NOTHING;

-- Lesen + Hochladen fuer authentifizierte Nutzer (Single-Tenant, internes Tool).
-- Pfade sind nicht erratbar (UUID-basiert); kein anonymer Zugriff.
DROP POLICY IF EXISTS "task_attachments_select" ON storage.objects;
CREATE POLICY "task_attachments_select" ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id = 'task-attachments');

DROP POLICY IF EXISTS "task_attachments_insert" ON storage.objects;
CREATE POLICY "task_attachments_insert" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'task-attachments');

DROP POLICY IF EXISTS "task_attachments_delete" ON storage.objects;
CREATE POLICY "task_attachments_delete" ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'task-attachments');
