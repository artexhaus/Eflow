/*
  # Switch chunked scan to an explicit remaining-UID list

  1. Background
    - The UID-range cursor (scan_uid_low) walks backwards through *all* UID
      numbers from the highest down to 1, in fixed-size slices. This assumes
      UIDs are packed close together, but a mailbox with a long history of
      deletions can have real messages clustered in a small span near the
      top of UID space while millions of now-unused UIDs sit below them.
    - Observed in testing: a 10,000-message mailbox whose messages occupied
      UIDs ~492,682-503,296 still had a lowest-ever-assigned UID near 1,
      so after fetching all real messages the scan kept making empty
      153-UID-wide IMAP round trips for thousands more calls just to walk
      down through empty UID space to reach 1 - appearing to "freeze" at
      100% scanned with no way to finish in a reasonable time.
    - The fix: resolve the mailbox's exact UID list once with a single
      IMAP SEARCH ALL command, then hand out real UIDs from that list in
      fixed-size slices. Every chunk after that always contains up to
      FETCH_CHUNK_SIZE real messages (never an empty round trip), so the
      number of calls needed is exactly ceil(message_count / chunk_size)
      regardless of how sparse the UID space is.

  2. Changes
    - Add `scan_remaining_uids` (jsonb) to `users` - the UIDs not yet
      fetched in the current scan, in the order they will be processed
      (newest first). NULL means no scan is in progress.
    - `scan_uid_low` is no longer written by the scan logic (kept for
      backward compatibility with any in-flight rows) but is cleared to
      NULL whenever other scan_* columns are cleared.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'scan_remaining_uids'
  ) THEN
    ALTER TABLE public.users ADD COLUMN scan_remaining_uids jsonb;
  END IF;
END $$;
