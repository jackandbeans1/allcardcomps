import type { Card } from '../../types/card';
import { buildQueries, cardUrl, escapeHtml, marketUrl } from '../queries';

function priceMarkup(card: Card): string {
  const low = card.estimatedLowMarketPriceDisplay;
  const high = card.estimatedHighMarketPriceDisplay;

  return low && high
    ? `<div class="price"><strong>Est. raw market</strong><br>${escapeHtml(low)} – ${escapeHtml(high)}</div>`
    : '';
}

function badges(card: Card): string {
  const values: string[] = [];

  if (card.rookie) values.push('RC');
  if (card.autograph) values.push('Auto');
  if (card.memorabilia) values.push('Relic');
  if (card.serial || (!!card.printRun && card.printRun !== '0')) {
    values.push(card.printRun && card.printRun !== '0' ? `/${card.printRun}` : 'Serial');
  }

  if (!values.length) values.push(card.parallel || 'Base');

  return `<div class="badges">${values
    .map((value) => `<span class="badge">${escapeHtml(value)}</span>`)
    .join('')}</div>`;
}

export function renderCardTile(card: Card): string {
  const queries = buildQueries(card);

  return `
    <article class="card">
      <div class="title">${escapeHtml(card.title || queries.google)}</div>
      <div class="sub">${escapeHtml(card.year)} · ${escapeHtml(card.set)} · ${escapeHtml(card.number || '')}</div>
      ${priceMarkup(card)}
      <div class="query"><strong>eBay raw:</strong><br>${escapeHtml(queries.ebayActiveRaw)}</div>
      <div class="query"><strong>130point API query:</strong><br>${escapeHtml(queries.one30point)}</div>
      ${badges(card)}
      <div class="actions">
        <a class="btn primary" href="${cardUrl(card)}" data-link>Open</a>
        <a class="btn outline" target="_blank" rel="noopener" href="${marketUrl('ebaySold', queries.ebaySold, card)}">eBay sold</a>
        <a class="btn orange" target="_blank" rel="noopener" href="${marketUrl('one30point', queries.one30point, card)}">130point</a>
        <button class="btn outline" type="button" data-copy="${escapeHtml(queries.one30point)}">Copy</button>
      </div>
    </article>
  `;
}
