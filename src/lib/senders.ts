import { supabase } from './supabase';
import type { Email } from './types';

export interface SenderGroup {
  key: string;
  sender: string;
  name: string;
  count: number;
  unreadCount: number;
  importantCount: number;
  protectedCount: number;
  latest: string;
  exampleSubjects: string[];
  oneClick: boolean;
  unsubscribeLink: string | null;
}

// Extracts a link the user can open to unsubscribe from a List-Unsubscribe
// header. Only https: and mailto: are returned - the header is written by the
// sender, and anything else (e.g. javascript:) must never reach an href.
export function getUnsubscribeLink(listUnsubscribe: string | null): string | null {
  if (!listUnsubscribe) return null;
  const uris = [...listUnsubscribe.matchAll(/<([^>]+)>/g)].map((m) => m[1].trim());
  return (
    uris.find((u) => u.toLowerCase().startsWith('https://')) ??
    uris.find((u) => u.toLowerCase().startsWith('mailto:')) ??
    null
  );
}

// Groups emails by sender address, biggest senders first. Expects emails
// sorted newest first (as the dashboard loads them), so the first email seen
// for a sender supplies its latest date, display name and unsubscribe info.
export function groupBySender(emails: Email[]): SenderGroup[] {
  const groups = new Map<string, SenderGroup>();

  for (const email of emails) {
    const key = email.sender.toLowerCase();
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        sender: email.sender,
        name: email.sender_name || email.sender,
        count: 0,
        unreadCount: 0,
        importantCount: 0,
        protectedCount: 0,
        latest: email.timestamp,
        exampleSubjects: [],
        oneClick: false,
        unsubscribeLink: null,
      };
      groups.set(key, group);
    }

    group.count++;
    if (!email.is_read) group.unreadCount++;
    if (email.is_protected) group.protectedCount++;
    else if (email.category === 'important') group.importantCount++;
    if (group.exampleSubjects.length < 3) group.exampleSubjects.push(email.subject);
    if (!group.unsubscribeLink && email.list_unsubscribe) {
      group.unsubscribeLink = getUnsubscribeLink(email.list_unsubscribe);
      group.oneClick = Boolean(email.list_unsubscribe_post);
    }
  }

  return [...groups.values()].sort((a, b) => b.count - a.count);
}

export type UnsubscribeResult =
  | { status: 'unsubscribed' }
  | { status: 'limit' }
  | { status: 'needs_user'; url: string }
  | { status: 'unavailable'; message: string };

export async function requestOneClickUnsubscribe(sender: string): Promise<UnsubscribeResult> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Your session expired. Please sign in again.');

  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/unsubscribe`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ sender }),
  });

  const body = await response.json().catch(() => ({}));
  if (response.status === 402 && body.code === 'unsubscribe_limit') return { status: 'limit' };
  if (!response.ok) throw new Error(body.error || 'Could not unsubscribe. Please try again.');

  if (body.status === 'needs_user') {
    const safeUrl = getUnsubscribeLink(`<${body.url}>`);
    if (safeUrl) return { status: 'needs_user', url: safeUrl };
  }
  if (body.status === 'unsubscribed') return { status: 'unsubscribed' };
  return { status: 'unavailable', message: body.message || "This sender can't be unsubscribed from automatically." };
}

export async function recordUnsubscribeLinkOpened(userId: string, senderKey: string) {
  const { error } = await supabase.from('sender_actions').upsert(
    {
      user_id: userId,
      sender: senderKey,
      unsubscribe_status: 'link_opened',
      unsubscribed_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,sender' }
  );
  if (error) console.error('Failed to record unsubscribe:', error);
}
