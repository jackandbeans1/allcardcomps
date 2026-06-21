import type { AppState } from '../../types/state';
import { renderCardTile } from './cardTile';
import { nav } from './ui';

export function renderHome(state: AppState): string {
  const sets = [...new Set(state.cards.map((card) => card.set).filter(Boolean))].sort();
  const stats = {
    cards: state.cards.length,
    sets: sets.length,
    rookies: state.cards.filter((card) => card.rookie).length,
    serial: state.cards.filter((card) => card.serial || (!!card.printRun && card.printRun !== '0')).length,
  };

  const pages = Math.max(1, Math.ceil(state.filtered.length / state.perPage));
  const page = Math.min(state.page, pages);
  const start = (page - 1) * state.perPage;
  const rows = state.filtered.slice(start, start + state.perPage);

  return `
    ${nav()}
    <div class="wrap">
      <section class="hero">
        <h1>Search cards. Open comps. Copy stronger queries.</h1>
        <p>Responsive card comp pages with the 130point API search endpoint, marketplace buttons, filters, pagination, and detail pages.</p>
      </section>

      <section class="panel stats">
        <div class="stat"><span>Cards</span><b>${stats.cards.toLocaleString()}</b></div>
        <div class="stat"><span>Sets</span><b>${stats.sets.toLocaleString()}</b></div>
        <div class="stat"><span>Rookies</span><b>${stats.rookies.toLocaleString()}</b></div>
        <div class="stat"><span>Serial/SP</span><b>${stats.serial.toLocaleString()}</b></div>
      </section>

      <section class="panel searchShell">
        <div class="searchbar">
          <input id="searchInput" type="text" placeholder="Search cards, players, sets, numbers" value="${state.q}" />
          <select id="setSel">
            <option value="">All sets</option>
            ${sets
              .map((value) => `<option value="${value}" ${value === state.set ? 'selected' : ''}>${value}</option>`)
              .join('')}
          </select>
        </div>
        <div class="chips">
          ${['rookie', 'autograph', 'memorabilia', 'serial']
            .map(
              (key) =>
                `<label class="chip"><input id="${key}" type="checkbox" ${state.filters[key as keyof typeof state.filters] ? 'checked' : ''}/> ${key}</label>`,
            )
            .join('')}
          <label class="chip">Sort:
            <select id="sortSel">
              <option value="relevance" ${state.sort === 'relevance' ? 'selected' : ''}>relevance</option>
              <option value="yearDesc" ${state.sort === 'yearDesc' ? 'selected' : ''}>Newest year</option>
              <option value="priceDesc" ${state.sort === 'priceDesc' ? 'selected' : ''}>Highest est. price</option>
            </select>
          </label>
        </div>
      </section>

      <section class="toolbar">
        <div>
          <strong>${state.filtered.length.toLocaleString()}</strong> matches ·
          <span>${state.filtered.length ? `Showing ${(start + 1).toLocaleString()}–${(start + rows.length).toLocaleString()} of ${state.filtered.length.toLocaleString()}` : 'No matches'}</span>
        </div>
        <div class="pager">
          <button id="prev" class="btn outline" type="button" ${page <= 1 ? 'disabled' : ''}>Previous</button>
          <span>Page ${page} of ${pages}</span>
          <button id="next" class="btn outline" type="button" ${page >= pages ? 'disabled' : ''}>Next</button>
        </div>
      </section>

      <section id="resultsList" class="results">
        ${rows.length ? rows.map(renderCardTile).join('') : '<div class="panel">No cards matched.</div>'}
      </section>

      <div class="foot">Verify live sold listings before pricing inventory.</div>
    </div>
  `;
}
