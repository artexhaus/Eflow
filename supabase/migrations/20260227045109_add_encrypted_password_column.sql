/*
  # Add encrypted password column for IMAP credentials

  1. Changes
    - Add `encrypted_password` column to `users` table to store base64-encoded IMAP passwords
    - This allows Yahoo and iCloud users to authenticate via IMAP with app-specific passwords
  
  2. Security
    - Passwords are base64 encoded (basic obfuscation)
    - Column is nullable as OAuth users (Gmail, Outlook) don't need this
    - RLS policies already protect user data
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'encrypted_password'
  ) THEN
    ALTER TABLE users ADD COLUMN encrypted_password text;
  END IF;
END $$;