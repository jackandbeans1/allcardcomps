# All Card Comps — 130point Copy + Open Package

This Cloudflare Pages package preserves the site UI and changes 130point behavior to the reliable workflow requested:

1. Copy the exact 130point query from the site.
2. Open `https://130point.com/search` in a new tab.
3. Paste the copied query into 130point's search field.

## 130point query format

For the Ohtani card, the copied query is:

```text
2023 Topps X Bob Ross The Joy of Baseball Shohei Ohtani 1
```

The query deliberately removes `#` and does not append `raw`, `sold`, or `raw sold`.

## Other marketplace behavior

- eBay active raw: `{canonical with #} raw`
- eBay sold: `{canonical with #}`
- Google: `{canonical with #}`
- SportsCardsPro: direct page when known, including the Ohtani base #1 page

Keep your existing `cards.json` in the same deploy folder.
