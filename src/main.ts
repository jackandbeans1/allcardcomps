import './styles/main.css';

import { applyFilters } from './app/filters';
import { idFromPath, navigate } from './app/router';
import { state } from './app/state';
import { renderDetail } from './app/render/detail';
import { renderHome } from './app/render/home';
import { showToast } from './app/render/ui';
import { copyText } from './services/clipboard';
import { loadCards } from './services/cards';

const app = document.getElementById('app');

if (!app) {
  throw new Error('App container not found');
}

function syncFiltered(): void {
  state.filtered = applyFilters(state);
}

function render(): void {
  const currentId = idFromPath();

  if (currentId) {
    const card = state.cards.find((entry) => entry.id === currentId);
    app.innerHTML = card ? renderDetail(card) : renderHome(state);
    return;
  }

  app.innerHTML = renderHome(state);
}

function updateAndRender(): void {
  syncFiltered();
  render();
}

function bindEvents(): void {
  document.addEventListener('click', async (event) => {
    const target = event.target as HTMLElement | null;
    if (!target) return;

    const link = target.closest('a[data-link]') as HTMLAnchorElement | null;
    if (link) {
      event.preventDefault();
      navigate(link.getAttribute('href') || '/');
      return;
    }

    const copyButton = target.closest('[data-copy]') as HTMLElement | null;
    if (copyButton) {
      const value = copyButton.getAttribute('data-copy') || '';
      const ok = await copyText(value);
      showToast(ok ? 'Copied' : 'Copy failed');
      return;
    }

    if (target.id === 'prev' && state.page > 1) {
      state.page -= 1;
      render();
      return;
    }

    const pages = Math.max(1, Math.ceil(state.filtered.length / state.perPage));
    if (target.id === 'next' && state.page < pages) {
      state.page += 1;
      render();
    }
  });

  document.addEventListener('input', (event) => {
    const target = event.target as HTMLInputElement | null;
    if (!target) return;

    if (target.id === 'searchInput') {
      state.q = target.value;
      state.page = 1;
      updateAndRender();
    }
  });

  document.addEventListener('change', (event) => {
    const target = event.target as HTMLInputElement | HTMLSelectElement | null;
    if (!target) return;

    if (target.id === 'setSel') {
      state.set = target.value;
      state.page = 1;
      updateAndRender();
      return;
    }

    if (target.id === 'sortSel') {
      state.sort = target.value as typeof state.sort;
      state.page = 1;
      updateAndRender();
      return;
    }

    if (target.id in state.filters && 'checked' in target) {
      state.filters[target.id as keyof typeof state.filters] = target.checked;
      state.page = 1;
      updateAndRender();
    }
  });

  window.addEventListener('popstate', render);
}

async function start(): Promise<void> {
  bindEvents();

  try {
    state.cards = await loadCards();
    syncFiltered();
    render();
  } catch (error) {
    app.innerHTML = `<div class="wrap"><div class="panel"><h2>Could not load cards.json</h2><p>${error instanceof Error ? error.message : 'Unknown error'}</p></div></div>`;
  }
}

void start();
