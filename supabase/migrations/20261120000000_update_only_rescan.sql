/*
  # Faster rescans

  A rescan used to delete everything and re-download the whole inbox. Now,
  when the inbox was fully scanned before and the mail server's UIDs are still
  valid, a rescan only drops emails that left the inbox, refreshes
  read/unread, and fetches the emails that are new (imap-fetch).

  1. New columns on `users`
    - last_uid_validity: the inbox's UIDVALIDITY at the end of the last
      finished scan. If the mail server changes it, UIDs were renumbered and
      the next rescan is a full one.
    - scan_mode: 'full' or 'update' while a scan is in progress, so a scan
      that is resumed later continues the same kind of scan.
*/

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS last_uid_validity text,
  ADD COLUMN IF NOT EXISTS scan_mode text CHECK (scan_mode IN ('full', 'update'));
