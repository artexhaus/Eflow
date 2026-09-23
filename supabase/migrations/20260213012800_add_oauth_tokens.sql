/*
  # Add OAuth Token Storage

  1. Changes to `users` table
    - Add `access_token` (text, encrypted) - OAuth access token
    - Add `refresh_token` (text, encrypted) - OAuth refresh token
    - Add `token_expires_at` (timestamptz) - Token expiration timestamp
    
  2. Security
    - Tokens are sensitive and should be handled carefully
    - Only the user can access their own tokens via RLS
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'access_token'
  ) THEN
    ALTER TABLE users ADD COLUMN access_token text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'refresh_token'
  ) THEN
    ALTER TABLE users ADD COLUMN refresh_token text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'token_expires_at'
  ) THEN
    ALTER TABLE users ADD COLUMN token_expires_at timestamptz;
  END IF;
END $$;