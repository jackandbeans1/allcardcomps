import type { Card } from '../types/card';
import type { AppState } from '../types/state';
export function applyFilters(state: AppState): Card[] {
  const term = state.q.trim().toLowerCase();
  const filtered = state.cards.filter((card) => {
    const hay = [card.title, card.player, card.year, card.set, card.number, card.normalizedNumber, card.searchQuery].join(' ').toLowerCase();
    const serialMatch = card.serial || (!!card.printRun && card.printRun !== '0');
    return (!state.set || card.set === state.set)
      && (!state.filters.rookie || !!card.rookie)
      && (!state.filters.autograph || !!card.autograph)
      && (!state.filters.memorabilia || !!card.memorabilia)
      && (!state.filters.serial || serialMatch)
      && (!term || hay.includes(term));
  });
  if (state.sort === 'yearDesc') filtered.sort((a,b)=>Number(b.year ?? 0)-Number(a.year ?? 0));
  if (state.sort === 'priceDesc') filtered.sort((a,b)=>Number(b.estimatedHighMarketPrice ?? 0)-Number(a.estimatedHighMarketPrice ?? 0));
  return filtered;
}
