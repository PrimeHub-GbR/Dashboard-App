-- Migration 054: "Gesehen"-Status für Aufgaben (Badge-Zähler in der App)
--
-- Der Aufgaben-Tab zeigt einen roten Zähler mit der Anzahl neuer (noch nicht
-- geöffneter) zugewiesener Aufgaben. Sobald der Mitarbeiter eine Aufgabe
-- öffnet, gilt sie als gesehen und der Zähler sinkt.

CREATE TABLE IF NOT EXISTS public.task_views (
  task_id     UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  viewed_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (task_id, employee_id)
);

ALTER TABLE public.task_views ENABLE ROW LEVEL SECURITY;

-- Lesen: eigene Einträge (Admin/Manager alle)
CREATE POLICY "task_views_select_self" ON public.task_views
FOR SELECT TO authenticated
USING (
  public.is_admin_or_manager()
  OR employee_id = public.current_employee_id()
);

-- =========================================================================
-- RPC: Aufgabe als gesehen markieren (beim Öffnen der Detailansicht)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.mark_task_viewed(p_task_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_emp UUID := public.current_employee_id();
BEGIN
  IF v_emp IS NULL THEN RETURN; END IF;
  INSERT INTO public.task_views (task_id, employee_id)
  VALUES (p_task_id, v_emp)
  ON CONFLICT (task_id, employee_id) DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_task_viewed(UUID) TO authenticated;

-- =========================================================================
-- RPC: Anzahl neuer (ungesehener, nicht erledigter) zugewiesener Aufgaben
-- =========================================================================
CREATE OR REPLACE FUNCTION public.count_unseen_tasks()
RETURNS INTEGER
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
  SELECT count(*)::int
  FROM public.task_assignees ta
  JOIN public.tasks t ON t.id = ta.task_id
  WHERE ta.employee_id = public.current_employee_id()
    AND t.status <> 'done'
    AND NOT EXISTS (
      SELECT 1 FROM public.task_views tv
      WHERE tv.task_id = ta.task_id
        AND tv.employee_id = ta.employee_id
    );
$$;

GRANT EXECUTE ON FUNCTION public.count_unseen_tasks() TO authenticated;

COMMENT ON FUNCTION public.count_unseen_tasks() IS
  'Anzahl der dem aktuellen Mitarbeiter zugewiesenen, noch nicht geöffneten und nicht erledigten Aufgaben (für den Badge-Zähler).';
