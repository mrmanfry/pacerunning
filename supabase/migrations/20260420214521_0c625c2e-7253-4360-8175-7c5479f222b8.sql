ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS estimate_low numeric,
  ADD COLUMN IF NOT EXISTS estimate_high numeric,
  ADD COLUMN IF NOT EXISTS estimate_confidence text;