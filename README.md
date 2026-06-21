# All Card Comps - Direct 130point Search Package

This Cloudflare Pages package preserves the site UI and opens 130point searches directly from each card.

1. Click `103PT`.
2. The new tab opens 130point's HTML search endpoint with the card query already filled.
3. Use `Print label` to print a compact QR label for the card page.

## 130point URL format

For the Ohtani card, the direct URL is:

```url
http://130point.com/api/search/html?q=2023+Topps+X+Bob+Ross+The+Joy+of+Baseball+Shohei+Ohtani+1&sort=recent&mp=all
```

The 130point query deliberately removes `#` and does not append `raw`, `sold`, or `raw sold`.

## Other marketplace behavior

- eBay: Active: `{canonical with #} raw`
- eBay: Sold: `{canonical with #}`
- Google: `{canonical with #}`
- SportsCardsPro: direct page when known, including the Ohtani base #1 page

## Label printing

The `Print label` button opens a print-ready label that fits within a standard 3-inch toploader width. Each label includes the QR code for the card page and the full card name.

## Collection browsing

- Summary tiles show Rookie, Autograph, Relic, and Numbered counts.
- Year is a first-class filter.
- Set choices depend on the selected year.
- Without a selected year, set options are prefixed with their year.
- Filters include Rookie, Autograph, Relic, and Numbered.

The generated card data also preserves Beckett quantity, condition, guide value, collection ID, and source URL.

Keep your existing `cards.json` in the same deploy folder.
