import type { ReactNode } from 'react';
import { ChevronLeft, Mail } from 'lucide-react';
import { LEGAL } from '../lib/legal';
import { PRICES, FREE_MONTHLY_LIMIT, FREE_UNSUBSCRIBE_LIMIT } from '../lib/billing';
import LegalLinks from './LegalLinks';
import LanguageToggle from './LanguageToggle';
import { useI18n, type MessageKey } from '../lib/i18n';

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
          <><strong>Your browser:</strong> {product} remembers small preferences (like Simple view and your language) in your browser&apos;s local storage. We don&apos;t use advertising or tracking cookies.</>,
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
          <><strong>Your email provider</strong> (such as Gmail, Yahoo, AOL, Outlook or iCloud) - {product} connects to your mailbox using the app password you provide.</>,
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
          `Free: clean up to ${FREE_MONTHLY_LIMIT} emails and unsubscribe from up to ${FREE_UNSUBSCRIBE_LIMIT} senders per calendar month, acting on one email or sender at a time. Receipt protection and scam warnings are included on every plan.`,
          `Pro: unlimited cleaning and unsubscribes, bulk actions (selecting many emails or senders at once) and receipt export, for ${PRICES.monthly.amount} per ${PRICES.monthly.per} or ${PRICES.annual.amount} per ${PRICES.annual.per}, plus any applicable taxes. Monthly and yearly plans include the same features.`,
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


// Spanish translations of the three documents. The English versions govern;
// the note at the top of each Spanish page says so.
function PrivacyEs() {
  return (
    <>
      <P>
        Esta política explica qué recopila {product} (&ldquo;{product}&rdquo;, &ldquo;nosotros&rdquo;), un producto de {company},
        cuando usas {website}, por qué lo hace y qué opciones tienes. Creamos {product} para ordenar tu bandeja de entrada, no
        para lucrar con tus datos: no vendemos tu información, no te mostramos anuncios y no usamos tus correos para entrenar
        modelos de IA.
      </P>

      <H2>Qué recopilamos</H2>
      <UL
        items={[
          <><strong>Tu cuenta de {product}:</strong> tu dirección de correo y tu contraseña. Nuestro proveedor de autenticación guarda las contraseñas como un hash irreversible; no podemos leerlas.</>,
          <><strong>La conexión de tu buzón:</strong> la dirección del buzón que conectas, el proveedor que usa y la contraseña de aplicación que creas para {product}. La contraseña de aplicación se cifra antes de guardarse.</>,
          <><strong>Datos sobre tus correos:</strong> de los mensajes de tu bandeja de entrada guardamos el nombre y la dirección del remitente, el asunto, la fecha, si se leyó, si tiene archivos adjuntos y los encabezados de listas de correo (como los enlaces para darse de baja). <strong>No</strong> descargamos ni guardamos el contenido de tus correos ni sus archivos adjuntos.</>,
          <><strong>Lo que haces en {product}:</strong> qué correos limpias, de qué remitentes te das de baja y cuántos correos limpias cada mes (para el límite del plan Gratis).</>,
          <><strong>Facturación:</strong> si te suscribes, los pagos los gestiona Stripe. Guardamos tu plan, el estado de tu suscripción y tu ID de cliente de Stripe. Nunca vemos ni guardamos el número de tu tarjeta.</>,
          <><strong>Tu navegador:</strong> {product} recuerda pequeñas preferencias (como la vista simple o el idioma) en el almacenamiento local de tu navegador. No usamos cookies de publicidad ni de seguimiento.</>,
        ]}
      />

      <H2>Cómo lo usamos</H2>
      <UL
        items={[
          'Para ordenar tu bandeja de entrada (por ejemplo, en correos importantes, desorden, recibos y posibles estafas) y mostrarte los resultados.',
          'Para realizar las acciones que eliges: archivar, eliminar o marcar correos como leídos en tu buzón, y enviar solicitudes de baja a los remitentes que elijas. Solo modificamos tu buzón cuando nos lo pides.',
          'Para gestionar tu cuenta y tu suscripción, aplicar los límites de cada plan y enviarte correos esenciales de la cuenta (como el restablecimiento de contraseña).',
          'Para mantener el servicio seguro, corregir problemas y mejorarlo.',
        ]}
      />

      <H2>Con quién lo compartimos</H2>
      <P>Solo compartimos información con los proveedores que hacen funcionar {product}, y solo lo que necesitan:</P>
      <UL
        items={[
          <><strong>Supabase</strong>: nuestra base de datos, autenticación y funciones del servidor.</>,
          <><strong>Stripe</strong>: procesamiento de pagos y gestión de suscripciones.</>,
          <><strong>Vercel</strong>: alojamiento del sitio web de {product}.</>,
          <><strong>Tu proveedor de correo</strong> (como Gmail, Yahoo, AOL, Outlook o iCloud): {product} se conecta a tu buzón con la contraseña de aplicación que nos das.</>,
          <><strong>Los remitentes de los que te das de baja</strong>: cuando nos lo pides, les enviamos la solicitud de baja que ofrece su correo.</>,
        ]}
      />
      <P>También podemos divulgar información si la ley lo exige, o para proteger los derechos y la seguridad de nuestros usuarios o de {company}.</P>

      <H2>Cuánto tiempo lo guardamos</H2>
      <P>
        Guardamos tu información mientras tu cuenta esté abierta. <strong>Desconectar buzón</strong> (en Cuenta) elimina la
        contraseña de aplicación guardada y todos los datos guardados de tus correos. <strong>Eliminar cuenta</strong> borra tu
        cuenta y todo lo anterior. Stripe conserva los registros de pago que la ley le obliga a conservar. Las copias de
        seguridad se sobrescriben de forma periódica.
      </P>

      <H2>Seguridad</H2>
      <P>
        Las conexiones con {product} y con tu buzón están cifradas en tránsito, y las contraseñas de aplicación se guardan
        cifradas. Cada cuenta solo puede acceder a sus propios datos. También puedes revocar el acceso de {product} en cualquier
        momento eliminando la contraseña de aplicación en la configuración de seguridad de tu proveedor de correo.
      </P>

      <H2>Tus opciones y derechos</H2>
      <P>
        Puedes ver y eliminar tus datos en la aplicación en cualquier momento. Según dónde vivas, puedes tener derecho a
        acceder, corregir, exportar o eliminar tu información personal, o a oponerte a ciertos usos. Para hacer una solicitud,
        escribe a <Contact />.
      </P>

      <H2>Menores</H2>
      <P>{product} no está dirigido a menores de 13 años y no recopilamos su información a sabiendas.</P>

      <H2>Cambios</H2>
      <P>Si cambiamos esta política, actualizaremos la fecha de arriba y, si los cambios son importantes, te avisaremos en la aplicación o por correo.</P>

      <H2>Contacto</H2>
      <P>
        {company} · <Contact />
      </P>
    </>
  );
}

