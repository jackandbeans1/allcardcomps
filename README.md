# All Card Comps — Final 130point API Package

This Cloudflare Pages package uses the 130point endpoint you provided:

```text
http://130point.com/api/search/html?q={card}&sort=recent&mp=all
```

For the Ohtani card, the generated URL is:

```text
http://130point.com/api/search/html?q=2023+Topps+X+Bob+Ross+The+Joy+of+Baseball+Shohei+Ohtani+1&sort=recent&mp=all
```

## Important 130point rules

- Uses `/api/search/html`.
- Uses `q=`.
- Uses `sort=recent`.
- Uses `mp=all`.
- Removes `#` from the card number.
- Uses plus-separated query terms.
- Does not append `raw`, `sold`, or marketplace words.

Keep your existing `cards.json` in the same deploy folder.
