/*
  # Community chatter is never a protected bill or receipt

  1. Rule
    - PERSONAL FINANCIAL DOCUMENTS are protected: transactional wording
      ("your receipt", "your Amazon.com order", "payment received",
      "your <company> bill is ready", "order confirmation", ...) in an email
      that is NOT chatter. "your next/first order" (promo wording) is not.
    - COMMUNITY CHATTER is never protected, whatever its subject says: email
      from a forum, social app, community feed, mailing list or news source,
      where someone else is talking about money ("My DWP bill was 1800").

  2. What counts as chatter (any one is enough)
    - A List-Id header (mailing lists, forums, discussion groups; RFC 2919).
      Captured by imap-fetch from the next scan on.
    - A community/social platform domain (nextdoor.com, reddit, Facebook
      notifications, Google Groups, Patch, Meetup, ...).
    - A feed-like label in the sender's domain (news., community., forums.,
      groups., lists., digest., outreach.) or mailbox (digest@, newsletter@,
      community@, outreach@, ...).
    - A feed-like display name ("... Trending Posts", "Your ... neighbors",
      "... Digest", "... Newsletter", "... News").

  3. Changes
    - New column emails.list_id.
    - emails.is_protected rebuilt as: receipt wording AND NOT chatter.
      (Dropped and re-added: a generated column's expression can't be altered
      in place before Postgres 17. Values recompute for every row.)
    - Existing chatter that the old scan filed as "important" is re-filed as
      "clutter" (junk) so it can be bulk-cleaned without a rescan. New scans
      classify it as clutter directly (imap-fetch, _shared/chatter.ts).

  The same chatter rule lives in supabase/functions/_shared/chatter.ts; keep
  the two in sync.
*/

ALTER TABLE public.emails ADD COLUMN IF NOT EXISTS list_id text;

DROP INDEX IF EXISTS public.idx_emails_user_id_protected;
ALTER TABLE public.emails DROP COLUMN IF EXISTS is_protected;

ALTER TABLE public.emails
  ADD COLUMN is_protected boolean
  GENERATED ALWAYS AS (
    coalesce(subject, '') ~* '\y(receipts? (from|for)|receipt #|invoices? (#|no\.?|number|from|for|is|available|due|paid)|your (?!(next|first) )([\w.&''-]+ ){0,3}(bills?|statements?|receipts?|invoices?|orders?)|(bill|statement)s? (is|are) (ready|available|due|now)|billing statement|paid in full|has been paid|you paid|you sent (a )?payment|sent you (a )?payment|payments? (received|confirmed|confirmation|successful|processed|complete|scheduled|due|sent|of)|order confirm(ed|ation)|purchase confirm(ed|ation)|refund(ed)? (issued|processed|approved|of)|your refund|transaction (receipt|confirmation|alert))\y'
    AND NOT (
      list_id IS NOT NULL
      OR lower(sender) ~ '@([a-z0-9-]+\.)*(nextdoor\.com|facebookmail\.com|reddit\.com|redditmail\.com|quora\.com|quoramail\.com|patch\.com|googlegroups\.com|groups\.io|yahoogroups\.com|meetup\.com|meetupmail\.com|stackexchange\.com|stackoverflow\.email|tumblr\.com|pinterest\.com|twitter\.com|x\.com|instagram\.com|tiktok\.com|discord\.com|discordapp\.com|youtube\.com|twitch\.tv|strava\.com|goodreads\.com|medium\.com|disqus\.com)$'
      OR lower(sender) ~ '@([a-z0-9-]+\.)*(news|newsletters?|community|forums?|groups?|lists|digest|outreach)\.'
      OR split_part(lower(sender), '@', 1) ~ '^(news|newsletters?|digest|community|forums?|groups?|discuss(ions?)?|outreach|posts?|social|trending)([+._-]|$)'
      OR coalesce(sender_name, '') ~* '\y(trending|neighbou?rs?|digest|newsletter|community|forum|discussions?|posts|news)\y'
    )
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_emails_user_id_protected
  ON public.emails(user_id)
  WHERE is_protected;

UPDATE public.emails
   SET category = 'clutter',
       importance_reason = NULL
 WHERE category = 'important'
   AND (
      list_id IS NOT NULL
      OR lower(sender) ~ '@([a-z0-9-]+\.)*(nextdoor\.com|facebookmail\.com|reddit\.com|redditmail\.com|quora\.com|quoramail\.com|patch\.com|googlegroups\.com|groups\.io|yahoogroups\.com|meetup\.com|meetupmail\.com|stackexchange\.com|stackoverflow\.email|tumblr\.com|pinterest\.com|twitter\.com|x\.com|instagram\.com|tiktok\.com|discord\.com|discordapp\.com|youtube\.com|twitch\.tv|strava\.com|goodreads\.com|medium\.com|disqus\.com)$'
      OR lower(sender) ~ '@([a-z0-9-]+\.)*(news|newsletters?|community|forums?|groups?|lists|digest|outreach)\.'
      OR split_part(lower(sender), '@', 1) ~ '^(news|newsletters?|digest|community|forums?|groups?|discuss(ions?)?|outreach|posts?|social|trending)([+._-]|$)'
      OR coalesce(sender_name, '') ~* '\y(trending|neighbou?rs?|digest|newsletter|community|forum|discussions?|posts|news)\y'
    );