function TermsEs() {
  return (
    <>
      <P>
        Estos términos son un acuerdo entre tú y {company} (&ldquo;nosotros&rdquo;) sobre tu uso de {product} en {website}. Al
        crear una cuenta o usar {product}, los aceptas.
      </P>

      <H2>Tu cuenta</H2>
      <UL
        items={[
          'Debes tener al menos 13 años y, para comprar una suscripción, la edad necesaria para celebrar un contrato vinculante donde vives.',
          'Mantén en privado tu contraseña y tus contraseñas de aplicación. Eres responsable de la actividad de tu cuenta.',
          'Conecta solo buzones que te pertenezcan o que estés autorizado a gestionar.',
        ]}
      />

      <H2>Lo que autorizas</H2>
      <P>
        Al conectar un buzón, autorizas a {product} a leer los datos de sus mensajes y a archivar, eliminar o marcar correos como
        leídos, y a enviar solicitudes de baja, <strong>cuando tú lo elijas</strong>. Las acciones ocurren en tu buzón real: tu
        proveedor puede borrar de forma permanente los correos eliminados.
      </P>

      <H2>La clasificación automática no es perfecta</H2>
      <P>
        {product} clasifica los correos automáticamente (por ejemplo, &ldquo;importante&rdquo;, &ldquo;innecesario&rdquo;,
        &ldquo;recibo&rdquo; o &ldquo;parece una estafa&rdquo;). Estas etiquetas son estimaciones útiles, no garantías. Revisa lo que
        archivas o eliminas; no somos responsables de los correos que elimines, incluidos los que se hayan etiquetado mal. Las
        advertencias de estafa no sustituyen la protección contra spam de tu proveedor de correo.
      </P>

      <H2>Planes, facturación y cancelación</H2>
      <UL
        items={[
          `Gratis: limpia hasta ${FREE_MONTHLY_LIMIT} correos y date de baja de hasta ${FREE_UNSUBSCRIBE_LIMIT} remitentes por mes calendario, actuando sobre un correo o remitente a la vez. La protección de recibos y las advertencias de estafa se incluyen en todos los planes.`,
          `Pro: limpieza y bajas ilimitadas, acciones en bloque (seleccionar muchos correos o remitentes a la vez) y exportación de recibos, por ${PRICES.monthly.amount} al mes o ${PRICES.annual.amount} al año, más los impuestos que correspondan. Los planes mensual y anual incluyen las mismas funciones.`,
          'Las suscripciones se renuevan automáticamente al final de cada periodo de facturación hasta que las canceles. Puedes cancelar en cualquier momento en Cuenta > Administrar suscripción; Pro sigue activo hasta el final del periodo que pagaste.',
          'Podemos cambiar los precios avisándote antes de tu próxima renovación.',
          <>Los reembolsos se rigen por nuestra <a href="/refunds" className="text-ocean-700 underline">Política de reembolsos</a>.</>,
        ]}
      />

      <H2>Uso aceptable</H2>
      <P>
        No uses {product} para infringir la ley, acceder a buzones a los que no tienes permiso, interferir con el servicio ni
        intentar eludir los límites de los planes o la seguridad.
      </P>

      <H2>Servicios de terceros</H2>
      <P>
        {product} depende de tu proveedor de correo y de servicios como Stripe y Supabase. Los proveedores pueden limitar lo que
        ven las aplicaciones (por ejemplo, solo tus mensajes más recientes) o cambiar cómo funciona el acceso, lo que puede
        afectar a {product}.
      </P>

      <H2>Cierre de tu cuenta</H2>
      <P>
        Puedes eliminar tu cuenta en cualquier momento en Cuenta. Podemos suspender o cerrar cuentas que incumplan estos
        términos, y avisaremos cuando sea razonable.
      </P>

      <H2>Exenciones y responsabilidad</H2>
      <P>
        {product} se ofrece &ldquo;tal cual&rdquo;, sin garantías de ningún tipo, en la medida en que la ley lo permita. En la medida en
        que la ley lo permita, {company} no es responsable de pérdidas indirectas o consecuentes, incluida la pérdida de correos o
        datos, y nuestra responsabilidad total por cualquier reclamación se limita a lo que nos pagaste en los 12 meses
        anteriores a la reclamación.
      </P>

      <H2>Ley aplicable</H2>
      <P>Estos términos se rigen por las leyes de {governingLaw}, sin tener en cuenta sus normas sobre conflictos de leyes.</P>

      <H2>Cambios</H2>
      <P>Podemos actualizar estos términos. Actualizaremos la fecha de arriba y te avisaremos de los cambios importantes antes de que se apliquen.</P>

      <H2>Contacto</H2>
      <P>
        {company} · <Contact />
      </P>
    </>
  );
}

