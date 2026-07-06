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

    const pricingMap = pricingData.prices || {};
    const pricing = pricingMap[String(card.id)] || null;
    const market = marketValue(card, pricing, cards, pricingMap);
    const evaluation = evaluateCard(card, market, activeAsk, cards, pricingMap);

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

function marketValue(card, pricing, cards = [], pricingMap = {}) {
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
  const modeled = modeledMarketValue(card, cards, pricingMap);
  if (modeled) return modeled;
  return null;
}

function evaluateCard(card, market, activeAsk, cards = [], pricingMap = {}) {
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
      pricingIntelligence: {
        opportunityScore: 20,
        verdict: "Pending Comps",
        verdictCode: "insufficient",
        marketPosition: "Unknown",
        reasons: ["No usable raw market estimate is available yet."],
        risks: ["Generate or review sold comps before treating this as a buy candidate."],
        comparableCohort: []
      },
      confidence: "Low",
      signals: ["No usable raw market estimate is available yet."],
      sources: { market: "Pending comps", activeAsk: "Not connected" }
    };
  }

  const confidenceScore = market.confidence === "High" ? 30 : market.confidence === "Medium" ? 22 : 12;
  const volumeScore = market.compCount >= 30 ? 20 : market.compCount >= 10 ? 14 : market.compCount >= 3 ? 8 : 4;
  const specialCard = isSpecialCard(card) || isNamedParallel(card);
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
  if (card.autograph || card.memorabilia || specialCard) signals.push("Confirm comps match this exact card version before pricing.");

  score = Math.max(0, Math.min(100, Math.round(score)));
  const verdict = verdictFor(score, discount, activeAsk);
  const recommendations = recommendedPrices(card, market);
  const intelligence = pricingIntelligence(card, market, activeAsk, cards, pricingMap, recommendations);
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
    pricingIntelligence: intelligence,
    confidence: market.confidence,
    signals: [...signals, ...intelligence.reasons.slice(0, 2)],
    sources: { market: market.source, method: market.method, activeAsk: activeAsk ? "Request input" : "Not connected" }
  };
}

function pricingIntelligence(card, market, activeAsk, cards, pricingMap, recommendations) {
  const cohorts = comparableCohorts(card, cards, pricingMap);
  const usableCohorts = cohorts.filter(c => c.count >= c.minCount && valueComparable(c, market));
  const strongest = usableCohorts[0] || null;
  const relative = strongest ? ((strongest.mid - market.mid) / strongest.mid) * 100 : 0;
  const discount = activeAsk ? ((market.mid - activeAsk) / market.mid) * 100 : null;
  const demand = playerDemand(card, cards, pricingMap);
  const scarcity = scarcityScore(card);
  const marketStrength = marketSignalScore(market);
  const liquidity = liquidityScore(market, demand);
  let opportunity = 28 + marketStrength * 0.22 + demand.score * 0.18 + scarcity * 0.16 + liquidity * 0.12;
  if (discount != null) opportunity += Math.max(-28, Math.min(30, discount * 0.85));
  opportunity += Math.max(-12, Math.min(14, relative * 0.2));
  if (market.confidence === "Low" || market.confidence === "Very Low") opportunity -= 8;
  opportunity = Math.max(0, Math.min(100, Math.round(opportunity)));

  const reasons = [];
  const risks = [];
  if (discount != null) {
    if (activeAsk <= recommendations.buy) reasons.push(`Asking price is at or below the recommended buy target of ${money(recommendations.buy)}.`);
    else if (activeAsk <= market.mid) reasons.push("Asking price is below the current midpoint estimate.");
    else risks.push("Asking price is above the current midpoint estimate.");
  } else {
    risks.push("Enter an asking price to score whether this specific listing is a buy candidate.");
  }
  if (strongest) {
    if (relative >= 10) reasons.push(`Current estimate is ${Math.round(relative)}% below the ${strongest.label} cohort midpoint.`);
    else if (relative <= -15) risks.push(`Current estimate is ${Math.abs(Math.round(relative))}% above the ${strongest.label} cohort midpoint.`);
    else reasons.push(`Current estimate is broadly aligned with the ${strongest.label} cohort.`);
  }
  if (demand.score >= 70) reasons.push(`${clean(card.player) || "This player"} has strong demand inside this card database.`);
  if (scarcity >= 65) reasons.push("Scarcity traits may support a stronger buyer pool.");
  if (market.compCount >= 10) reasons.push(`${market.compCount} reviewed market signals improve confidence.`);
  if (market.confidence === "Low" || market.confidence === "Very Low") risks.push("Confidence is limited, so verify recent sold comps before buying inventory.");
  if (isSpecialVersion(card)) risks.push("Confirm comps match this exact card version before pricing.");
  if (!risks.length) risks.push("Market prices can move quickly; recheck sold comps before committing cash.");

  const verdict = opportunityVerdict(opportunity, discount);
  return {
    opportunityScore: opportunity,
    verdict: verdict.label,
    verdictCode: verdict.code,
    marketPosition: strongest ? marketPosition(relative, strongest.label) : "No similar priced card found",
    playerDemandScore: demand.score,
    scarcityScore: Math.round(scarcity),
    liquidityScore: Math.round(liquidity),
    recommendedBuyPrice: money(recommendations.buy),
    recommendedListPrice: money(recommendations.list),
    reasons: unique(reasons).slice(0, 4),
    risks: unique(risks).slice(0, 3),
    comparableCohort: usableCohorts.slice(0, 3).map(c => ({
      label: c.label,
      count: c.count,
      midpoint: money(c.mid),
      range: `${money(c.low)} - ${money(c.high)}`
    }))
  };
}

