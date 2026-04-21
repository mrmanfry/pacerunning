
-- Add prompt_version to workout_analyses
ALTER TABLE public.workout_analyses
  ADD COLUMN IF NOT EXISTS prompt_version text;

-- Create ai_requests table for full audit trail of AI calls
CREATE TABLE IF NOT EXISTS public.ai_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  function_name text NOT NULL,
  model text NOT NULL,
  prompt_version text,
  log_id uuid,
  system_prompt text,
  user_prompt text,
  response jsonb,
  status text NOT NULL DEFAULT 'success',
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own ai_requests"
  ON public.ai_requests FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own ai_requests"
  ON public.ai_requests FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own ai_requests"
  ON public.ai_requests FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_ai_requests_user_created
  ON public.ai_requests (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_requests_log
  ON public.ai_requests (log_id);
