import type { Card } from './card';
export type SortOption = 'relevance' | 'yearDesc' | 'priceDesc';
export interface FiltersState { rookie: boolean; autograph: boolean; memorabilia: boolean; serial: boolean; }
export interface AppState { cards: Card[]; filtered: Card[]; page: number; perPage: number; q: string; set: string; sort: SortOption; filters: FiltersState; }