function modeledMarketValue(card, cards, pricingMap) {
  const cohorts = comparableCohorts(card, cards, pricingMap);
  const best = cohorts.find(c => c.count >= c.minCount);
  if (!best) return null;
  return {
    low: Math.max(0.25, best.low * best.lowFactor),
    mid: best.mid,
    high: Math.max(0.5, best.high * best.highFactor),
    source: `${best.label} cohort`,
    confidence: best.confidence,
    method: "similar-card-model",
    compCount: best.count
  };
}

function comparableCohorts(card, cards, pricingMap) {
  const priced = cards.map(c => ({ card: c, range: cardRange(c, pricingMap[String(c.id)]) })).filter(x => x.range && String(x.card.id) !== String(card.id));
  const player = clean(card.player).toLowerCase();
  const set = clean(card.set).toLowerCase();
  const year = clean(card.year);
  const trait = traitKey(card);
  const specs = [
    { label: "same player/set/traits", priority: 1, minCount: 2, confidence: "High", lowFactor: 0.75, highFactor: 1.25, test: c => clean(c.player).toLowerCase() === player && clean(c.set).toLowerCase() === set && clean(c.year) === year && traitKey(c) === trait },
    { label: "same set/traits", priority: 2, minCount: 3, confidence: "Low", lowFactor: 0.7, highFactor: 1.35, test: c => clean(c.set).toLowerCase() === set && clean(c.year) === year && traitKey(c) === trait },
    { label: "same player/traits", priority: 3, minCount: 3, confidence: "Low", lowFactor: 0.65, highFactor: 1.4, test: c => clean(c.player).toLowerCase() === player && traitKey(c) === trait },
    { label: "same set", priority: 4, minCount: 5, confidence: "Low", lowFactor: 0.65, highFactor: 1.45, test: c => clean(c.set).toLowerCase() === set && clean(c.year) === year },
    { label: "same card traits", priority: 5, minCount: 20, confidence: "Very Low", lowFactor: 0.45, highFactor: 1.85, test: c => traitKey(c) === trait }
  ];
  return specs.map(spec => {
    const ranges = priced.filter(x => spec.test(x.card)).map(x => x.range);
    if (!ranges.length) return null;
    const summary = summarizeRanges(ranges);
    return { ...spec, ...summary };
  }).filter(Boolean).sort((a, b) => (b.count >= b.minCount) - (a.count >= a.minCount) || a.priority - b.priority || b.count - a.count);
}

function valueComparable(cohort, market) {
  if (!cohort.mid || !market.mid) return false;
  const ratio = cohort.mid / market.mid;
  return ratio >= 0.25 && ratio <= 4;
}

function marketPosition(relative, label) {
  if (Math.abs(relative) < 5) return `Aligned with ${label}`;
  return `${Math.abs(Math.round(relative))}% ${relative > 0 ? "below" : "above"} ${label}`;
}

function cardRange(card, pricing) {
  if (pricing) {
    const low = number(pricing.low);
    const mid = number(pricing.mid);
    const high = number(pricing.high);
    if (mid) return { low: low || mid, mid, high: high || mid };
    if (low && high) return { low, mid: (low + high) / 2, high };
  }
  const low = number(card.estimatedLowMarketPrice);
  const high = number(card.estimatedHighMarketPrice);
  return low && high ? { low, mid: (low + high) / 2, high } : null;
}

