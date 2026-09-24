// "Chatter": email from a community feed, forum, social app, mailing list or
// news source. When someone there talks about money ("My DWP bill was 1800"),
// it is still chatter - never a personal bill or receipt - so it is filed as
// junk and never protected.
//
// This rule also exists in SQL, inside the emails.is_protected generated
// column (supabase/migrations/20260924020000_chatter_is_never_protected.sql).
// Keep the two in sync.

// Platforms whose email is community/social notifications, not receipts.
// (Facebook ad receipts come from support.facebook.com, not facebookmail.com.)
const COMMUNITY_DOMAINS = [
  "nextdoor.com", "facebookmail.com", "reddit.com", "redditmail.com", "quora.com", "quoramail.com",
  "patch.com", "googlegroups.com", "groups.io", "yahoogroups.com", "meetup.com", "meetupmail.com",
  "stackexchange.com", "stackoverflow.email", "tumblr.com", "pinterest.com", "twitter.com", "x.com",
  "instagram.com", "tiktok.com", "discord.com", "discordapp.com", "youtube.com", "twitch.tv",
  "strava.com", "goodreads.com", "medium.com", "disqus.com",
];

const COMMUNITY_DOMAIN_RE = new RegExp(
  `@([a-z0-9-]+\\.)*(${COMMUNITY_DOMAINS.map((d) => d.replace(/\./g, "\\.")).join("|")})$`
);
// A feed-like label anywhere in the domain, e.g. outreach.senate.ca.gov, lists.example.org
const FEED_SUBDOMAIN_RE = /@([a-z0-9-]+\.)*(news|newsletters?|community|forums?|groups?|lists|digest|outreach)\./;
// A feed-like mailbox name, e.g. digest@, newsletter+abc@, community.team@
const FEED_LOCAL_PART_RE = /^(news|newsletters?|digest|community|forums?|groups?|discuss(ions?)?|outreach|posts?|social|trending)([+._-]|$)/;
// A feed-like display name, e.g. "Lake View Terrace Village Trending Posts"
const FEED_NAME_RE = /\b(trending|neighbou?rs?|digest|newsletter|community|forum|discussions?|posts|news)\b/i;

export function isChatter(sender: string, senderName: string | null | undefined, listId: string | null | undefined): boolean {
  if (listId) return true; // mailing lists, forums and groups set List-Id
  const s = sender.toLowerCase();
  return (
    COMMUNITY_DOMAIN_RE.test(s) ||
    FEED_SUBDOMAIN_RE.test(s) ||
    FEED_LOCAL_PART_RE.test(s.split("@")[0]) ||
    FEED_NAME_RE.test(senderName ?? "")
  );
}
