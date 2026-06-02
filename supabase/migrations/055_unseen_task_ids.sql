-- Migration 055: IDs neuer (ungesehener) Aufgaben für die "Neu"-Markierung
--
-- Ergänzt count_unseen_tasks (054): liefert die konkreten task_ids, damit die
-- App jede neue Aufgabe in der Liste mit einem "Neu"-Symbol markieren kann.
-- Sobald der Mitarbeiter eine Aufgabe öffnet (mark_task_viewed), fällt sie aus
-- dieser Liste heraus.

CREATE OR REPLACE FUNCTION public.get_unseen_task_ids()
RETURNS UUID[]
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
  SELECT COALESCE(array_agg(ta.task_id), '{}')
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

GRANT EXECUTE ON FUNCTION public.get_unseen_task_ids() TO authenticated;

COMMENT ON FUNCTION public.get_unseen_task_ids() IS
  'task_ids der dem aktuellen Mitarbeiter zugewiesenen, noch nicht geöffneten und nicht erledigten Aufgaben (für die Neu-Markierung in der Liste).';
