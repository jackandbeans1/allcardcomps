# QA Report - Direct 130point Search Package

## Validated behavior

- 130point opens directly through `http://130point.com/api/search/html`.
- 130point URLs include `q`, `sort=recent`, and `mp=all`.
- Ohtani 130point URL: `http://130point.com/api/search/html?q=2023+Topps+X+Bob+Ross+The+Joy+of+Baseball+Shohei+Ohtani+1&sort=recent&mp=all`.
- Ohtani eBay raw query: `2023 Topps X Bob Ross The Joy of Baseball Shohei Ohtani #1 raw`.
- Ohtani SportsCardsPro URL: `https://www.sportscardspro.com/game/baseball-cards-2023-topps-x-bob-ross-the-joy-of/shohei-ohtani-1`.

## Scrubbed out

- `130point.com/?s=`
- `/sales/?q=`
- `https://130point.com/search`
- `raw sold`
- `alizarin-crimson`

## UI updates

Search result cards now show the card identity, badges, eBay: Active, eBay: Sold, Google, 103PT, SportsCardsPro, and Print label actions without the estimated raw market box or raw query preview boxes. The 103PT button uses the same outline style as the other secondary marketplace buttons. Detail pages show only the key card facts, clean marketplace action tiles, and a Print label panel.

## Collection controls

- 17,246 card records are represented without displaying duplicate counts in the UI.
- Year filtering narrows the set list.
- Unfiltered set options include year labels.
- Desktop and 390px mobile layouts render without horizontal overflow.
