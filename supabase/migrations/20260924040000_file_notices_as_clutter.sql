/*
  # File reminders and notices as junk

  The old scan filed reminders and notices as "important" because their
  subjects mention bills, payments, due dates or orders ("Payment due in 3
  days", "Your bill is ready", "Your order has shipped"). Simple view's Clean
  Up only sweeps junk, so it skipped them.

  imap-fetch now files these as clutter (see _shared/payment_proof.ts). This
  re-files the ones already stored, so no rescan is needed. Payment proof
  (is_protected) is never touched. The notice pattern is identical to the one
  inside is_protected (20260924030000).
*/

UPDATE public.emails
   SET category = 'clutter',
       importance_reason = NULL
 WHERE category = 'important'
   AND NOT is_protected
   AND coalesce(subject, '') ~* '(remind|\ydue\y|past due|overdue|upcoming|scheduled|auto-?pay|\yis (ready|available)|now available|ready to view|view (your|online)|don''t forget|expir|renew|shipped|out for delivery|delivered|on (its|the) way|arriving|\ytrack(ing)?\y|low balance|declined|failed|action required|your (next|first) order)';
