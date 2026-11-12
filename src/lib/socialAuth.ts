import { supabase } from './supabase';
import { getLanguage } from './i18n';
import { track } from './analytics';

export type SocialProvider = 'google' | 'apple';

// Which of Google / Apple sign-in are switched on in Supabase. The sign-in
// screen only shows the buttons for providers that are set up, so nothing
// appears half-working while a provider is being configured.
let enabled: Promise<Record<SocialProvider, boolean>> | null = null;

export function fetchEnabledProviders(): Promise<Record<SocialProvider, boolean>> {
  enabled ??= fetch(`${import.meta.env.VITE_SUPABASE_URL}/auth/v1/settings`, {
    headers: { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY },
  })
    .then((response) => response.json())
    .then((settings) => ({ google: settings?.external?.google === true, apple: settings?.external?.apple === true }))
    .catch(() => {
      enabled = null; // try again next time the screen opens
      return { google: false, apple: false };
    });
  return enabled;
}

// Sends the browser to Google or Apple; Supabase brings it back here signed
// in (or with an error in the address, see readOAuthError).
export async function signInWithProvider(provider: SocialProvider) {
  track('social_sign_in_started', { provider });
  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: window.location.origin,
      // Google: always offer the account chooser, in the app's language.
      queryParams: provider === 'google' ? { prompt: 'select_account', hl: getLanguage() } : undefined,
    },
  });
  if (error) throw error;
}

// Read at module load, before supabase-js tidies the address: when someone
// cancels on the Google/Apple page, or the provider refuses, Supabase returns
// here with error details in the query string or the hash.
const returnParams = new URLSearchParams(
  `${window.location.search.slice(1)}&${window.location.hash.replace(/^#/, '')}`
);
const returnedWithError = returnParams.has('error') && returnParams.has('error_description');
if (returnedWithError) window.history.replaceState({}, '', window.location.pathname);

export function readOAuthError(): 'cancelled' | 'failed' | null {
  if (!returnedWithError) return null;
  const description = (returnParams.get('error_description') ?? '').toLowerCase();
  return returnParams.get('error') === 'access_denied' || description.includes('cancel') ? 'cancelled' : 'failed';
}
