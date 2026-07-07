const KV_BINDINGS = ["COMP_OVERRIDES", "PRICING_OVERRIDES"];

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === "GET") return getComps(context);
  if (request.method === "POST") return saveComp(context);
  return json({ error: "Method not allowed" }, 405);
}

async function getComps({ request, env }) {
  const kv = compStore(env);
  if (!kv) return json({ prices: {}, configured: false });

  const id = new URL(request.url).searchParams.get("id");
  if (id) {
    const value = await kv.get(key(id), "json");
    return json({ id: String(id), pricing: value || null, configured: true });
  }

  const prices = {};
  let cursor;
  do {
    const page = await kv.list({ prefix: "pricing:", cursor });
    const values = await Promise.all(page.keys.map(k => kv.get(k.name, "json")));
    page.keys.forEach((k, index) => {
      const id = k.name.replace(/^pricing:/, "");
      if (values[index]) prices[id] = values[index];
    });
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor);

  return json({ prices, configured: true });
}

async function saveComp({ request, env }) {
  const kv = compStore(env);
  if (!kv) return json({ error: "Cloudflare KV binding COMP_OVERRIDES is not configured." }, 503);
  if (!authorized(request, env)) return json({ error: "Not authorized." }, 401);

  const input = await request.json().catch(() => null);
  const id = String(input?.id || "").trim();
  const pricing = normalizePricing(input?.pricing || input);
  if (!/^\d+$/.test(id)) return json({ error: "Missing card id." }, 400);
  if (!pricing) return json({ error: "No usable comp pricing was provided." }, 400);

  const saved = {
    ...pricing,
    source: pricing.source || "manual sold comps",
    method: pricing.method || "manual-override",
    generatedAt: new Date().toISOString()
  };
  await kv.put(key(id), JSON.stringify(saved), {
    metadata: { id, updatedAt: saved.generatedAt, compCount: saved.compCount || 0 }
  });

  return json({ ok: true, id, pricing: saved });
}

function compStore(env = {}) {
  return KV_BINDINGS.map(name => env[name]).find(Boolean) || null;
}

function authorized(request, env = {}) {
  const expected = env.COMP_ADMIN_TOKEN || env.ADMIN_TOKEN || "";
  if (!expected) return false;
  const header = request.headers.get("x-admin-token") || "";
  const auth = request.headers.get("authorization") || "";
  return header === expected || auth === `Bearer ${expected}`;
}

function normalizePricing(value = {}) {
  const low = number(value.low);
  const mid = number(value.mid);
  const high = number(value.high);
  if (!low || !mid || !high) return null;
  return {
    low,
    mid,
    high,
    lowDisplay: money(low),
    midDisplay: money(mid),
    highDisplay: money(high),
    confidence: clean(value.confidence) || "Low",
    source: clean(value.source) || "manual sold comps",
    method: clean(value.method) || "manual-override",
    compCount: Math.max(0, Math.round(number(value.compCount) || 0)),
    explanation: "Estimated Raw Value is a saved estimate from reviewed sold comps. It is provided for reference only and is not representative of actual market value."
  };
}

function key(id) {
  return `pricing:${id}`;
}

function number(value) {
  const n = Number(String(value ?? "").replace(/[$,%]/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

function money(value) {
  return `$${Number(value).toFixed(2)}`;
}

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
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
