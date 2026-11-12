// Product analytics and error tracking (PostHog), privacy-first:
// - Production only, and off when the browser sends Do Not Track.
// - No session recording, no automatic click capture, all page text masked:
//   Eflow shows people's email subjects and senders, and none of that may
//   leave the browser. Only the named events below are sent.
// - People are identified by their Eflow account id, never their email.
// - Query strings and #fragments are stripped from URLs (password-reset and
//   sign-in links carry one-time tokens there).
// PostHog loads after the page, so it never slows down the first screen.
import type { PostHog } from 'posthog-js';

// Project API keys are public by design (they can only send events).
const POSTHOG_KEY = 'phc_kYaEUTHpeeFzwPB7Z4mGrE3c7qYfdv9RbVrnjo3FamjL';
const POSTHOG_HOST = 'https://us.i.posthog.com';

type Props = Record<string, string | number | boolean | null | undefined>;

let client: PostHog | null = null;
let loading = false;
const queue: ((ph: PostHog) => void)[] = [];

function enabled(): boolean {
  if (!import.meta.env.PROD) return false;
  const dnt = navigator.doNotTrack ?? (window as unknown as { doNotTrack?: string }).doNotTrack;
  return dnt !== '1' && dnt !== 'yes';
}

const cleanUrl = (value: unknown) => {
  if (typeof value !== 'string') return value;
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`;
  } catch {
    return value.split(/[?#]/)[0];
  }
};

export function initAnalytics() {
  if (loading || !enabled()) return;
  loading = true;
  const start = () =>
    import('posthog-js')
      .then(({ default: posthog }) => {
        posthog.init(POSTHOG_KEY, {
          api_host: POSTHOG_HOST,
          persistence: 'localStorage',
          person_profiles: 'identified_only',
          autocapture: false,
          capture_pageview: true,
          capture_pageleave: false,
          capture_heatmaps: false,
          capture_dead_clicks: false,
          rageclick: false,
          disable_session_recording: true,
          disable_surveys: true,
          disable_web_experiments: true,
          mask_all_text: true,
          mask_all_element_attributes: true,
          respect_dnt: true,
          capture_exceptions: true,
          before_send: (event) => {
            if (!event) return event;
            const props = event.properties ?? {};
            for (const key of Object.keys(props)) {
              if (/url|referrer|href/i.test(key)) props[key] = cleanUrl(props[key]);
            }
            return event;
          },
        });
        client = posthog;
        queue.splice(0).forEach((fn) => fn(posthog));
      })
      .catch(() => {
        // Blocked by an ad blocker or offline: the app works the same without it.
        queue.length = 0;
      });
  if (document.readyState === 'complete') setTimeout(start, 0);
  else window.addEventListener('load', () => setTimeout(start, 0), { once: true });
}

function run(fn: (ph: PostHog) => void) {
  if (!enabled()) return;
  if (client) fn(client);
  else if (queue.length < 50) queue.push(fn);
}

export function track(event: string, props?: Props) {
  run((ph) => ph.capture(event, props));
}

export function identifyUser(userId: string, props?: Props) {
  run((ph) => ph.identify(userId, props));
}

export function resetAnalytics() {
  run((ph) => ph.reset());
}

// For errors the app catches and shows to the user itself (so they never
// reach the automatic error capture), but that we still want to see.
export function trackError(error: unknown, context: string) {
  const err = error instanceof Error ? error : new Error(String(error));
  run((ph) => ph.captureException(err, { context }));
}