function summarizeRanges(ranges) {
  return {
    count: ranges.length,
    low: median(ranges.map(r => r.low)),
    mid: median(ranges.map(r => r.mid)),
    high: median(ranges.map(r => r.high))
  };
}

function traitKey(card) {
  return [serialBucket(card), card.rookie ? "rc" : "nonrc", card.autograph ? "auto" : "noauto", card.memorabilia ? "relic" : "norelic", isNamedParallel(card) ? "parallel" : "base"].join("|");
}

function serialBucket(card) {
  const printRun = number(card.printRun);
  if (printRun) {
    if (printRun <= 25) return "/25";
    if (printRun <= 50) return "/50";
    if (printRun <= 99) return "/99";
    if (printRun <= 199) return "/199";
    if (printRun <= 499) return "/499";
    return "numbered";
  }
  return card.serial ? "numbered" : "base";
}

function playerDemand(card, cards, pricingMap) {
  const player = clean(card.player).toLowerCase();
  const all = cards.map(c => cardRange(c, pricingMap[String(c.id)])).filter(Boolean);
  const playerRanges = cards.filter(c => clean(c.player).toLowerCase() === player).map(c => cardRange(c, pricingMap[String(c.id)])).filter(Boolean);
  if (!playerRanges.length || !all.length) return { score: 45, count: 0 };
  const playerMedian = median(playerRanges.map(r => r.mid));
  const allMedian = median(all.map(r => r.mid));
  const ratio = allMedian ? playerMedian / allMedian : 1;
  const score = Math.max(30, Math.min(95, 45 + Math.log2(Math.max(0.25, ratio)) * 14 + Math.min(18, playerRanges.length * 1.2)));
  return { score: Math.round(score), count: playerRanges.length };
}

function scarcityScore(card) {
  let score = 35;
  const printRun = number(card.printRun);
  if (card.rookie) score += 10;
  if (card.autograph) score += 16;
  if (card.memorabilia) score += 10;
  if (isNamedParallel(card)) score += 9;
  if (printRun) score += printRun <= 25 ? 24 : printRun <= 99 ? 18 : printRun <= 499 ? 11 : 6;
  else if (card.serial) score += 10;
  return Math.max(20, Math.min(100, score));
}

function marketSignalScore(market) {
  const confidence = market.confidence === "High" ? 34 : market.confidence === "Medium" ? 24 : market.confidence === "Low" ? 14 : 8;
  const volume = market.compCount >= 30 ? 24 : market.compCount >= 10 ? 17 : market.compCount >= 3 ? 10 : 4;
  const spread = market.mid ? ((market.high - market.low) / market.mid) : 2;
  const spreadScore = spread <= 0.5 ? 22 : spread <= 1 ? 15 : spread <= 2 ? 8 : 3;
  return Math.max(0, Math.min(100, confidence + volume + spreadScore));
}

function liquidityScore(market, demand) {
  return Math.max(15, Math.min(100, (market.compCount >= 30 ? 35 : market.compCount >= 10 ? 26 : market.compCount >= 3 ? 16 : 8) + demand.score * 0.55));
}

function opportunityVerdict(score, discount) {
  if (discount == null) return score >= 72 ? { label: "Watchlist Candidate", code: "watch" } : { label: "Needs Asking Price", code: "thin" };
  if (score >= 82) return { label: "Strong Buy Candidate", code: "strong" };
  if (score >= 68) return { label: "Possible Buy Candidate", code: "edge" };
  if (score >= 52) return { label: "Fairly Priced", code: "fair" };
  return { label: "Pass For Now", code: "overpriced" };
}

function recommendedPrices(card, market) {
  const special = Boolean(card.autograph || card.memorabilia || isSpecialCard(card) || isNamedParallel(card));
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

function isSpecialVersion(card) {
  return Boolean(card.autograph || card.memorabilia || isSpecialCard(card) || isNamedParallel(card));
}

function isNamedParallel(card) {
  const raw = Array.isArray(card.parallel) ? card.parallel.join(" ") : card.parallel;
  const parallel = clean(raw).replace(/^\[(.*)\]$/, "$1").toLowerCase();
  return Boolean(parallel && parallel !== "base");
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

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
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
