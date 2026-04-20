-- Add race_date to profiles
ALTER TABLE public.profiles ADD COLUMN race_date date;

-- Create private bucket for workout screenshots
INSERT INTO storage.buckets (id, name, public)
VALUES ('workout-screenshots', 'workout-screenshots', false);

-- RLS policies: users can only access their own files
CREATE POLICY "Users view own workout screenshots"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'workout-screenshots' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users upload own workout screenshots"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'workout-screenshots' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users delete own workout screenshots"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'workout-screenshots' AND auth.uid()::text = (storage.foldername(name))[1]);