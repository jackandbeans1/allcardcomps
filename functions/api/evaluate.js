export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  if (!["GET", "POST"].includes(request.method)) {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const input = request.method === "POST" ? await request.json().catch(() => ({})) : {};
    const id = url.searchParams.get("id") || input.id || "";
    const query = url.searchParams.get("q") || input.cardQuery || input.query || "";
    const activeAsk = number(url.searchParams.get("ask") || input.activeAsk || input.lowestActiveAsk);

    const [cardsData, pricingData] = await Promise.all([
      loadJson(env, request, "/cards.json"),
      loadJson(env, request, "/pricing.json").catch(() => ({ prices: {} }))
    ]);

    const cards = cardsData.cards || [];
    const card = id ? cards.find(c => String(c.id) === String(id)) : findByQuery(cards, query);
    if (!card) return json({ error: "Card not found" }, 404);

    const pricing = (pricingData.prices || {})[String(card.id)] || null;
    const market = marketValue(card, pricing);
    const evaluation = evaluateCard(card, market, activeAsk);

    return json({
      cardId: String(card.id),
      title: card.title || canonicalName(card),
      ...evaluation
    });
  } catch (error) {
    return json({ error: error.message || "Evaluation failed" }, 500);
  }
}

async function loadJson(env, request, path) {
  const assetUrl = new URL(path, new URL(request.url).origin);
  const response = env.ASSETS
    ? await env.ASSETS.fetch(new Request(assetUrl, { method: "GET" }))
    : await fetch(assetUrl);
  if (!response.ok) throw new Error(`Could not load ${path}`);
  return response.json();
}

function findByQuery(cards, query) {
  const needle = clean(query).toLowerCase();
  if (!needle) return null;
  return cards.find(card => searchable(card).includes(needle))
    || cards.find(card => needle.split(/\s+/).every(part => searchable(card).includes(part)));
}

function searchable(card) {
  return [card.id, card.title, card.player, card.year, card.set, card.number, card.normalizedNumber].join(" ").toLowerCase();
}

function marketValue(card, pricing) {
  if (pricing) {
    const low = number(pricing.low);
    const mid = number(pricing.mid);
    const high = number(pricing.high);
    if (mid) return { low, mid, high, source: pricing.source || "pricing.json", confidence: pricing.confidence || "Medium", method: pricing.method || "estimate", compCount: number(pricing.compCount) || 0 };
    if (low && high) return { low, mid: (low + high) / 2, high, source: pricing.source || "pricing.json", confidence: pricing.confidence || "Medium", method: pricing.method || "estimate", compCount: number(pricing.compCount) || 0 };
  }

  const low = number(card.estimatedLowMarketPrice);
  const high = number(card.estimatedHighMarketPrice);
  if (low && high) return { low, mid: (low + high) / 2, high, source: "dataset market estimate", confidence: "Medium", method: "dataset-market-estimate", compCount: 0 };
  return null;
}

function evaluateCard(card, market, activeAsk) {
  if (!market) {
    return {
      verdict: "Insufficient Data",
      verdictCode: "insufficient",
      predictiveScore: 20,
      marketValue: "N/A",
      marketRange: "Pending comps",
      lowestActiveAsk: activeAsk ? money(activeAsk) : "N/A",
      discountPercent: "N/A",
      confidence: "Low",
      signals: ["No usable raw market estimate is available yet."],
      sources: { market: "Pending comps", activeAsk: "Not connected" }
    };
  }

  const confidenceScore = market.confidence === "High" ? 30 : market.confidence === "Medium" ? 22 : 12;
  const volumeScore = market.compCount >= 30 ? 20 : market.compCount >= 10 ? 14 : market.compCount >= 3 ? 8 : 4;
  const traitPenalty = (card.autograph ? 4 : 0) + (card.memorabilia ? 3 : 0) + ((card.serial || card.printRun) ? 4 : 0);
  let score = 35 + confidenceScore + volumeScore - traitPenalty;
  let discount = null;
  const signals = [];

  if (activeAsk) {
    discount = ((market.mid - activeAsk) / market.mid) * 100;
    score += Math.max(-25, Math.min(25, discount * 0.8));
    signals.push(activeAsk < market.low ? "Active ask is below the estimated raw range." : activeAsk <= market.high ? "Active ask is within the estimated raw range." : "Active ask is above the estimated raw range.");
  } else {
    signals.push("Enter an active listing price to calculate edge against the estimated raw value above.");
  }

  if (market.compCount) signals.push(`${market.compCount} market signal${market.compCount === 1 ? "" : "s"} from ${market.source}.`);
  if (card.rookie) signals.push("Rookie-card flag may improve liquidity.");
  if (card.autograph || card.memorabilia || card.serial || card.printRun) signals.push("Special traits need exact-match validation before pricing inventory.");

  score = Math.max(0, Math.min(100, Math.round(score)));
  const verdict = verdictFor(score, discount, activeAsk);
  return {
    verdict: verdict.label,
    verdictCode: verdict.code,
    predictiveScore: score,
    marketValue: money(market.mid),
    marketRange: `${money(market.low)} - ${money(market.high)}`,
    lowestActiveAsk: activeAsk ? money(activeAsk) : "N/A",
    discountPercent: discount == null ? "N/A" : `${discount.toFixed(1)}%`,
    confidence: market.confidence,
    signals,
    sources: { market: market.source, method: market.method, activeAsk: activeAsk ? "Request input" : "Not connected" }
  };
}

function verdictFor(score, discount, hasAsk) {
  if (!hasAsk) {
    return { label: "Enter Active Ask", code: "thin" };
  }
  if (discount >= 20 && score >= 70) return { label: "Potential Edge", code: "edge" };
  if (discount >= 5 && score >= 55) return { label: "Fair Watch", code: "watch" };
  if (discount < -10) return { label: "Overpriced", code: "overpriced" };
  return { label: "Fair", code: "fair" };
}

function canonicalName(card) {
  return [card.year, card.set, card.player || card.title, card.number || card.normalizedNumber].filter(Boolean).join(" ");
}

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function number(value) {
  const n = Number(String(value ?? "").replace(/[$,%]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function money(value) {
  return value == null ? "N/A" : `$${Number(value).toFixed(2)}`;
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
