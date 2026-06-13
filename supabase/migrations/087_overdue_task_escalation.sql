-- Migration 087: Ueberfaellige Aufgaben — Eskalation + Pflicht-Aktion.

-- Eigene ueberfaellige Aufgaben (fuer das Pflicht-Popup). blocking=true ->
-- nicht schliessbar (Mitarbeiter ab 7 Tagen, Manager/GF ab 10 Tagen Verzug).
CREATE OR REPLACE FUNCTION public.get_my_overdue_tasks()
RETURNS TABLE(task_id uuid, title text, due_date date, days_overdue int, blocking boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_emp uuid; v_threshold int;
BEGIN
  v_emp := public.current_employee_id();
  IF v_emp IS NULL THEN RETURN; END IF;
  v_threshold := CASE WHEN public._level_of(v_emp) >= 2 THEN 10 ELSE 7 END;
  RETURN QUERY
  SELECT t.id, t.title, t.due_date, (current_date - t.due_date)::int,
         ((current_date - t.due_date) >= v_threshold)
  FROM public.tasks t
  JOIN public.task_assignees ta ON ta.task_id = t.id
  WHERE ta.employee_id = v_emp
    AND t.due_date IS NOT NULL
    AND t.due_date < current_date
    AND t.status NOT IN ('done','blocked')
  ORDER BY t.due_date;
END; $$;
GRANT EXECUTE ON FUNCTION public.get_my_overdue_tasks() TO authenticated;

-- Zugewiesene(r): Faelligkeit aktualisieren MIT Pflicht-Kommentar.
CREATE OR REPLACE FUNCTION public.update_my_task_due(p_task_id uuid, p_due date, p_comment text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_emp uuid; v_name text;
BEGIN
  v_emp := public.current_employee_id();
  IF v_emp IS NULL THEN RAISE EXCEPTION 'Kein verknuepfter Account'; END IF;
  IF NOT (public.is_chef() OR EXISTS (
    SELECT 1 FROM public.task_assignees WHERE task_id = p_task_id AND employee_id = v_emp)) THEN
    RAISE EXCEPTION 'Nicht zugewiesen';
  END IF;
  IF p_comment IS NULL OR btrim(p_comment) = '' THEN
    RAISE EXCEPTION 'Ein Kommentar ist verpflichtend';
  END IF;
  IF p_due IS NULL OR p_due <= current_date THEN
    RAISE EXCEPTION 'Das neue Datum muss in der Zukunft liegen';
  END IF;
  SELECT name INTO v_name FROM public.employees WHERE id = v_emp;
  UPDATE public.tasks SET due_date = p_due, updated_at = now() WHERE id = p_task_id;
  INSERT INTO public.task_comments (task_id, author_employee_id, author_name, body)
  VALUES (p_task_id, v_emp, v_name,
          'Neue Frist ' || to_char(p_due,'DD.MM.YYYY') || ': ' || btrim(p_comment));
END; $$;
GRANT EXECUTE ON FUNCTION public.update_my_task_due(uuid, date, text) TO authenticated;

-- Cron: ueberfaellige Aufgaben auf Prio 'high' setzen + Eskalations-Empfaenger
-- zurueckgeben (Mitarbeiter-Task >=7T -> alle Chefs; Manager-Task >=10T -> GF).
CREATE OR REPLACE FUNCTION public.escalate_overdue_tasks()
RETURNS TABLE(recipient_id uuid, title text, body text)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  UPDATE public.tasks SET priority = 'high', updated_at = now()
  WHERE due_date IS NOT NULL AND due_date < current_date
    AND status NOT IN ('done','blocked') AND priority <> 'high';

  RETURN QUERY
  WITH overdue AS (
    SELECT t.id, t.title, (current_date - t.due_date)::int AS dov,
           ta.employee_id AS assignee, public._level_of(ta.employee_id) AS alvl
    FROM public.tasks t
    JOIN public.task_assignees ta ON ta.task_id = t.id
    WHERE t.due_date IS NOT NULL AND t.due_date < current_date
      AND t.status NOT IN ('done','blocked')
  ),
  esc AS (
    SELECT c.id AS recipient
    FROM overdue o
    JOIN LATERAL public.chef_employee_ids() c ON true
    WHERE o.alvl <= 1 AND o.dov >= 7
    UNION
    SELECT e.id AS recipient
    FROM overdue o
    JOIN public.employees e ON NOT e.is_demo AND (
      e.position = 'geschaeftsfuehrer'
      OR EXISTS (SELECT 1 FROM public.user_roles ur
                 WHERE ur.user_id = e.auth_user_id AND ur.role = 'admin'))
    WHERE o.alvl = 2 AND o.dov >= 10
  ),
  cnt AS (
    SELECT (SELECT count(*) FROM overdue WHERE dov >= 7) AS n
  )
  SELECT esc.recipient, 'Überfällige Aufgaben'::text,
         (SELECT n FROM cnt)::text ||
         ' überfällige Aufgabe(n) im Team brauchen Aufmerksamkeit.' AS body
  FROM (SELECT DISTINCT recipient FROM esc) esc;
END; $$;
REVOKE ALL ON FUNCTION public.escalate_overdue_tasks() FROM public;
GRANT EXECUTE ON FUNCTION public.escalate_overdue_tasks() TO service_role;
