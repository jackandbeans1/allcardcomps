import fs from 'node:fs/promises';

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
await loadEnv();
const args = new Map(process.argv.slice(2).map((arg, i, all) => arg.startsWith('--') ? [arg.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true'] : []));
const setFilter = (args.get('set') || '').toLowerCase();
const idFilter = args.get('id') || '';
const limit = Number(args.get('limit') || 0);
const dryRun = args.has('dry-run');
const compsFile = args.get('comps') || '';
const provider = args.get('provider') || (process.env.SPORTSCARDSPRO_TOKEN ? 'sportscardspro' : '130point');
const sourceName = args.get('source') || (compsFile ? 'local comps export' : provider === 'sportscardspro' ? 'SportsCardsPro API' : '130point sold search');

const raw = JSON.parse(await fs.readFile('cards.json', 'utf8'));
const existing = await readPricing();
const prices = { ...(existing.prices || {}) };
const cards = (raw.cards || []).filter(card => {
  if (idFilter && String(card.id) !== idFilter) return false;
  if (setFilter && !String(card.set || '').toLowerCase().includes(setFilter)) return false;
  if (args.has('pending-only') && !isPending(card, prices)) return false;
  return true;
}).slice(0, limit || undefined);

const report = [];
const importedComps = compsFile ? await readComps(compsFile) : null;

for (const card of cards) {
  try {
    const apiEstimate = !importedComps && provider === 'sportscardspro' ? await sportsCardsProEstimate(card) : null;
    const comps = apiEstimate ? [] : importedComps ? importedComps.filter(comp => matchesImport(card, comp)) : await fetchComps(card);
    const accepted = apiEstimate ? [] : comps.filter(comp => classify(card, comp).accepted);
    const estimate = apiEstimate || estimateFromComps(card, accepted, sourceName);
    if (estimate) prices[String(card.id)] = estimate;
    report.push({ id: card.id, title: card.title, source: estimate?.source || sourceName, comps: estimate?.compCount || comps.length, accepted: accepted.length, priced: Boolean(estimate), error: '' });
  } catch (error) {
    report.push({ id: card.id, title: card.title, source: sourceName, comps: 0, accepted: 0, priced: false, error: error.message });
  }
}

const output = { version: 1, generatedAt: new Date().toISOString(), source: 'local-pricing-pipeline', prices };
if (!dryRun) await fs.writeFile('pricing.json', `${JSON.stringify(output, null, 2)}\n`);
console.table(report);

async function readPricing() {
  try { return JSON.parse(await fs.readFile('pricing.json', 'utf8')); }
  catch { return { prices: {} }; }
}

function isPending(card, currentPrices) {
  if (currentPrices[String(card.id)]) return false;
  return !(card.estimatedLowMarketPriceDisplay && card.estimatedHighMarketPriceDisplay);
}

async function loadEnv() {
  try {
    const text = await fs.readFile('.env', 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/);
      if (!match || process.env[match[1]]) continue;
      process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
    }
  } catch {}
}

async function sportsCardsProEstimate(card) {
  const token = process.env.SPORTSCARDSPRO_TOKEN;
  if (!token) throw new Error('SPORTSCARDSPRO_TOKEN is not set');
  const products = await sportsCardsProProducts(card, token);
  const matched = products.find(product => productMatch(card, product));
  if (!matched) return sportsCardsProPageEstimate(card);
  await pause(1100);
  const product = await sportsCardsProProduct(matched.id, token);
  const rawPennies = Number(product['loose-price'] || 0);
  if (!rawPennies) throw new Error(`SportsCardsPro match has no loose-price for ${card.id}`);
  return estimateFromRawApi(card, product);
}

async function sportsCardsProProducts(card, token) {
  const query = [card.year, card.set, card.player || card.title, card.normalizedNumber || card.number].filter(Boolean).join(' ').replace(/#/g, '');
  const url = `https://www.sportscardspro.com/api/products?${new URLSearchParams({ t: token, q: query })}`;
  const data = await getJson(url);
  if (data.status !== 'success') throw new Error(data['error-message'] || 'SportsCardsPro products search failed');
  return data.products || [];
}

async function sportsCardsProProduct(id, token) {
  const url = `https://www.sportscardspro.com/api/product?${new URLSearchParams({ t: token, id: String(id) })}`;
  const data = await getJson(url);
  if (data.status !== 'success') throw new Error(data['error-message'] || 'SportsCardsPro product lookup failed');
  return data;
}

async function getJson(url) {
  const response = await fetch(url, { headers: {
    'accept': 'application/json,text/plain,*/*',
    'accept-language': 'en-US,en;q=0.9',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36'
  } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function productMatch(card, product) {
  const text = `${product['product-name'] || ''} ${product['console-name'] || ''}`.toLowerCase();
  const productParallel = bracketedParallel(product['product-name'] || '');
  const wantedParallel = cardParallel(card);
  if (productParallel && wantedParallel === 'base' && !setContainsVariant(card, productParallel)) return false;
  if (productParallel && wantedParallel !== 'base' && productParallel !== wantedParallel) return false;
  const probe = { title: text, price: 1 };
  return classify(card, probe).accepted;
}

function bracketedParallel(name) {
  const match = String(name || '').match(/\[([^\]]+)\]/);
  return match ? cleanParallel(match[1]) : '';
}

function cardParallel(card) {
  const value = Array.isArray(card.parallel) ? card.parallel.join(' ') : card.parallel;
  return cleanParallel(value || 'base');
}

function cleanParallel(value) {
  return String(value || '').replace(/^\[(.*)\]$/, '$1').trim().toLowerCase() || 'base';
}

function setContainsVariant(card, variant) {
  const set = String(card.set || '').toLowerCase();
  return variant.split(/\s+/).every(part => set.includes(part));
}

function estimateFromRawApi(card, product) {
  const raw = Number(product['loose-price']) / 100;
  const volume = Number(product['sales-volume'] || 0);
  const spread = volume >= 30 ? 0.15 : volume >= 10 ? 0.2 : 0.28;
  const low = raw * (1 - spread);
  const high = raw * (1 + spread);
  const confidence = volume >= 30 ? 'High' : volume >= 10 ? 'Medium' : 'Low';
  const productName = product['product-name'] || card.title || card.id;
  return {
    low: round(low),
    mid: round(raw),
    high: round(high),
    lowDisplay: money.format(round(low)),
    midDisplay: money.format(round(raw)),
    highDisplay: money.format(round(high)),
    confidence,
    method: 'sports-cards-pro',
    compCount: volume || 1,
    source: 'SportsCardsPro API',
    productId: product.id,
    productName,
    generatedAt: new Date().toISOString(),
    explanation: `Estimated Raw Value is an API-backed estimate from SportsCardsPro ungraded pricing for "${productName}". It is provided for reference only and is not representative of actual market value.`
  };
}

async function sportsCardsProPageEstimate(card) {
  const url = sportsCardsProDirectUrl(card);
  if (!url) throw new Error(`SportsCardsPro found no exact raw product match for ${card.id}`);
  const response = await fetch(url, { headers: {
    'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'accept-language': 'en-US,en;q=0.9',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36'
  } });
  if (!response.ok) throw new Error(`SportsCardsPro page returned HTTP ${response.status} for ${card.id}`);
  const html = await response.text();
  const text = decode(html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
  const priceMatch = text.match(/Ungraded\s+Grade[\s\S]{0,300}?\$\s*([0-9][0-9,]*(?:\.[0-9]{2})?)/i);
  const raw = priceMatch ? Number(priceMatch[1].replace(/,/g, '')) : 0;
  if (!raw) throw new Error(`SportsCardsPro page has no ungraded price for ${card.id}`);
  const countMatch = text.match(/Ungraded\s+Sold\s+Listings\s+\((\d+)\)/i);
  const count = countMatch ? Number(countMatch[1]) : 1;
  const spread = count >= 30 ? 0.15 : count >= 10 ? 0.2 : 0.28;
  const confidence = count >= 30 ? 'High' : count >= 10 ? 'Medium' : 'Low';
  const nameMatch = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const productName = nameMatch ? decode(nameMatch[1].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim() : card.title || card.id;
  return {
    low: round(raw * (1 - spread)),
    mid: round(raw),
    high: round(raw * (1 + spread)),
    lowDisplay: money.format(round(raw * (1 - spread))),
    midDisplay: money.format(round(raw)),
    highDisplay: money.format(round(raw * (1 + spread))),
    confidence,
    method: 'sports-cards-pro',
    compCount: count,
    source: 'SportsCardsPro page',
    productUrl: url,
    productName,
    generatedAt: new Date().toISOString(),
    explanation: `Estimated Raw Value is an API-assisted estimate from SportsCardsPro ungraded pricing and ${count} ungraded sold listings for "${productName}". It is provided for reference only and is not representative of actual market value.`
  };
}

function sportsCardsProDirectUrl(card) {
  const direct = card.sportsCardsProUrl || card.sportscardsproUrl || card.priceChartingUrl || card.marketplaceUrls?.sportsCardsPro || card.marketplaceUrls?.sportscardspro || '';
  if (direct) return direct;
  if (String(card.id) === '26391567') return 'https://www.sportscardspro.com/game/baseball-cards-2023-topps-x-bob-ross-the-joy-of/shohei-ohtani-1';
  return '';
}

async function readComps(file) {
  const text = await fs.readFile(file, 'utf8');
  if (file.toLowerCase().endsWith('.json')) {
    const parsed = JSON.parse(text);
    return normalizeComps(Array.isArray(parsed) ? parsed : parsed.comps || parsed.rows || []);
  }
  return normalizeComps(parseCsv(text));
}

function normalizeComps(rows) {
  return rows.map(row => ({
    cardId: row.cardId || row.card_id || row.id || '',
    title: String(row.title || row.name || row.item || row.description || ''),
    price: Number(String(row.price || row.soldPrice || row.sold_price || row.amount || '').replace(/[$,]/g, ''))
  })).filter(row => row.title && Number.isFinite(row.price) && row.price > 0);
}

function parseCsv(text) {
  const rows = text.trim().split(/\r?\n/).map(parseCsvLine);
  const headers = rows.shift()?.map(h => h.trim()) || [];
  return rows.map(values => Object.fromEntries(headers.map((header, i) => [header, values[i] || ''])));
}

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"' && line[i + 1] === '"') { cur += '"'; i += 1; continue; }
    if (ch === '"') { quoted = !quoted; continue; }
    if (ch === ',' && !quoted) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur);
  return out;
}

function matchesImport(card, comp) {
  if (comp.cardId) return String(comp.cardId) === String(card.id);
  return classify(card, comp).accepted;
}

async function fetchComps(card) {
  const query = one30Query(card);
  const url = `https://130point.com/api/search/html?${new URLSearchParams({ q: query, sort: 'recent', mp: 'all' })}`;
  const response = await fetch(url, { headers: {
    'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'accept-language': 'en-US,en;q=0.9',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36'
  } });
  if (!response.ok) throw new Error(`130point returned ${response.status} for ${card.id}`);
  return parseComps(await response.text());
}

function one30Query(card) {
  const mq = card.marketplaceQueries || {};
  if (mq.one30point) return mq.one30point;
  const number = card.normalizedNumber || card.number || '';
  return [card.year, card.set, card.player || card.title, number].filter(Boolean).join(' ').replace(/#/g, '').replace(/\s+/g, ' ').trim();
}

function parseComps(html) {
  const chunks = html.split(/<\/(?:tr|li|article|div)>/i);
  const comps = [];
  for (const chunk of chunks) {
    const text = decode(chunk.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
    const price = priceFromText(text);
    if (!price) continue;
    comps.push({ title: text.slice(0, 240), price });
  }
  return dedupe(comps).slice(0, 80);
}

function decode(text) {
  return text.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

function priceFromText(text) {
  const matches = [...text.matchAll(/\$\s*([0-9][0-9,]*(?:\.[0-9]{2})?)/g)].map(m => Number(m[1].replace(/,/g, ''))).filter(n => n > 0 && n < 100000);
  return matches.length ? matches[matches.length - 1] : null;
}

function dedupe(comps) {
  const seen = new Set();
  return comps.filter(comp => {
    const key = `${comp.title.toLowerCase().slice(0, 90)}|${comp.price}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function classify(card, comp) {
  const text = comp.title.toLowerCase();
  const player = String(card.player || '').toLowerCase();
  const year = String(card.year || '').toLowerCase();
  const num = String(card.normalizedNumber || card.number || '').replace(/^#/, '').toLowerCase();
  const setTokens = String(card.set || '').toLowerCase().split(/\s+/).filter(t => t.length > 2 && !['the', 'and', 'with'].includes(t));
  if (/(psa|bgs|sgc|cgc|tag|csg|gem mt|gem mint|graded|slab)/i.test(text)) return { accepted: false, reason: 'graded' };
  if (/\b(lot|bundle|pick your|you pick|repack|break|case|box)\b/i.test(text)) return { accepted: false, reason: 'lot-or-sealed' };
  if (player && !player.split(/\s+/).every(part => text.includes(part))) return { accepted: false, reason: 'player-mismatch' };
  if (year && !text.includes(year)) return { accepted: false, reason: 'year-mismatch' };
  if (num && !numberMatches(text, num)) return { accepted: false, reason: 'number-mismatch' };
  if (setTokens.length && setTokens.filter(t => text.includes(t)).length < Math.min(2, setTokens.length)) return { accepted: false, reason: 'set-mismatch' };
  if (!card.autograph && /\b(auto|autograph|signed)\b/i.test(text)) return { accepted: false, reason: 'auto-mismatch' };
  if (!card.memorabilia && /\b(relic|patch|jersey|bat)\b/i.test(text)) return { accepted: false, reason: 'relic-mismatch' };
  return { accepted: true };
}

function estimateFromComps(card, comps, source) {
  if (comps.length < 3) return null;
  const values = comps.map(c => c.price).sort((a, b) => a - b);
  const trimmed = trim(values);
  const low = percentile(trimmed, 0.25);
  const mid = percentile(trimmed, 0.5);
  const high = percentile(trimmed, 0.75);
  const confidence = comps.length >= 10 ? 'High' : comps.length >= 5 ? 'Medium' : 'Low';
  return {
    low: round(low),
    mid: round(mid),
    high: round(high),
    lowDisplay: money.format(round(low)),
    midDisplay: money.format(round(mid)),
    highDisplay: money.format(round(high)),
    confidence,
    method: 'sold-comps',
    compCount: comps.length,
    source,
    generatedAt: new Date().toISOString(),
    explanation: `Estimated Raw Value is an estimate calculated from ${comps.length} sold market-value searches. It is provided for reference only and is not representative of actual market value.`
  };
}

function trim(values) {
  if (values.length < 6) return values;
  return values.slice(1, -1);
}

function percentile(values, p) {
  const pos = (values.length - 1) * p;
  const base = Math.floor(pos);
  const rest = pos - base;
  return values[base + 1] == null ? values[base] : values[base] + rest * (values[base + 1] - values[base]);
}

function round(value) {
  return Math.max(0.25, Math.round(value * 100) / 100);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function pause(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function numberMatches(text, num) {
  if (new RegExp(`(^|[^0-9a-z])#?${escapeRegExp(num)}([^0-9a-z]|$)`, 'i').test(text)) return true;
  const compactText = String(text || '').toLowerCase().replace(/[^0-9a-z]+/g, '');
  const compactNum = String(num || '').toLowerCase().replace(/[^0-9a-z]+/g, '');
  const mixedAlphaNumeric = /[a-z]/.test(compactNum) && /\d/.test(compactNum);
  return mixedAlphaNumeric && compactNum.length > 3 && compactText.includes(compactNum);
}
