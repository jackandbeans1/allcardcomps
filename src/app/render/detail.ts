import type { Card } from '../../types/card';
import { buildQueries, escapeHtml, marketUrl } from '../queries';
import { getQrImage } from '../../services/qr';
import { nav } from './ui';

export function renderDetail(card: Card): string {
  const queries = buildQueries(card);
  const items = [
    ['eBay active raw', queries.ebayActiveRaw, marketUrl('ebayActiveRaw', queries.ebayActiveRaw, card), 'primary'],
    ['eBay sold', queries.ebaySold, marketUrl('ebaySold', queries.ebaySold, card), 'primary'],
    ['Google comps', queries.google, marketUrl('google', queries.google, card), 'primary'],
    ['130point', queries.one30point, marketUrl('one30point', queries.one30point, card), 'orange'],
  ] as const;

  return `
    ${nav()}
    <div class="wrap">
      <a class="btn outline" href="/" data-link>← Back</a>
      <section class="panel detail">
        <div>
          <h2>${escapeHtml(card.title || queries.google)}</h2>
          <p>${escapeHtml(card.year)} · ${escapeHtml(card.set)} · ${escapeHtml(card.number || '')}</p>
          <div class="metaGrid" style="margin-top:16px">
            <div class="meta"><strong>Player</strong><br>${escapeHtml(card.player)}</div>
            <div class="meta"><strong>Set</strong><br>${escapeHtml(card.set)}</div>
            <div class="meta"><strong>Card #</strong><br>${escapeHtml(card.number || '')}</div>
            <div class="meta"><strong>ID</strong><br>${escapeHtml(card.id)}</div>
          </div>
          <h3 style="margin-top:18px">Marketplace searches</h3>
          <div class="marketGrid">
            ${items
              .map(
                ([label, value, href, kind]) => `
                  <div class="market">
                    <strong>${escapeHtml(label)}</strong>
                    <div class="query" style="margin-top:10px">${escapeHtml(value)}</div>
                    <div class="actions">
                      <a class="btn ${kind}" target="_blank" rel="noopener" href="${href}">Open</a>
                      <button class="btn outline" type="button" data-copy="${escapeHtml(value)}">Copy</button>
                    </div>
                  </div>
                `,
              )
              .join('')}
          </div>
        </div>
        <aside>
          <div class="qr">
            <h3>QR label</h3>
            <img src="${getQrImage(card)}" alt="QR code" />
            <p>Links to this card page.</p>
          </div>
        </aside>
      </section>
    </div>
  `;
}
