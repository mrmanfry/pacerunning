
-- Profiles table (linked to auth.users)
CREATE TABLE public.profiles (
  id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  age INT NOT NULL,
  weight INT NOT NULL,
  sex TEXT NOT NULL CHECK (sex IN ('M','F')),
  current_best INT NOT NULL,
  target_time INT NOT NULL,
  weekly_freq INT NOT NULL,
  days_until_race INT NOT NULL,
  level TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own profile" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users delete own profile" ON public.profiles FOR DELETE TO authenticated USING (auth.uid() = id);

-- Consents table (legal trail)
CREATE TABLE public.consents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  c1 BOOLEAN NOT NULL,
  c2 BOOLEAN NOT NULL,
  c3 BOOLEAN NOT NULL,
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.consents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own consents" ON public.consents FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own consents" ON public.consents FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own consents" ON public.consents FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Plans table (1 per user, JSONB structure)
CREATE TABLE public.plans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  weeks JSONB NOT NULL,
  target INT NOT NULL,
  adjusted_estimate NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own plan" ON public.plans FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own plan" ON public.plans FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own plan" ON public.plans FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users delete own plan" ON public.plans FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Workout logs
CREATE TABLE public.workout_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  week_idx INT,
  session_idx INT,
  session_type TEXT NOT NULL,
  session_name TEXT NOT NULL,
  duration NUMERIC NOT NULL,
  distance NUMERIC NOT NULL,
  hr_avg INT NOT NULL,
  hr_max INT,
  rpe INT NOT NULL,
  cadence INT,
  notes TEXT,
  safety_overridden BOOLEAN DEFAULT false,
  logged_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.workout_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own logs" ON public.workout_logs FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own logs" ON public.workout_logs FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own logs" ON public.workout_logs FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX idx_logs_user_logged ON public.workout_logs(user_id, logged_at DESC);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_plans_updated BEFORE UPDATE ON public.plans
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
