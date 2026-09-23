/*
  # Add resumable scan progress columns

  1. Changes
    - Add `scan_cursor` (integer) to `users` table - the next 1-based IMAP
      sequence number to fetch. NULL means no scan is currently in progress.
    - Add `scan_total` (integer) to `users` table - the total message count
      in the mailbox at the time the current scan started.

  2. Why
    - Large mailboxes (thousands of messages) cannot be fetched, classified,
      and inserted in a single Edge Function invocation without exceeding
      Supabase's per-invocation CPU/memory/time limits (WORKER_RESOURCE_LIMIT).
    - Storing scan progress lets the imap-fetch function process one bounded
      chunk per call and resume on the next call until the whole mailbox has
      been scanned.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'scan_cursor'
  ) THEN
    ALTER TABLE public.users ADD COLUMN scan_cursor integer;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'scan_total'
  ) THEN
    ALTER TABLE public.users ADD COLUMN scan_total integer;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'scan_sender_counts'
  ) THEN
    ALTER TABLE public.users ADD COLUMN scan_sender_counts jsonb;
  END IF;
END $$;

-- Prevent duplicate email rows if a chunked scan call is retried
CREATE UNIQUE INDEX IF NOT EXISTS idx_emails_user_id_email_id_unique
  ON public.emails(user_id, email_id);
