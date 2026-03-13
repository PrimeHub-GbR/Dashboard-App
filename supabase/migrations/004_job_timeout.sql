-- Migration: 004_job_timeout
-- Marks jobs as 'timeout' if they have been in 'pending' or 'running'
-- state for more than 5 minutes without a callback from n8n.

-- Function to mark timed-out jobs
CREATE OR REPLACE FUNCTION mark_timed_out_jobs()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  affected INTEGER;
BEGIN
  UPDATE jobs
  SET
    status     = 'timeout',
    error_message = 'Kein Callback von n8n nach 5 Minuten. Job abgebrochen.',
    updated_at = NOW()
  WHERE
    status IN ('pending', 'running')
    AND updated_at < NOW() - INTERVAL '5 minutes';

  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

-- Enable pg_cron if available (requires Supabase Pro plan or self-hosted with pg_cron).
-- Run manually in SQL Editor to enable, then uncomment and re-apply this migration:
--
-- CREATE EXTENSION IF NOT EXISTS pg_cron;
--
-- SELECT cron.schedule(
--   'mark-timed-out-jobs',   -- job name
--   '* * * * *',             -- every minute
--   $$ SELECT mark_timed_out_jobs(); $$
-- );
--
-- To verify the cron job is scheduled:
-- SELECT * FROM cron.job;
--
-- To remove the cron job:
-- SELECT cron.unschedule('mark-timed-out-jobs');
