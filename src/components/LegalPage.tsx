import type { ReactNode } from 'react';
import { ChevronLeft, Mail } from 'lucide-react';
import { LEGAL } from '../lib/legal';
import { PRICES, FREE_MONTHLY_LIMIT } from '../lib/billing';
import LegalLinks from './LegalLinks';

export type LegalPageKind = 'privacy' | 'terms' | 'refunds';

const PATHS: Record<string, LegalPageKind> = {
  '/privacy': 'privacy',
  '/terms': 'terms',
  '/refunds': 'refunds',
};

export function legalPageForPath(path: string): LegalPageKind | null {
  return PATHS[path.replace(/\/+$/, '') || '/'] ?? null;
}

const { company, product, contactEmail, governingLaw, effectiveDate, website } = LEGAL;

function H2({ children }: { children: ReactNode }) {
  return <h2 className="font-display text-xl font-bold text-ink mt-8 mb-2">{children}</h2>;
}
function P({ children }: { children: ReactNode }) {
  return <p className="text-ink/85 leading-relaxed mb-3">{children}</p>;
}
function UL({ items }: { items: ReactNode[] }) {
  return (
    <ul className="list-disc pl-6 space-y-1.5 text-ink/85 leading-relaxed mb-3">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}
const Contact = () => (
  <a href={`mailto:${contactEmail}`} className="text-ocean-700 underline">
    {contactEmail}
  </a>
);

function Privacy() {
  return (
    <>
      <P>
        This policy explains what {product} (&ldquo;{product}&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;), a product of {company},
        collects when you use {website}, why, and the choices you have. We built {product} to tidy your inbox, not to
        profit from your data: we don&apos;t sell your information, show you ads, or use your emails to train AI models.
      </P>

      <H2>What we collect</H2>
      <UL
        items={[
          <><strong>Your {product} account:</strong> your email address and password. Passwords are stored by our authentication provider as a one-way hash; we can&apos;t read them.</>,
          <><strong>Your mailbox connection:</strong> the email address of the mailbox you connect, which provider it uses, and the app password you create for {product}. The app password is encrypted before it is stored.</>,
          <><strong>Details about your emails:</strong> for messages in your inbox we store the sender&apos;s name and address, the subject line, the date, whether it&apos;s been read, whether it has an attachment, and mailing-list headers (such as unsubscribe links). We do <strong>not</strong> download or store the body of your emails or their attachments.</>,
          <><strong>What you do in {product}:</strong> which emails you clean up, senders you unsubscribe from, and how many emails you&apos;ve cleaned each month (used for the Free plan limit).</>,
          <><strong>Billing:</strong> if you subscribe, payments are handled by Stripe. We store your plan, subscription status and Stripe customer ID. We never see or store your card number.</>,
          <><strong>Your browser:</strong> {product} remembers small preferences (like Simple view) in your browser&apos;s local storage. We don&apos;t use advertising or tracking cookies.</>,
        ]}
      />

      <H2>How we use it</H2>
      <UL
        items={[
          'To sort your inbox (for example into important emails, clutter, receipts and likely scams) and show you the results.',
          'To carry out the actions you choose: archiving, deleting or marking emails as read in your mailbox, and sending unsubscribe requests to senders you pick. We only change your mailbox when you ask us to.',
          'To run your account and subscription, enforce plan limits, and send essential account emails (like password resets).',
          'To keep the service secure, fix problems and improve it.',
        ]}
      />

      <H2>Who we share it with</H2>
      <P>We share information only with the providers that run {product} for us, and only what they need:</P>
      <UL
        items={[
          <><strong>Supabase</strong> - our database, authentication and server functions.</>,
          <><strong>Stripe</strong> - payment processing and subscription management.</>,
          <><strong>Vercel</strong> - hosting for the {product} website.</>,
          <><strong>Your email provider</strong> (such as Gmail, Yahoo, Outlook or iCloud) - {product} connects to your mailbox using the app password you provide.</>,
          <><strong>Senders you unsubscribe from</strong> - when you ask, we send them the unsubscribe request their email offers.</>,
        ]}
      />
      <P>We may also disclose information if the law requires it, or to protect the rights and safety of our users or {company}.</P>

      <H2>How long we keep it</H2>
      <P>
        We keep your information while your account is open. <strong>Disconnect mailbox</strong> (in Account) deletes the
        stored app password and all saved email details. <strong>Delete account</strong> removes your account and everything
        above. Stripe keeps payment records it is legally required to keep. Backups are overwritten on a rolling basis.
      </P>

      <H2>Security</H2>
      <P>
        Connections to {product} and to your mailbox are encrypted in transit, and app passwords are encrypted at rest. Each
        account can only access its own data. You can also revoke {product}&apos;s access at any time by deleting the app
        password in your email provider&apos;s security settings.
      </P>

      <H2>Your choices and rights</H2>
      <P>
        You can view and delete your data in the app at any time. Depending on where you live, you may have rights to
        access, correct, export or delete your personal information, or to object to certain uses. To make a request,
        email <Contact />.
      </P>

      <H2>Children</H2>
      <P>{product} isn&apos;t intended for children under 13, and we don&apos;t knowingly collect their information.</P>

      <H2>Changes</H2>
      <P>If we change this policy, we&apos;ll update the date above and, for significant changes, let you know in the app or by email.</P>

      <H2>Contact</H2>
      <P>
        {company} · <Contact />
      </P>
    </>
  );
}

function Terms() {
  return (
    <>
      <P>
        These terms are an agreement between you and {company} (&ldquo;we&rdquo;, &ldquo;us&rdquo;) for your use of {product} at{' '}
        {website}. By creating an account or using {product}, you agree to them.
      </P>

      <H2>Your account</H2>
      <UL
        items={[
          'You must be at least 13 years old, and old enough to form a binding contract where you live to buy a subscription.',
          'Keep your password and app passwords private. You are responsible for activity under your account.',
          'Only connect mailboxes you own or are authorized to manage.',
        ]}
      />

      <H2>What you authorize</H2>
      <P>
        When you connect a mailbox, you authorize {product} to read message details in it and to archive, delete or mark
        emails as read, and send unsubscribe requests, <strong>when you choose to</strong>. Actions happen in your real
        mailbox: deleted emails may be permanently removed by your provider.
      </P>

      <H2>Automatic sorting isn&apos;t perfect</H2>
      <P>
        {product} sorts emails automatically (for example &ldquo;important&rdquo;, &ldquo;clutter&rdquo;, &ldquo;receipt&rdquo; or
        &ldquo;looks like a scam&rdquo;). These labels are helpful guesses, not guarantees. Review what you archive or delete; we
        aren&apos;t responsible for emails you remove, including ones that were labelled incorrectly. Scam warnings don&apos;t
        replace your email provider&apos;s spam protection.
      </P>

      <H2>Plans, billing and cancellation</H2>
      <UL
        items={[
          `Free: clean up to ${FREE_MONTHLY_LIMIT} emails per calendar month.`,
          `Pro: ${PRICES.monthly.amount} per ${PRICES.monthly.per} or ${PRICES.annual.amount} per ${PRICES.annual.per}, plus any applicable taxes.`,
          'Subscriptions renew automatically at the end of each billing period until you cancel. You can cancel any time in Account > Manage Subscription; Pro stays active until the end of the period you paid for.',
          'We may change prices with notice before your next renewal.',
          <>Refunds are covered by our <a href="/refunds" className="text-ocean-700 underline">Refund Policy</a>.</>,
        ]}
      />

      <H2>Acceptable use</H2>
      <P>
        Don&apos;t use {product} to break the law, access mailboxes you&apos;re not allowed to, interfere with the service, or try
        to get around plan limits or security.
      </P>

      <H2>Third-party services</H2>
      <P>
        {product} depends on your email provider and on services like Stripe and Supabase. Providers may limit what apps can
        see (for example, only your most recent messages) or change how access works, which can affect {product}.
      </P>

      <H2>Ending your account</H2>
      <P>
        You can delete your account at any time in Account. We may suspend or end accounts that break these terms, and
        we&apos;ll give notice where reasonable.
      </P>

      <H2>Disclaimers and liability</H2>
      <P>
        {product} is provided &ldquo;as is&rdquo; without warranties of any kind, to the extent the law allows. To the extent the law
        allows, {company} isn&apos;t liable for indirect or consequential losses, including lost emails or data, and our total
        liability for any claim is limited to the amount you paid us in the 12 months before the claim.
      </P>

      <H2>Governing law</H2>
      <P>These terms are governed by the laws of {governingLaw}, without regard to conflict-of-law rules.</P>

      <H2>Changes</H2>
      <P>We may update these terms. We&apos;ll update the date above and tell you about significant changes before they apply.</P>

      <H2>Contact</H2>
      <P>
        {company} · <Contact />
      </P>
    </>
  );
}

function Refunds() {
  return (
    <>
      <P>We want Eflow Pro to be worth it. Here&apos;s how cancellations and refunds work.</P>

      <H2>Cancel any time</H2>
      <P>
        Cancel in Account &gt; Manage Subscription. You won&apos;t be charged again, and Pro stays active until the end of the
        billing period you already paid for.
      </P>

      <H2>Partial periods</H2>
      <P>We don&apos;t refund unused time in a monthly or yearly period after you cancel.</P>

      <H2>Mistakes we&apos;ll fix</H2>
      <P>
        If you were charged twice, charged after cancelling, or charged in error, email <Contact /> within 30 days of the
        charge and we&apos;ll refund it. If a yearly plan renewed and you didn&apos;t mean to keep it, contact us within 30 days
        and we&apos;ll work it out with you.
      </P>

      <H2>Your legal rights</H2>
      <P>This policy doesn&apos;t limit any refund or cancellation rights you have under the laws where you live.</P>

      <H2>Contact</H2>
      <P>
        {company} · <Contact />
      </P>
    </>
  );
}

const PAGES: Record<LegalPageKind, { title: string; body: () => JSX.Element }> = {
  privacy: { title: 'Privacy Policy', body: Privacy },
  terms: { title: 'Terms of Service', body: Terms },
  refunds: { title: 'Refund Policy', body: Refunds },
};

export default function LegalPage({ page }: { page: LegalPageKind }) {
  const { title, body: Body } = PAGES[page];
  return (
    <div className="min-h-screen">
      <header className="bg-white border-b-2 border-ink/10">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2 font-display font-bold text-ink text-xl">
            <span className="w-9 h-9 bg-mint-200 rounded-2xl flex items-center justify-center">
              <Mail className="w-5 h-5" />
            </span>
            {product}
          </a>
          <a href="/" className="flex items-center gap-1 text-sm font-semibold text-ink/75 hover:text-ink">
            <ChevronLeft className="w-4 h-4" /> Back to {product}
          </a>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
        <article className="bg-white rounded-3xl border-2 border-ink/10 shadow-lg p-6 sm:p-10">
          <h1 className="font-display text-3xl sm:text-4xl font-bold text-ink mb-1">{title}</h1>
          <p className="text-sm text-ink/60 mb-6">
            {company} · Last updated {effectiveDate}
          </p>
          <Body />
        </article>
        <LegalLinks className="mt-8" />
      </main>
    </div>
  );
}
