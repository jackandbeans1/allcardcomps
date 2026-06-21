import './styles/main.css';
import { applyFilters } from './app/filters';
import { state } from './app/state';
import { loadCards } from './services/cards';

const app = document.getElementById('app');
if (!app) throw new Error('App container not found');

function render() {
  const sets = [...new Set(state.cards.map((card) => card.set).filter(Boolean))].sort();
  const rows = state.filtered;
  app.innerHTML = `
    <div class="topbar wrap"><div class="brand"><div class="logo">ACC</div><div>All Card Comps</div></div></div>
    <div class="wrap">
      <section class="hero"><h1>Search cards. Open comps.</h1><p>Starter package with included dist build.</p></section>
      <section class="panel searchShell">
        <div class="searchbar">
          <input id="searchInput" type="text" placeholder="Search cards, players, sets, numbers" value="${state.q}" />
          <select id="setSel"><option value="">All sets</option>${sets.map((value) => `<option value="${value}" ${value === state.set ? 'selected' : ''}>${value}</option>`).join('')}</select>
        </div>
      </section>
      <section class="toolbar"><div><strong>${state.filtered.length}</strong> matches</div></section>
      <section class="results">${rows.map((card)=>`<article class="card"><div class="title">${card.title ?? ''}</div><div class="sub">${card.year ?? ''} · ${card.set ?? ''} · ${card.number ?? ''}</div><div class="price"><strong>Est. raw market</strong><br>${card.estimatedLowMarketPriceDisplay ?? ''} – ${card.estimatedHighMarketPriceDisplay ?? ''}</div></article>`).join('')}</section>
    </div>`;

  const searchInput = document.getElementById('searchInput') as HTMLInputElement | null;
  const setSel = document.getElementById('setSel') as HTMLSelectElement | null;
  searchInput?.addEventListener('input', () => { state.q = searchInput.value; state.filtered = applyFilters(state); render(); });
  setSel?.addEventListener('change', () => { state.set = setSel.value; state.filtered = applyFilters(state); render(); });
}

loadCards().then((cards) => { state.cards = cards; state.filtered = applyFilters(state); render(); }).catch((error) => {
  app.innerHTML = `<div class="wrap"><div class="panel"><h2>Could not load cards.json</h2><p>${error instanceof Error ? error.message : 'Unknown error'}</p></div></div>`;
});
