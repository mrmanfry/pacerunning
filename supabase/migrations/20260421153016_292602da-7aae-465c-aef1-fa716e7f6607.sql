ALTER TABLE public.consents
  ADD COLUMN IF NOT EXISTS consent_version text NOT NULL DEFAULT 'v1-2025-04-21',
  ADD COLUMN IF NOT EXISTS terms_version text NOT NULL DEFAULT 'v1-2025-04-21',
  ADD COLUMN IF NOT EXISTS c4_health_data boolean NOT NULL DEFAULT false;