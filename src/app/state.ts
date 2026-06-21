import type { AppState } from '../types/state';
export const state: AppState = { cards: [], filtered: [], page: 1, perPage: 60, q: '', set: '', sort: 'relevance', filters: { rookie: false, autograph: false, memorabilia: false, serial: false } };
