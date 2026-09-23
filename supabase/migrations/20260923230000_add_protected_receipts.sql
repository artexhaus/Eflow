/*
  # "Paid & Verified" protection for bills and receipts

  1. Changes to `emails`
    - `is_protected` (boolean, generated) - true when the subject looks like a
      bill, receipt, payment confirmation, order confirmation or refund.

  2. Why a generated column
    - It is the single definition of "Paid & Verified": the app reads it to
      fill the tab, and imap-apply-actions reads it to refuse archiving or
      deleting these emails no matter which screen asked.
    - It applies to existing rows immediately, without a rescan.
    - The match deliberately errs towards protecting: a promo that mentions
      "your bill" is kept, which is far cheaper than losing a real receipt.
*/

ALTER TABLE public.emails
  ADD COLUMN IF NOT EXISTS is_protected boolean
  GENERATED ALWAYS AS (
    coalesce(subject, '') ~* '\m(receipts?|invoices?|bills?|billing|statements?|paid|payments? (received|confirmed|confirmation|successful|processed|complete|scheduled|due|sent|of)|sent (you )?a payment|order confirm(ed|ation)|your order|purchase confirm(ed|ation)|refund(ed)?|transaction)\M'
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_emails_user_id_protected
  ON public.emails(user_id)
  WHERE is_protected;
