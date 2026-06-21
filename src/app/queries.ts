import type { Card } from '../types/card';

export const clean = (value: unknown): string => String(value ?? '').replace(/\s+/g, ' ').trim();

export const escapeHtml = (value: unknown): string =>
  String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char] ?? char));

export const cardNumber = (card: Card): string =>
  clean(card.number ?? card.normalizedNumber).replace(/^#/, '');

export const canonicalName = (card: Card, includeHash = true): string => {
  const num = cardNumber(card);
  const normalized = num ? (includeHash ? `#${num}` : num) : '';
  return [clean(card.year), clean(card.set), clean(card.player ?? card.title), normalized]
    .filter(Boolean)
    .join(' ')
    .trim();
};

export const encode130PointApiQuery = (query: string): string =>
  clean(query)
    .replace(/#/g, '')
    .split(' ')
    .filter(Boolean)
    .map(encodeURIComponent)
    .join('+');

export interface CardQueries {
  ebayActiveRaw: string;
  ebaySold: string;
  google: string;
  one30point: string;
  sportsCardsPro: string;
}

export const buildQueries = (card: Card): CardQueries => {
  const exact = canonicalName(card, true) || clean(card.searchQuery) || clean(card.title);
  const noHash = canonicalName(card, false) || exact.replace(/#/g, '');
  const mq = card.marketplaceQueries ?? {};

  return {
    ebayActiveRaw: mq.ebayActiveRaw ?? `${exact} raw`,
    ebaySold: mq.ebaySold ?? exact,
    google: mq.google ?? exact,
    one30point: mq.one30point ?? noHash,
    sportsCardsPro: mq.sportsCardsPro ?? exact,
  };
};

export const sportsCardsProUrl = (card: Card): string => {
  const direct =
    card.marketplaceQueries?.sportsCardsPro ??
    card.marketplaceQueries?.sportsCardsPro ??
    '';

  if (direct.startsWith('http')) return direct;

  const query = direct || canonicalName(card, true);
  return `https://www.sportscardspro.com/search-products?q=${encodeURIComponent(query)}&type=prices`;
};

export const one30PointUrl = (query: string): string =>
  `http://130point.com/api/search/html?q=${encode130PointApiQuery(query)}&sort=recent&mp=all`;

export const marketUrl = (kind: keyof CardQueries, query: string, card: Card): string => {
  const encoded = encodeURIComponent(query || '');

  switch (kind) {
    case 'ebayActiveRaw':
      return `https://www.ebay.com/sch/i.html?_nkw=${encoded}&_sacat=212&LH_PrefLoc=2`;
    case 'ebaySold':
      return `https://www.ebay.com/sch/i.html?_nkw=${encoded}&_sacat=212&LH_Sold=1&LH_Complete=1`;
    case 'google':
      return `https://www.google.com/search?q=${encoded}`;
    case 'one30point':
      return one30PointUrl(query);
    case 'sportsCardsPro':
      return sportsCardsProUrl(card);
    default:
      return '#';
  }
};

export const cardUrl = (card: Card): string => `/cards/${encodeURIComponent(card.id)}.html`;

export const qrTarget = (card: Card): string => card.url ?? `https://cards.allcardcomps.com/cards/${card.id}.html`;

export const qrImage = (card: Card): string =>
  `https://quickchart.io/qr?text=${encodeURIComponent(qrTarget(card))}&size=220&margin=1&ecLevel=Q`;
