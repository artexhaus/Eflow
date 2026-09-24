/*
  # Fix scam false positives on company addresses

  1. Problem
    - 20260924060000 treated any mailbox with 6+ consonants in a row as
      gibberish. Company systems put IDs in their addresses: Stripe receipts
      come from invoice+statements+acct_1ilxcshhigqmwicv@stripe.com, so real
      "Your receipt from ... #2158-2048" emails were flagged as scams, lost
      their protection and were re-filed as junk.

  2. Fix
    - The gibberish check now applies only to free personal accounts (Gmail,
      Yahoo, Outlook, ...), where scammers make throwaway addresses, and only
      to the part before any "+" tag.
    - Everything else in is_suspicious / is_protected is unchanged.
    - Receipts and invoices that are protected again but were re-filed as
      junk go back to "important".

  Mirrors supabase/functions/_shared/scam.ts - keep in sync.
*/

DROP INDEX IF EXISTS public.idx_emails_user_id_protected;
ALTER TABLE public.emails DROP COLUMN IF EXISTS is_protected;
DROP INDEX IF EXISTS public.idx_emails_user_id_suspicious;
ALTER TABLE public.emails DROP COLUMN IF EXISTS is_suspicious;

ALTER TABLE public.emails
  ADD COLUMN is_suspicious boolean
  GENERATED ALWAYS AS (
    (
      coalesce(subject, '') ~* '(order|invoice|receipt|payment|purchase|subscription|renew|refund|transaction|billing|confirm|account (suspended|locked|on hold)|verify your)'
      AND (
        (split_part(lower(sender), '@', 2) IN ('gmail.com','googlemail.com','yahoo.com','ymail.com','outlook.com','hotmail.com','live.com','msn.com','aol.com','icloud.com','me.com','protonmail.com','proton.me','mail.com','gmx.com')
            AND split_part(split_part(lower(sender), '@', 1), '+', 1) ~ '[bcdfghjklmnpqrstvwxz]{6,}')
        OR coalesce(subject, '') ~ '[a-z][A-Z]*[0-9][A-Z0-9]{5,}'
        OR (split_part(lower(sender), '@', 2) IN ('gmail.com','googlemail.com','yahoo.com','ymail.com','outlook.com','hotmail.com','live.com','msn.com','aol.com','icloud.com','me.com','protonmail.com','proton.me','mail.com','gmx.com')
            AND (coalesce(sender_name, '') ~* '\y(paypal|norton|mcafee|geek ?squad|apple|amazon|microsoft|coinbase|best ?buy|walmart|netflix|venmo|zelle|cash ?app|bank of america|chase|wells fargo)\y' OR coalesce(subject, '') ~* '\y(paypal|norton|mcafee|geek ?squad|apple|amazon|microsoft|coinbase|best ?buy|walmart|netflix|venmo|zelle|cash ?app|bank of america|chase|wells fargo)\y'))
        OR (split_part(lower(sender), '@', 2) IN ('gmail.com','googlemail.com','yahoo.com','ymail.com','outlook.com','hotmail.com','live.com','msn.com','aol.com','icloud.com','me.com','protonmail.com','proton.me','mail.com','gmx.com')
            AND has_attachment
            AND btrim(coalesce(sender_name, '')) ~ '^[A-Z]{2,}( [A-Z]{2,})+$')
      )
    )
  ) STORED;

