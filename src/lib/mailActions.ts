import { supabase } from './supabase';
import { plural, t } from './i18n';
import { track } from './analytics';

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

// How far along a running action is, streamed from the server after each
// batch. 'connecting' = signing in to the mail server, before any email moves.
export interface MailActionStatus {
  stage: 'connecting' | 'working';
  done: number;
  total: number;
}

export interface MailActionOptions {
  // Emails affected, when the caller knows it; shown in the progress popup.
  count?: number;
  // Overrides the popup's wording, e.g. "emails from Groupon".
  label?: string;
  // Skip the global progress popup, for screens with their own full-screen
  // progress state (Simple view clean-up, Inbox Reset).
  silent?: boolean;
  // Include protected bills/receipts in an explicit emailIds selection, after
  // the user confirmed it. The server ignores this for category, sender and
  // bundle actions.
  allowProtected?: boolean;
  // Called as the server reports progress, for screens with their own
  // progress display (the global popup gets it through its listener).
  onProgress?: (status: MailActionStatus) => void;
}

// Lets app-wide layers react to every mail action without each screen wiring
// it up: the progress popup, opening the upgrade screen on a limit, and
// refreshing usage after a clean-up. Screens still show errors themselves.
interface MailActionListener {
  onStart?: (progress: MailActionProgress) => void;
  onProgress?: (status: MailActionStatus) => void;
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
    return await runMailAction(action, target, options.allowProtected === true, (status) => {
      options.onProgress?.(status);
      if (!options.silent) notify((l) => l.onProgress?.(status));
    });
  } finally {
    if (!options.silent) notify((l) => l.onFinish?.());
  }
}

async function runMailAction(
  action: MailAction,
  target: MailActionTarget,
  allowProtected: boolean,
  onProgress: (status: MailActionStatus) => void
): Promise<MailActionResult> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error(t('Your session expired. Please sign in again.'));

  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/imap-apply-actions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action, ...target, ...(allowProtected ? { allowProtected: true } : {}), stream: true }),
  });

  const streamed = response.ok && (response.headers.get('Content-Type') ?? '').includes('ndjson');
  const body = streamed ? await readProgressStream(response, onProgress) : await response.json().catch(() => ({}));
  if (response.status === 402 && body.code === 'usage_limit') {
    // Worded here rather than taken from the server, so it's in the user's language.
    const message =
      body.remaining === 0
        ? t("You've cleaned {n} emails this month, the Free plan limit. Upgrade to Pro for unlimited cleaning.", { n: body.limit })
        : plural(
            body.remaining,
            'This would clean {requested} emails, but you have {n} free clean left this month. Upgrade to Pro for unlimited cleaning.',
            'This would clean {requested} emails, but you have {n} free cleans left this month. Upgrade to Pro for unlimited cleaning.',
            { requested: body.requested }
          );
    const error = new UsageLimitError(message, body.limit, body.used, body.remaining, body.requested);
    track('usage_limit_hit', { action, requested: body.requested, remaining: body.remaining });
    notify((l) => l.onUsageLimit?.(error));
    throw error;
  }
  if (!response.ok) {
    track('mail_action_failed', { action, status: response.status });
    throw new Error(body.error || t('Could not reach your mail server. Please try again.'));
  }

  const result: MailActionResult = {
    processed: body.processed ?? 0,
    failed: body.failed ?? 0,
    total: body.total ?? 0,
    protectedSkipped: body.protected_skipped ?? 0,
  };
  track('emails_cleaned', {
    action,
    target: Object.keys(target)[0],
    processed: result.processed,
    failed: result.failed,
    protected_skipped: result.protectedSkipped,
  });
  if (action !== 'mark_read') notify((l) => l.onCleaned?.());
  if (result.failed > 0 && result.processed === 0) {
    throw new Error(t('Your mail server rejected the request. Nothing was changed - please try again.'));
  }
  return result;
}

// Reads the server's newline-delimited JSON: progress lines, then a final
// result (or error) line. Returns the result in the same shape as the
// non-streamed reply.
async function readProgressStream(
  response: Response,
  onProgress: (status: MailActionStatus) => void
): Promise<Record<string, unknown>> {
  if (!response.body) return response.json();
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let final: Record<string, unknown> | null = null;

  const handle = (line: string) => {
    if (!line.trim()) return;
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(line);
    } catch {
      return;
    }
    if (msg.type === 'progress') {
      onProgress({
        stage: msg.stage === 'connecting' ? 'connecting' : 'working',
        done: Number(msg.done) || 0,
        total: Number(msg.total) || 0,
      });
    } else if (msg.type === 'result' || msg.type === 'error') {
      final = msg;
    }
  };

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      handle(buffer.slice(0, nl));
      buffer = buffer.slice(nl + 1);
    }
  }
  handle(buffer + decoder.decode());

  const result = final as Record<string, unknown> | null;
  if (!result) throw new Error(t('Could not reach your mail server. Please try again.'));
  if (result.type === 'error') throw new Error(String(result.error || t('Could not reach your mail server. Please try again.')));
  return result;
}

export function describePartialFailure(result: MailActionResult): string {
  if (result.failed === 0) return '';
  return t(
    "{processed} of {total} emails were handled. {failed} couldn't be processed by your mail server and are still shown - try again.",
    { processed: result.processed, total: result.total, failed: result.failed }
  );
}
