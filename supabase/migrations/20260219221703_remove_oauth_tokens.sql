/*
  # Remove OAuth Token Columns

  1. Changes
    - Remove `access_token` column from `users` table
    - Remove `refresh_token` column from `users` table
    - Remove `token_expires_at` column from `users` table
    
  2. Notes
    - These columns were used for Yahoo OAuth which is being replaced with IMAP
    - Data will be preserved until this migration is run
*/

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'access_token'
  ) THEN
    ALTER TABLE users DROP COLUMN access_token;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'refresh_token'
  ) THEN
    ALTER TABLE users DROP COLUMN refresh_token;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'token_expires_at'
  ) THEN
    ALTER TABLE users DROP COLUMN token_expires_at;
  END IF;
END $$;
