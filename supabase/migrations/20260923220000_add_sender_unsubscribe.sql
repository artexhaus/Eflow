/*
  # Sender grouping and one-click unsubscribe

  1. Changes to `emails`
    - `list_unsubscribe` (text) - raw List-Unsubscribe header value, e.g.
      "<https://example.com/u?id=1>, <mailto:unsub@example.com>"
    - `list_unsubscribe_post` (boolean) - true when the sender advertises
      RFC 8058 one-click unsubscribe (List-Unsubscribe-Post: List-Unsubscribe=One-Click)

  2. New table `sender_actions`
    - Remembers per-sender decisions across rescans (a rescan wipes and
      rebuilds `emails`, so this can't live there).
    - `sender` is stored lowercased; one row per (user_id, sender).
    - `unsubscribe_status`:
        'unsubscribed' - the one-click request was accepted by the sender
        'link_opened'  - the user was sent to the sender's unsubscribe page
                         or mail app; we can't confirm the outcome

  3. Security
    - RLS: users can only read and write their own rows.
*/

ALTER TABLE public.emails ADD COLUMN IF NOT EXISTS list_unsubscribe text;
ALTER TABLE public.emails ADD COLUMN IF NOT EXISTS list_unsubscribe_post boolean DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_emails_user_id_sender ON public.emails(user_id, lower(sender));

CREATE TABLE IF NOT EXISTS public.sender_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  sender text NOT NULL,
  unsubscribe_status text CHECK (unsubscribe_status IN ('unsubscribed', 'link_opened')),
  unsubscribed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE (user_id, sender)
);

ALTER TABLE public.sender_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own sender actions"
  ON public.sender_actions FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own sender actions"
  ON public.sender_actions FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own sender actions"
  ON public.sender_actions FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own sender actions"
  ON public.sender_actions FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());
