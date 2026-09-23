/*
  # Inbox Reset Schema

  1. New Tables
    - `users`
      - `id` (uuid, primary key) - User identifier
      - `email` (text) - User's email address
      - `email_provider` (text) - Provider name (gmail, outlook, yahoo)
      - `connected_account_id` (text) - OAuth account identifier
      - `last_scan` (timestamptz) - Last time inbox was scanned
      - `created_at` (timestamptz) - Account creation timestamp
      - `updated_at` (timestamptz) - Last update timestamp
    
    - `emails`
      - `id` (uuid, primary key) - Email identifier
      - `user_id` (uuid, foreign key) - References users
      - `email_id` (text) - Original email ID from provider
      - `sender` (text) - Email sender address
      - `sender_name` (text) - Sender display name
      - `subject` (text) - Email subject line
      - `snippet` (text) - Email preview text
      - `category` (text) - AI category: important, clutter, bundle
      - `importance_reason` (text) - Why AI flagged as important
      - `bundle_id` (uuid, optional) - References bundles if part of bundle
      - `timestamp` (timestamptz) - Email received timestamp
      - `is_read` (boolean) - Read status
      - `has_attachment` (boolean) - Attachment indicator
      - `is_archived` (boolean) - Archive status
      - `is_deleted` (boolean) - Deletion status
      - `created_at` (timestamptz) - Record creation timestamp
    
    - `bundles`
      - `id` (uuid, primary key) - Bundle identifier
      - `user_id` (uuid, foreign key) - References users
      - `sender` (text) - Common sender across bundle
      - `bundle_type` (text) - Type of bundle (promotions, notifications, etc)
      - `count` (integer) - Number of emails in bundle
      - `example_subjects` (jsonb) - Array of example subject lines
      - `created_at` (timestamptz) - Bundle creation timestamp

  2. Security
    - Enable RLS on all tables
    - Users can only access their own data
    - Policies for authenticated users to read/write their own records
*/

-- Create users table
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  email_provider text NOT NULL,
  connected_account_id text,
  last_scan timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON users FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON users FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON users FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Create emails table
CREATE TABLE IF NOT EXISTS emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  email_id text NOT NULL,
  sender text NOT NULL,
  sender_name text DEFAULT '',
  subject text NOT NULL,
  snippet text DEFAULT '',
  category text NOT NULL DEFAULT 'clutter',
  importance_reason text,
  bundle_id uuid,
  timestamp timestamptz NOT NULL,
  is_read boolean DEFAULT false,
  has_attachment boolean DEFAULT false,
  is_archived boolean DEFAULT false,
  is_deleted boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE emails ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own emails"
  ON emails FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own emails"
  ON emails FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own emails"
  ON emails FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own emails"
  ON emails FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- Create bundles table
CREATE TABLE IF NOT EXISTS bundles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  sender text NOT NULL,
  bundle_type text NOT NULL,
  count integer DEFAULT 0,
  example_subjects jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE bundles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own bundles"
  ON bundles FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own bundles"
  ON bundles FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own bundles"
  ON bundles FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own bundles"
  ON bundles FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- Add foreign key constraint for bundle_id in emails
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'emails_bundle_id_fkey'
  ) THEN
    ALTER TABLE emails
    ADD CONSTRAINT emails_bundle_id_fkey
    FOREIGN KEY (bundle_id) REFERENCES bundles(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_emails_user_id ON emails(user_id);
CREATE INDEX IF NOT EXISTS idx_emails_category ON emails(category);
CREATE INDEX IF NOT EXISTS idx_emails_bundle_id ON emails(bundle_id);
CREATE INDEX IF NOT EXISTS idx_emails_timestamp ON emails(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_bundles_user_id ON bundles(user_id);