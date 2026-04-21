ALTER TABLE public.workout_analyses
ADD COLUMN IF NOT EXISTS segment_readings jsonb;