export async function onRequest(context) {
  const { request } = context;
  if (!["GET", "POST"].includes(request.method)) {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const input = request.method === "POST" ? await request.json().catch(() => ({})) : {};
    const rawUrl = new URL(request.url).searchParams.get("url") || input.url || "";
    const itemUrl = validatedEbayUrl(rawUrl);
    const response = await fetch(itemUrl, {
      headers: {
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
        "User-Agent": "Mozilla/5.0 AllCardComps/1.0"
      }
    });

    if (!response.ok) {
      return json({ error: `Could not fetch eBay page (${response.status})`, url: itemUrl }, 502);
    }

    const html = await response.text();
    const price = extractPrice(html);
    if (!price) {
      return json({ error: "Could not find a sold/listing price on that eBay page.", url: itemUrl }, 422);
    }

    return json({
      url: itemUrl,
      itemId: extractItemId(itemUrl),
      title: extractTitle(html),
      price,
      priceDisplay: money(price),
      source: "eBay item page"
    });
  } catch (error) {
    return json({ error: error.message || "Could not pull comp URL" }, 400);
  }
}

function validatedEbayUrl(value) {
  let url;
  try {
    url = new URL(String(value || "").trim());
  } catch {
    throw new Error("Enter a valid eBay item URL.");
  }

  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (url.protocol !== "https:" || host !== "ebay.com") {
    throw new Error("Only https://www.ebay.com item URLs are supported.");
  }
  if (!/^\/itm\//i.test(url.pathname)) {
    throw new Error("Only eBay item URLs are supported.");
  }
  return url.toString();
}

function extractItemId(url) {
  const match = new URL(url).pathname.match(/\/itm\/(?:[^/]+\/)?(\d+)/i);
  return match ? match[1] : "";
}

function extractTitle(html) {
  const title = meta(html, "og:title") || meta(html, "twitter:title") || between(html, "<title>", "</title>");
  return decodeHtml(clean(title)).replace(/\s*\|\s*eBay\s*$/i, "");
}

function extractPrice(html) {
  const candidates = [
    /"convertedCurrentPrice"\s*:\s*\{[^}]*"value"\s*:\s*"?([0-9]+(?:\.[0-9]{1,2})?)"?/i,
    /"currentPrice"\s*:\s*\{[^}]*"value"\s*:\s*"?([0-9]+(?:\.[0-9]{1,2})?)"?/i,
    /"price"\s*:\s*\{[^}]*"value"\s*:\s*"?([0-9]+(?:\.[0-9]{1,2})?)"?/i,
    /itemprop=["']price["'][^>]*content=["']([0-9]+(?:\.[0-9]{1,2})?)["']/i,
    /"displayPrice"\s*:\s*"[^"$]*\$([0-9,]+(?:\.[0-9]{1,2})?)/i,
    /(?:Sold for|Winning bid|Price|US)\s*:?\s*\$([0-9,]+(?:\.[0-9]{1,2})?)/i
  ];

  for (const pattern of candidates) {
    const match = html.match(pattern);
    const value = match && number(match[1]);
    if (value) return value;
  }
  return null;
}

function meta(html, property) {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["']`, "i");
  const match = html.match(pattern);
  return match ? match[1] : "";
}

function between(value, start, end) {
  const s = value.indexOf(start);
  if (s < 0) return "";
  const e = value.indexOf(end, s + start.length);
  return e < 0 ? "" : value.slice(s + start.length, e);
}

function number(value) {
  const n = Number(String(value || "").replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

function money(value) {
  return `$${Number(value).toFixed(2)}`;
}

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}
