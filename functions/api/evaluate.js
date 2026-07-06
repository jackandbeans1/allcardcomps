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
      recommendedBuyPrice: "N/A",
      recommendedListPrice: "N/A",
      confidence: "Low",
      signals: ["No usable raw market estimate is available yet."],
      sources: { market: "Pending comps", activeAsk: "Not connected" }
    };
  }

  const confidenceScore = market.confidence === "High" ? 30 : market.confidence === "Medium" ? 22 : 12;
  const volumeScore = market.compCount >= 30 ? 20 : market.compCount >= 10 ? 14 : market.compCount >= 3 ? 8 : 4;
  const specialCard = isSpecialCard(card);
  const traitPenalty = (card.autograph ? 4 : 0) + (card.memorabilia ? 3 : 0) + (specialCard ? 4 : 0);
  let score = 35 + confidenceScore + volumeScore - traitPenalty;
  let discount = null;
  const signals = [];

  if (activeAsk) {
    discount = ((market.mid - activeAsk) / market.mid) * 100;
    score += Math.max(-25, Math.min(25, discount * 0.8));
    signals.push(activeAsk < market.low ? "Asking price is below the estimated raw value range." : activeAsk <= market.high ? "Asking price is within the estimated raw value range." : "Asking price is above the estimated raw value range.");
  } else {
    signals.push("Enter an asking price to compare it with the estimated raw value above.");
  }

  if (market.compCount) signals.push(`${market.compCount} market signal${market.compCount === 1 ? "" : "s"} from ${market.source}.`);
  if (card.rookie) signals.push("Rookie-card flag may improve liquidity.");
  if (card.autograph || card.memorabilia || specialCard) signals.push("Special-card traits need exact-match validation before pricing inventory.");

  score = Math.max(0, Math.min(100, Math.round(score)));
  const verdict = verdictFor(score, discount, activeAsk);
  const recommendations = recommendedPrices(card, market);
  return {
    verdict: verdict.label,
    verdictCode: verdict.code,
    predictiveScore: score,
    marketValue: money(market.mid),
    marketRange: `${money(market.low)} - ${money(market.high)}`,
    lowestActiveAsk: activeAsk ? money(activeAsk) : "N/A",
    discountPercent: discount == null ? "N/A" : priceDifference(discount),
    recommendedBuyPrice: money(recommendations.buy),
    recommendedListPrice: money(recommendations.list),
    confidence: market.confidence,
    signals,
    sources: { market: market.source, method: market.method, activeAsk: activeAsk ? "Request input" : "Not connected" }
  };
}

function recommendedPrices(card, market) {
  const special = Boolean(card.autograph || card.memorabilia || isSpecialCard(card));
  const confidenceDiscount = market.confidence === "High" ? 0.86 : market.confidence === "Medium" ? 0.8 : 0.72;
  const specialDiscount = special ? 0.94 : 1;
  const buy = Math.min(market.mid * confidenceDiscount * specialDiscount, market.high * 0.78);
  const listMultiplier = market.confidence === "High" ? 1.08 : market.confidence === "Medium" ? 1.12 : 1.18;
  const list = Math.max(market.mid * listMultiplier, market.high * 0.96);
  return { buy: roundPrice(buy), list: roundPrice(list) };
}

function verdictFor(score, discount, hasAsk) {
  if (!hasAsk) {
    return { label: "Enter Asking Price", code: "thin" };
  }
  if (discount >= 20 && score >= 70) return { label: "Below Estimate", code: "edge" };
  if (discount >= 5 && score >= 55) return { label: "Slightly Below Estimate", code: "watch" };
  if (discount < -10) return { label: "Above Estimate", code: "overpriced" };
  return { label: "Within Estimate", code: "fair" };
}

function isSpecialCard(card) {
  const printRun = number(card.printRun);
  return Boolean(card.serial || (printRun && printRun > 0));
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

function priceDifference(discount) {
  if (!Number.isFinite(discount)) return "N/A";
  if (Math.abs(discount) < 0.05) return "Even";
  return `${Math.abs(discount).toFixed(1)}% ${discount > 0 ? "below" : "above"}`;
}

function roundPrice(value) {
  if (!Number.isFinite(value) || value <= 0) return null;
  if (value < 5) return Math.max(0.25, Math.round(value * 4) / 4);
  if (value < 50) return Math.round(value);
  return Math.round(value / 5) * 5;
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