ALTER TABLE public.emails
  ADD COLUMN is_protected boolean
  GENERATED ALWAYS AS (
    NOT (
      coalesce(subject, '') ~* '(order|invoice|receipt|payment|purchase|subscription|renew|refund|transaction|billing|confirm|account (suspended|locked|on hold)|verify your)'
      AND (
        (split_part(lower(sender), '@', 2) IN ('gmail.com','googlemail.com','yahoo.com','ymail.com','outlook.com','hotmail.com','live.com','msn.com','aol.com','icloud.com','me.com','protonmail.com','proton.me','mail.com','gmx.com')
            AND split_part(split_part(lower(sender), '@', 1), '+', 1) ~ '[bcdfghjklmnpqrstvwxz]{6,}')
        OR coalesce(subject, '') ~ '[a-z][A-Z]*[0-9][A-Z0-9]{5,}'
        OR (split_part(lower(sender), '@', 2) IN ('gmail.com','googlemail.com','yahoo.com','ymail.com','outlook.com','hotmail.com','live.com','msn.com','aol.com','icloud.com','me.com','protonmail.com','proton.me','mail.com','gmx.com')
            AND (coalesce(sender_name, '') ~* '\y(paypal|norton|mcafee|geek ?squad|apple|amazon|microsoft|coinbase|best ?buy|walmart|netflix|venmo|zelle|cash ?app|bank of america|chase|wells fargo)\y' OR coalesce(subject, '') ~* '\y(paypal|norton|mcafee|geek ?squad|apple|amazon|microsoft|coinbase|best ?buy|walmart|netflix|venmo|zelle|cash ?app|bank of america|chase|wells fargo)\y'))
        OR (split_part(lower(sender), '@', 2) IN ('gmail.com','googlemail.com','yahoo.com','ymail.com','outlook.com','hotmail.com','live.com','msn.com','aol.com','icloud.com','me.com','protonmail.com','proton.me','mail.com','gmx.com')
            AND has_attachment
            AND btrim(coalesce(sender_name, '')) ~ '^[A-Z]{2,}( [A-Z]{2,})+$')
      )
    )
    AND NOT (
      list_id IS NOT NULL
      OR lower(sender) ~ '@([a-z0-9-]+\.)*(nextdoor\.com|facebookmail\.com|reddit\.com|redditmail\.com|quora\.com|quoramail\.com|patch\.com|googlegroups\.com|groups\.io|yahoogroups\.com|meetup\.com|meetupmail\.com|stackexchange\.com|stackoverflow\.email|tumblr\.com|pinterest\.com|twitter\.com|x\.com|instagram\.com|tiktok\.com|discord\.com|discordapp\.com|youtube\.com|twitch\.tv|strava\.com|goodreads\.com|medium\.com|disqus\.com)$'
      OR lower(sender) ~ '@([a-z0-9-]+\.)*(news|newsletters?|community|forums?|groups?|lists|digest|outreach)\.'
      OR split_part(lower(sender), '@', 1) ~ '^(news|newsletters?|digest|community|forums?|groups?|discuss(ions?)?|outreach|posts?|social|trending)([+._-]|$)'
      OR coalesce(sender_name, '') ~* '\y(trending|neighbou?rs?|digest|newsletter|community|forum|discussions?|posts|news)\y'
    )
    AND (
      (coalesce(subject, '') ~* '\y(receipts?|e-?receipt|payments? (received|confirmed|confirmation|successful|processed|complete|completed)|thanks? (you )?for your (payment|order|purchase)|you paid|you sent (a )?payment|sent you (a )?payment|has been paid|paid in full|(bill|invoice) (has been )?paid|order (confirm(ed|ation)|#|number|no\.?|receipt)|your ([\w.&''-]+ ){0,3}(order|purchase)|purchase confirm(ed|ation)|refund(ed)?|transaction (receipt|confirmation))\y'
        AND NOT coalesce(subject, '') ~* '(remind|\ydue\y|past due|overdue|upcoming|scheduled|auto-?pay|\yis (ready|available)|now available|ready to view|view (your|online)|don''t forget|expir|renew|shipped|out for delivery|delivered|on (its|the) way|arriving|\ytrack(ing)?\y|low balance|declined|failed|action required|your (next|first) (order|purchase))')
      OR (
      coalesce(subject, '') ~* '\yinvoice ?(#|no\.?|number)'
      OR (has_attachment AND coalesce(subject, '') ~* '\y(invoices?|bills?|statements?)\y')
    )
    )
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_emails_user_id_protected
  ON public.emails(user_id)
  WHERE is_protected;

CREATE INDEX IF NOT EXISTS idx_emails_user_id_suspicious
  ON public.emails(user_id)
  WHERE is_suspicious;

UPDATE public.emails
   SET category = 'important',
       importance_reason = 'Receipt or invoice'
 WHERE is_protected
   AND category = 'clutter';
