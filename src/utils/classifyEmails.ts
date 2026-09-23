export interface EmailClassification {
  category: 'important' | 'clutter' | 'bundle';
  importance_reason?: string;
  bundle_type?: string;
}

const importantDomains = [
  'bank', 'chase', 'wellsfargo', 'bofa', 'paypal', 'venmo',
  'irs.gov', 'gov', 'airline', 'uber', 'lyft', 'amazon', 'delivery',
  'calendar', 'meeting', 'zoom', 'teams', 'google.com/calendar'
];

const clutterKeywords = [
  'unsubscribe', 'newsletter', 'promotion', 'deal', 'sale', 'discount',
  'offer', 'coupon', 'marketing', 'advertising', 'digest', 'weekly',
  'daily', 'notification', 'alert', 'update', 'no-reply', 'noreply'
];

const bundleTypes = {
  promotions: ['promo', 'sale', 'deal', 'discount', 'offer', 'coupon'],
  newsletters: ['newsletter', 'digest', 'weekly', 'daily', 'roundup'],
  notifications: ['notification', 'alert', 'reminder', 'update'],
  social: ['facebook', 'twitter', 'instagram', 'linkedin', 'social']
};

export const classifyEmail = (email: {
  sender: string;
  sender_name?: string;
  subject: string;
  snippet?: string;
  has_attachment?: boolean;
  is_reply?: boolean;
  is_starred?: boolean;
}): EmailClassification => {
  const lowerSender = email.sender.toLowerCase();
  const lowerSubject = email.subject.toLowerCase();
  const lowerSnippet = (email.snippet || '').toLowerCase();
  const fullText = `${lowerSender} ${lowerSubject} ${lowerSnippet}`;

  if (email.is_starred) {
    return {
      category: 'important',
      importance_reason: 'Starred message'
    };
  }

  if (email.is_reply) {
    return {
      category: 'important',
      importance_reason: 'Reply or thread'
    };
  }

  if (importantDomains.some(domain => lowerSender.includes(domain))) {
    const reason = lowerSender.includes('bank') || lowerSender.includes('chase') || lowerSender.includes('wellsfargo')
      ? 'Financial or account-related'
      : lowerSender.includes('calendar') || lowerSubject.includes('meeting') || lowerSubject.includes('invite')
      ? 'Calendar invite'
      : lowerSender.includes('amazon') || lowerSender.includes('delivery') || lowerSubject.includes('delivered')
      ? 'Delivery notification'
      : 'Important sender';

    return {
      category: 'important',
      importance_reason: reason
    };
  }

  if (lowerSubject.includes('invoice') || lowerSubject.includes('receipt') || lowerSubject.includes('payment')) {
    return {
      category: 'important',
      importance_reason: 'Financial or account-related'
    };
  }

  if (lowerSubject.includes('password') || lowerSubject.includes('security') || lowerSubject.includes('verification')) {
    return {
      category: 'important',
      importance_reason: 'Security or account-related'
    };
  }

  if (email.has_attachment && !clutterKeywords.some(kw => fullText.includes(kw))) {
    return {
      category: 'important',
      importance_reason: 'Has attachment'
    };
  }

  if (!lowerSender.includes('noreply') && !lowerSender.includes('no-reply') && !clutterKeywords.some(kw => fullText.includes(kw))) {
    const senderParts = lowerSender.split('@');
    if (senderParts.length === 2 && !senderParts[0].includes('marketing') && !senderParts[0].includes('info')) {
      return {
        category: 'important',
        importance_reason: 'From real person'
      };
    }
  }

  for (const [bundleType, keywords] of Object.entries(bundleTypes)) {
    if (keywords.some(kw => fullText.includes(kw))) {
      return {
        category: 'bundle',
        bundle_type: bundleType.charAt(0).toUpperCase() + bundleType.slice(1)
      };
    }
  }

  if (clutterKeywords.some(kw => fullText.includes(kw))) {
    return {
      category: 'clutter'
    };
  }

  return {
    category: 'important',
    importance_reason: 'Default classification'
  };
};

export const classifyEmails = (emails: Array<{
  sender: string;
  sender_name?: string;
  subject: string;
  snippet?: string;
  has_attachment?: boolean;
  is_reply?: boolean;
  is_starred?: boolean;
}>): Array<EmailClassification> => {
  return emails.map(email => classifyEmail(email));
};
