/*
  # "Paid & Verified" = proof of an actual payment, not reminders or notices

  1. Rule (the app's job is to remove fluff)
    Protected only when the email is NOT community chatter AND either:
    a) PAYMENT PROOF that is not a reminder/notice - receipts, "payment
       received/confirmed/successful/processed", "you paid", "you sent a
       payment", "paid in full", order/purchase confirmations, refunds; or
    b) THE ACTUAL INVOICE/BILL DOCUMENT - an invoice with an invoice number,
       or a bill/invoice/statement email with the document attached.

  2. Never protected (fluff)
    - Reminders and notices: "payment due", "overdue", "upcoming",
      "scheduled", "autopay", "your bill is ready", "statement is available",
      "view your bill online", renewals, expiring cards, failed/declined
      payments, "action required".
    - Delivery status: "shipped", "out for delivery", "delivered", tracking.
    - Community chatter (unchanged from 20260924020000).

  3. Mechanics
    - is_protected is dropped and re-added (a generated column's expression
      can't be altered in place before Postgres 17); every row recomputes.
*/

DROP INDEX IF EXISTS public.idx_emails_user_id_protected;
ALTER TABLE public.emails DROP COLUMN IF EXISTS is_protected;

ALTER TABLE public.emails
  ADD COLUMN is_protected boolean
  GENERATED ALWAYS AS (
    NOT (
      list_id IS NOT NULL
      OR lower(sender) ~ '@([a-z0-9-]+\.)*(nextdoor\.com|facebookmail\.com|reddit\.com|redditmail\.com|quora\.com|quoramail\.com|patch\.com|googlegroups\.com|groups\.io|yahoogroups\.com|meetup\.com|meetupmail\.com|stackexchange\.com|stackoverflow\.email|tumblr\.com|pinterest\.com|twitter\.com|x\.com|instagram\.com|tiktok\.com|discord\.com|discordapp\.com|youtube\.com|twitch\.tv|strava\.com|goodreads\.com|medium\.com|disqus\.com)$'
      OR lower(sender) ~ '@([a-z0-9-]+\.)*(news|newsletters?|community|forums?|groups?|lists|digest|outreach)\.'
      OR split_part(lower(sender), '@', 1) ~ '^(news|newsletters?|digest|community|forums?|groups?|discuss(ions?)?|outreach|posts?|social|trending)([+._-]|$)'
      OR coalesce(sender_name, '') ~* '\y(trending|neighbou?rs?|digest|newsletter|community|forum|discussions?|posts|news)\y'
    )
    AND (
      (coalesce(subject, '') ~* '\y(receipts?|e-?receipt|payments? (received|confirmed|confirmation|successful|processed|complete|completed)|thanks? (you )?for your (payment|order|purchase)|you paid|you sent (a )?payment|sent you (a )?payment|has been paid|paid in full|(bill|invoice) (has been )?paid|order (confirm(ed|ation)|#|number|no\.?|receipt)|your ([\w.&''-]+ ){0,3}order|purchase confirm(ed|ation)|refund(ed)?|transaction (receipt|confirmation))\y'
        AND NOT coalesce(subject, '') ~* '(remind|\ydue\y|past due|overdue|upcoming|scheduled|auto-?pay|\yis (ready|available)|now available|ready to view|view (your|online)|don''t forget|expir|renew|shipped|out for delivery|delivered|on (its|the) way|arriving|\ytrack(ing)?\y|low balance|declined|failed|action required|your (next|first) order)')
      OR (
      coalesce(subject, '') ~* '\yinvoice ?(#|no\.?|number)'
      OR (has_attachment AND coalesce(subject, '') ~* '\y(invoices?|bills?|statements?)\y')
    )
    )
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_emails_user_id_protected
  ON public.emails(user_id)
  WHERE is_protected;
