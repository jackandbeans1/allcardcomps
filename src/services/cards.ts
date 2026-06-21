import type { Card, CardsResponse } from '../types/card';
export async function loadCards(): Promise<Card[]> {
  const response = await fetch('/allcardcomps/cards.json', { cache: 'no-store' });
  if (!response.ok) throw new Error(`Request failed with ${response.status}`);
  const data = (await response.json()) as CardsResponse;
  return data.cards ?? [];
}
