# QA Report — 130point Copy + Open Package

## Validated behavior

- 130point no longer tries to force results through an unsupported URL query.
- 130point button copies the exact query and opens `https://130point.com/search`.
- Ohtani 130point copied query: `2023 Topps X Bob Ross The Joy of Baseball Shohei Ohtani 1`.
- Ohtani eBay raw query: `2023 Topps X Bob Ross The Joy of Baseball Shohei Ohtani #1 raw`.
- Ohtani SportsCardsPro URL: `https://www.sportscardspro.com/game/baseball-cards-2023-topps-x-bob-ross-the-joy-of/shohei-ohtani-1`.

## Scrubbed out

- `130point.com/?s=`
- `/sales/?q=`
- `raw sold`
- `alizarin-crimson`

## UI preserved

The package includes stats, search, filters, sort, pagination, card grid, detail page, marketplace cards/buttons, QR label, copy buttons, and Cloudflare SPA redirects.