function RefundsEs() {
  return (
    <>
      <P>Queremos que Eflow Pro valga la pena. Así funcionan las cancelaciones y los reembolsos.</P>

      <H2>Cancela cuando quieras</H2>
      <P>
        Cancela en Cuenta &gt; Administrar suscripción. No se te volverá a cobrar, y Pro sigue activo hasta el final del periodo
        de facturación que ya pagaste.
      </P>

      <H2>Periodos parciales</H2>
      <P>No reembolsamos el tiempo no usado de un periodo mensual o anual después de cancelar.</P>

      <H2>Errores que corregimos</H2>
      <P>
        Si se te cobró dos veces, se te cobró después de cancelar o se te cobró por error, escribe a <Contact /> dentro de los 30
        días siguientes al cobro y te lo reembolsaremos. Si un plan anual se renovó y no querías mantenerlo, contáctanos dentro
        de los 30 días y lo resolveremos contigo.
      </P>

      <H2>Tus derechos legales</H2>
      <P>Esta política no limita los derechos de reembolso o cancelación que tengas según las leyes de donde vives.</P>

      <H2>Contacto</H2>
      <P>
        {company} · <Contact />
      </P>
    </>
  );
}

const PAGES: Record<LegalPageKind, { title: MessageKey; body: () => JSX.Element; bodyEs: () => JSX.Element }> = {
  privacy: { title: 'Privacy Policy', body: Privacy, bodyEs: PrivacyEs },
  terms: { title: 'Terms of Service', body: Terms, bodyEs: TermsEs },
  refunds: { title: 'Refund Policy', body: Refunds, bodyEs: RefundsEs },
};

export default function LegalPage({ page }: { page: LegalPageKind }) {
  const { lang, t, formatDate } = useI18n();
  const { title, body, bodyEs } = PAGES[page];
  const Body = lang === 'es' ? bodyEs : body;
  return (
    <div className="min-h-screen">
      <header className="bg-white border-b-2 border-ink/10">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-3">
          <a href="/" className="flex items-center gap-2 font-display font-bold text-ink text-xl">
            <span className="w-9 h-9 bg-mint-200 rounded-2xl flex items-center justify-center">
              <Mail className="w-5 h-5" />
            </span>
            {product}
          </a>
          <div className="flex items-center gap-3">
            <LanguageToggle />
            <a href="/" className="flex items-center gap-1 text-sm font-semibold text-ink/75 hover:text-ink">
              <ChevronLeft className="w-4 h-4" /> <span className="hidden min-[400px]:inline">{t('Back to Eflow')}</span>
              <span className="min-[400px]:hidden">{t('Back')}</span>
            </a>
          </div>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
        <article className="bg-white rounded-3xl border-2 border-ink/10 shadow-lg p-6 sm:p-10">
          <h1 className="font-display text-3xl sm:text-4xl font-bold text-ink mb-1">{t(title)}</h1>
          <p className="text-sm text-ink/60 mb-6">
            {company} · {t('Last updated {date}', { date: formatDate(`${effectiveDate}T12:00:00Z`) })}
          </p>
          {lang === 'es' && (
            <p className="text-sm bg-sunny-100 border-2 border-sunny-200 rounded-2xl p-3 mb-6 text-ink/80">
              Esta traducción se ofrece para tu comodidad. Si hay alguna diferencia con la versión en inglés, prevalece la
              versión en inglés.
            </p>
          )}
          <Body />
        </article>
        <LegalLinks className="mt-8" />
      </main>
    </div>
  );
}
