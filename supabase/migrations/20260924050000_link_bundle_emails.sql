/*
  # Link bundled emails to their bundle groups

  1. Bug
    - imap-fetch built one `bundles` row per sender but never set
      emails.bundle_id, so every group looked empty: the Bundles screen showed
      no emails and "Archive all" on a group had nothing to act on. Groups
      whose emails were later archived/deleted also lingered, which is how the
      dashboard ended up with more groups (168) than bundled emails (68).

  2. Changes
    - link_bundle_emails(): links the calling user's bundled emails to the
      group for their sender and refreshes each group's count. SECURITY
      INVOKER, so it runs under the caller's RLS and only touches their rows.
      imap-fetch calls it after rebuilding the groups at the end of a scan.
    - One-time fix for existing data: link every user's bundled emails, then
      remove groups that no longer have any email left in the inbox.
*/

CREATE OR REPLACE FUNCTION public.link_bundle_emails()
RETURNS void
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  UPDATE emails e
     SET bundle_id = b.id
    FROM bundles b
   WHERE e.user_id = auth.uid()
     AND b.user_id = e.user_id
     AND b.sender = e.sender
     AND e.category = 'bundle'
     AND e.bundle_id IS DISTINCT FROM b.id;

  UPDATE bundles b
     SET count = (
       SELECT count(*) FROM emails e
        WHERE e.bundle_id = b.id AND NOT e.is_deleted AND NOT e.is_archived
     )
   WHERE b.user_id = auth.uid();
$$;

REVOKE EXECUTE ON FUNCTION public.link_bundle_emails() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.link_bundle_emails() TO authenticated;

-- One-time repair of existing data (all users).
UPDATE public.emails e
   SET bundle_id = b.id
  FROM public.bundles b
 WHERE b.user_id = e.user_id
   AND b.sender = e.sender
   AND e.category = 'bundle'
   AND e.bundle_id IS DISTINCT FROM b.id;

DELETE FROM public.bundles b
 WHERE NOT EXISTS (
   SELECT 1 FROM public.emails e
    WHERE e.bundle_id = b.id AND NOT e.is_deleted AND NOT e.is_archived
 );

UPDATE public.bundles b
   SET count = (
     SELECT count(*) FROM public.emails e
      WHERE e.bundle_id = b.id AND NOT e.is_deleted AND NOT e.is_archived
   );
