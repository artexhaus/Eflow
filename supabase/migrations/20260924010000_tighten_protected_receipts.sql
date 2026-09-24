/*
  # Tighten "Paid & Verified" matching

  1. Problem
    - The first version protected any subject containing words like "bill",
      "statement" or "paid" on their own. Neighbourhood posts ("My DWP bill
      was 1800"), newsletters ("SD20 Bills Headed to the Governor's Desk")
      and chatter ("Just got my October bill") were locked in as receipts
      and could never be cleaned up.

  2. Change
    - Match receipt/bill *phrasing* instead of single words: "your receipt",
      "receipt from/for", "invoice #", "your <company> bill", "bill is ready",
      "payment received/of/due", "you sent a payment", "order confirmation",
      "your order", "refund processed", "paid in full", ...
    - Still deliberately generous with real transactional wording.

  3. Mechanics
    - A generated column's expression can't be altered in place before
      Postgres 17, so the column (and its index) is dropped and re-added;
      values are recomputed for every existing row.
    - Postgres regex uses \y for word boundaries (\b means backspace there).
*/

DROP INDEX IF EXISTS public.idx_emails_user_id_protected;
ALTER TABLE public.emails DROP COLUMN IF EXISTS is_protected;

ALTER TABLE public.emails
  ADD COLUMN is_protected boolean
  GENERATED ALWAYS AS (
    coalesce(subject, '') ~* '\y(receipts? (from|for)|your receipt|receipt #|invoices? (#|no\.?|number|from|for|is|available|due|paid)|your invoice|your ([\w&-]+ ){0,3}(bill|statement)s?|(bill|statement)s? (is|are) (ready|available|due|now)|billing statement|paid in full|has been paid|you paid|you sent (a )?payment|sent you (a )?payment|payments? (received|confirmed|confirmation|successful|processed|complete|scheduled|due|sent|of)|order confirm(ed|ation)|your order|purchase confirm(ed|ation)|refund(ed)? (issued|processed|approved|of)|your refund|transaction (receipt|confirmation|alert))\y'
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_emails_user_id_protected
  ON public.emails(user_id)
  WHERE is_protected;
