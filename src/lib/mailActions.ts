import { supabase } from './supabase';

export type MailAction = 'delete' | 'archive' | 'mark_read';

export type MailActionTarget =
  | { emailIds: string[] }
  | { category: string | string[] }
  | { bundleId: string }
  | { sender: string };

export interface MailActionResult {
  processed: number;
  failed: number;
  total: number;
  protectedSkipped: number;
}

// Thrown when a Free-plan clean-up would go over the monthly limit. The server
// refuses these requests before touching the mailbox, so nothing changed.
export class UsageLimitError extends Error {
  constructor(
    message: string,
    public limit: number,
    public used: number,
    public remaining: number,
    public requested: number
  ) {
    super(message);
  }
}

// What a running action is doing, for the "hold tight" progress popup.
export interface MailActionProgress {
  action: MailAction;
  count?: number;
  label?: string;
}

export interface MailActionOptions {
  // Emails affected, when the caller knows it; shown in the progress popup.
  count?: number;
  // Overrides the popup's wording, e.g. "emails from Groupon".
  label?: string;
  // Skip the global progress popup, for screens with their own full-screen
  // progress state (Simple view clean-up, Inbox Reset).
  silent?: boolean;
  // "Delete anyway": act on a protected bill/receipt. The server honours this
  // only for a single email, never for bulk actions.
  allowProtected?: boolean;
}

// Lets app-wide layers react to every mail action without each screen wiring
// it up: the progress popup, opening the upgrade screen on a limit, and
// refreshing usage after a clean-up. Screens still show errors themselves.
interface MailActionListener {
  onStart?: (progress: MailActionProgress) => void;
  onFinish?: () => void;
  onUsageLimit?: (error: UsageLimitError) => void;
  onCleaned?: () => void;
}
const listeners = new Set<MailActionListener>();

export function addMailActionListener(listener: MailActionListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const notify = (fn: (l: MailActionListener) => void) => listeners.forEach(fn);

// Applies an action on the user's real mail server via imap-apply-actions.
// The edge function is the only place that updates the emails table, and it
// only does so for messages the server confirmed, so the app never shows an
// email as gone while it is still in the user's inbox.
export async function applyMailAction(
  action: MailAction,
  target: MailActionTarget,
  options: MailActionOptions = {}
): Promise<MailActionResult> {
  const count = options.count ?? ('emailIds' in target ? target.emailIds.length : undefined);
  if (!options.silent) notify((l) => l.onStart?.({ action, count, label: options.label }));
  try {
    return await runMailAction(action, target, options.allowProtected === true);
  } finally {
    if (!options.silent) notify((l) => l.onFinish?.());
  }
}

async function runMailAction(
  action: MailAction,
  target: MailActionTarget,
  allowProtected: boolean
): Promise<MailActionResult> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Your session expired. Please sign in again.');

  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/imap-apply-actions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action, ...target, ...(allowProtected ? { allowProtected: true } : {}) }),
  });

  const body = await response.json().catch(() => ({}));
  if (response.status === 402 && body.code === 'usage_limit') {
    const error = new UsageLimitError(body.error, body.limit, body.used, body.remaining, body.requested);
    notify((l) => l.onUsageLimit?.(error));
    throw error;
  }
  if (!response.ok) {
    throw new Error(body.error || 'Could not reach your mail server. Please try again.');
  }

  const result: MailActionResult = {
    processed: body.processed ?? 0,
    failed: body.failed ?? 0,
    total: body.total ?? 0,
    protectedSkipped: body.protected_skipped ?? 0,
  };
  if (action !== 'mark_read') notify((l) => l.onCleaned?.());
  if (result.failed > 0 && result.processed === 0) {
    throw new Error('Your mail server rejected the request. Nothing was changed - please try again.');
  }
  return result;
}

export function describePartialFailure(result: MailActionResult): string {
  if (result.failed === 0) return '';
  return `${result.processed.toLocaleString()} of ${result.total.toLocaleString()} emails were handled. ` +
    `${result.failed.toLocaleString()} couldn't be processed by your mail server and are still shown - try again.`;
}
