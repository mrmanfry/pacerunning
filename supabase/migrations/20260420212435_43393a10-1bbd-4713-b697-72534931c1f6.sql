-- Allow skipping a session: mark it as skipped without requiring training metrics
ALTER TABLE public.workout_logs
  ADD COLUMN IF NOT EXISTS skipped BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS skip_reason TEXT;

-- Make training metrics optional so a "skipped" log can exist with no numbers
ALTER TABLE public.workout_logs ALTER COLUMN distance DROP NOT NULL;
ALTER TABLE public.workout_logs ALTER COLUMN duration DROP NOT NULL;
ALTER TABLE public.workout_logs ALTER COLUMN hr_avg DROP NOT NULL;
ALTER TABLE public.workout_logs ALTER COLUMN rpe DROP NOT NULL;

-- Validation: if NOT skipped, the core metrics must be present
CREATE OR REPLACE FUNCTION public.workout_logs_validate()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.skipped = false THEN
    IF NEW.distance IS NULL OR NEW.duration IS NULL OR NEW.hr_avg IS NULL OR NEW.rpe IS NULL THEN
      RAISE EXCEPTION 'Non-skipped workout requires distance, duration, hr_avg and rpe';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS workout_logs_validate_trg ON public.workout_logs;
CREATE TRIGGER workout_logs_validate_trg
BEFORE INSERT OR UPDATE ON public.workout_logs
FOR EACH ROW EXECUTE FUNCTION public.workout_logs_validate();