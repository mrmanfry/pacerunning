CREATE TABLE public.workout_analyses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  log_id UUID NOT NULL,
  technical_reading TEXT,
  session_highlight TEXT,
  next_move TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_workout_analyses_user_created ON public.workout_analyses(user_id, created_at DESC);
CREATE INDEX idx_workout_analyses_log ON public.workout_analyses(log_id);

ALTER TABLE public.workout_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own analyses"
ON public.workout_analyses FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users insert own analyses"
ON public.workout_analyses FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own analyses"
ON public.workout_analyses FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users delete own analyses"
ON public.workout_analyses FOR DELETE
TO authenticated
USING (auth.uid() = user_id);