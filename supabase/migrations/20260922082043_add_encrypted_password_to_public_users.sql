ALTER TABLE public.users ADD COLUMN IF NOT EXISTS encrypted_password text;
