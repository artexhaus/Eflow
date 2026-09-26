// Company details used by the legal pages and footer. All legal documents are
// issued by the parent company; no personal names or addresses appear.
export const LEGAL = {
  company: 'Artexhaus',
  product: 'Eflow',
  website: 'https://eflowapp.org',
  // Set up forwarding for this address at the domain registrar (Namecheap
  // offers free email forwarding) so messages reach you.
  contactEmail: 'support@eflowapp.org',
  // TODO before launch: the state/country whose laws govern the Terms - usually
  // where Artexhaus is registered, e.g. 'the State of Delaware, United States'.
  governingLaw: '[STATE], United States',
  // "Last updated" date shown on every legal page (YYYY-MM-DD; shown in the
  // reader's language).
  effectiveDate: '2026-09-25',
} as const;
