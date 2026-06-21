export interface MarketplaceQueries {
  ebayActiveRaw?: string;
  ebaySold?: string;
  one30point?: string;
  google?: string;
  sportsCardsPro?: string;
}

export interface Card {
  id: string;
  url?: string;
  year?: string;
  set?: string;
  number?: string;
  normalizedNumber?: string;
  player?: string;
  title?: string;
  printRun?: string;
  rookie?: boolean;
  autograph?: boolean;
  memorabilia?: boolean;
  serial?: boolean;
  searchQuery?: string;
  marketplaceQueries?: MarketplaceQueries;
  estimatedLowMarketPrice?: number;
  estimatedHighMarketPrice?: number;
  estimatedLowMarketPriceDisplay?: string;
  estimatedHighMarketPriceDisplay?: string;
}

export interface CardsResponse {
  generatedAt?: string;
  baseUrl?: string;
  cards: Card[];
}
