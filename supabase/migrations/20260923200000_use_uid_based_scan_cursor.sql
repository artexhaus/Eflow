/*
  # Switch chunked scan cursor from IMAP sequence numbers to UIDs

  1. Background
    - scan_cursor / scan_total previously held IMAP *sequence* numbers.
    - Sequence numbers renumber whenever the mailbox changes (new mail
      arrives, messages are expunged), which happens naturally over the many
      minutes a large mailbox scan takes across dozens of chunked Edge
      Function calls. This caused messages to be skipped or silently missed
      (observed: only 7,448 of 10,000 messages were fetched in one test run).
    - UIDs (unique identifiers), in contrast, are stable for the lifetime of
      a mailbox (barring a rare UIDVALIDITY change), so paging through UID
      space instead of sequence-number space guarantees every message is
      visited exactly once regardless of mailbox activity during the scan.

  2. Changes
    - Add `scan_uid_low` (integer) - the lowest UID boundary the scan has
      not yet fetched below (walks downward from the highest UID towards 1).
    - Add `scan_uid_validity` (bigint) - the mailbox UIDVALIDITY captured at
      scan start; if it changes mid-scan the UIDs are no longer meaningful
      and the scan must restart from scratch.
    - `scan_cursor` / `scan_total` (sequence-number based) are no longer
      used by the scan logic but are left in place for backward
      compatibility; they are always cleared together with the new columns.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'scan_uid_low'
  ) THEN
    ALTER TABLE public.users ADD COLUMN scan_uid_low bigint;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'scan_uid_validity'
  ) THEN
    ALTER TABLE public.users ADD COLUMN scan_uid_validity bigint;
  END IF;
END $$;
