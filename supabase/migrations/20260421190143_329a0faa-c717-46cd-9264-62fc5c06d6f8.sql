CREATE TABLE public.workout_extractions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  log_id uuid,
  source_image_paths text[] NOT NULL DEFAULT '{}',
  raw_extraction jsonb NOT NULL,
  prompt_version text,
  model text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.workout_extractions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own extractions"
  ON public.workout_extractions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own extractions"
  ON public.workout_extractions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own extractions"
  ON public.workout_extractions FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX idx_workout_extractions_user ON public.workout_extractions(user_id);
CREATE INDEX idx_workout_extractions_log ON public.workout_extractions(log_id);