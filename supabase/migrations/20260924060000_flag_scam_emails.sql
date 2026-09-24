/*
  # Flag likely scam emails, and protect "Your ... Purchase" receipts

  1. emails.is_suspicious (generated) - "Looks like a scam"
    A transactional subject (order, invoice, receipt, payment, renewal,
    subscription, refund, "confirm", "verify your", ...) AND at least one of:
    - a gibberish sender mailbox: 6+ consonants in a row (tjhghjvgjngghh@)
    - a random code glued onto a word: "confirmationD54CV63GYAUC9"
    - a big brand (PayPal, Norton, McAfee, Geek Squad, Apple, Amazon, ...)
      named by a free personal account (@gmail.com etc.)
    - an ALL-CAPS person's name on a free personal account, with an attachment
    A transactional subject from Gmail alone is NOT enough: freelancers and
    friends legitimately send invoices that way.

  2. emails.is_protected rebuilt
    - Never protected when suspicious: a fake "order confirmation" must not
      get the green "Receipt - Safe" badge or escape Clean Up.
    - "your ... purchase" now counts as payment proof alongside "your ...
      order" (Etsy: "Your Etsy Purchase from EveryFabric (4175367477)");
      "your next/first purchase" stays promo wording.
    - Otherwise unchanged from 20260924030000.

  3. Existing suspicious emails are re-filed as clutter (junk).

  Mirrors supabase/functions/_shared/scam.ts and payment_proof.ts - keep in sync.
  Generated columns can't reference each other, so the scam rule is repeated
  inside is_protected.
*/

DROP INDEX IF EXISTS public.idx_emails_user_id_protected;
ALTER TABLE public.emails DROP COLUMN IF EXISTS is_protected;

ALTER TABLE public.emails
  ADD COLUMN is_suspicious boolean
  GENERATED ALWAYS AS (
    (
      coalesce(subject, '') ~* '(order|invoice|receipt|payment|purchase|subscription|renew|refund|transaction|billing|confirm|account (suspended|locked|on hold)|verify your)'
      AND (
        split_part(lower(sender), '@', 1) ~ '[bcdfghjklmnpqrstvwxz]{6,}'
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
        split_part(lower(sender), '@', 1) ~ '[bcdfghjklmnpqrstvwxz]{6,}'
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
   SET category = 'clutter',
       importance_reason = NULL
 WHERE is_suspicious
   AND category <> 'clutter';
