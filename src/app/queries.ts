import type { Card } from '../types/card';
export const clean = (value: unknown): string => String(value ?? '').replace(/\s+/g, ' ').trim();
export const escapeHtml = (value: unknown): string => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] ?? char));
export const buildQueries = (card: Card) => ({
  ebayActiveRaw: card.marketplaceQueries?.ebayActiveRaw ?? clean(card.title),
  ebaySold: card.marketplaceQueries?.ebaySold ?? clean(card.title),
  google: card.marketplaceQueries?.google ?? clean(card.title),
  one30point: card.marketplaceQueries?.one30point ?? clean(card.title),
  sportsCardsPro: card.marketplaceQueries?.sportsCardsPro ?? clean(card.title)
});
