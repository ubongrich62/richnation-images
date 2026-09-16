// RichNation Mall — Cloudflare Worker, Phase 1 of the move toward a real
// backend (see the architecture discussion this shipped alongside).
//
// WHAT THIS DOES: serves cached, paginated reads of products and categories,
// instead of the customer site fetching the entire raw Firebase table
// directly like it does today. Firebase is only ever contacted from HERE,
// server-side, on a cache miss - every other request within the cache
// window is served straight from Cloudflare's edge cache. That's the actual
// fix for the pattern that drove the earlier Firebase bandwidth bill: with
// many customers hitting this Worker inside the same ~60 seconds, Firebase
// gets asked for the data exactly once, not once per visitor.
//
// WHAT THIS DOES NOT DO: write anything, or change how Admin edits products.
// This is READ-ONLY and customer-site-only on purpose - Admin should keep
// reading directly from Firebase so an admin always sees their own edits
// immediately, with no cache delay. Only the customer-facing read path
// changes here.
//
// THE ONE REAL TRADE-OFF, worth knowing going in: because of the cache
// window, a brand-new product or a price change can take up to
// CACHE_SECONDS to actually appear to customers after an admin saves it.
// That's the deliberate cost of cutting the bandwidth this drastically.
// Lower CACHE_SECONDS if that delay ever actually matters for something
// time-sensitive (a flash sale going live at an exact minute, say).
//
// rn_mall_settings is deliberately NOT served by this Worker yet - it likely
// has a few fields mixed in (worker URLs, API keys) that need a careful,
// explicit allow-list before anything reads it through a cached public
// endpoint, rather than guessing at what's safe. Products/categories are
// unambiguous: nothing in either is sensitive.
//
// ── HOW TO DEPLOY (same pattern as your other 3 Workers) ──
// 1. Cloudflare dashboard -> Compute -> Workers -> Create -> Create Worker.
//    Name it something like richnation-data, Deploy.
// 2. Click "Edit code", delete the sample code, paste this entire file in,
//    click "Deploy" again.
// 3. No secrets or bindings needed - this Worker only makes public GET
//    requests to your Firebase project's public REST endpoint, exactly what
//    the browser does today, just from Cloudflare's servers instead.
// 4. Your Worker's URL is shown at the top of its page, looks like
//    https://richnation-data.<your-subdomain>.workers.dev - that's the URL
//    the customer site will be pointed at in the next step (not done yet,
//    a separate change once this is deployed and you've had a chance to
//    poke at it).

const FIREBASE_DB_URL = 'https://richnation-portal-default-rtdb.firebaseio.com';
const CACHE_SECONDS = 60;

const ALLOWED_ORIGINS = ['https://richnationmall.com', 'https://www.richnationmall.com'];
function pickAllowOrigin(originHeader) {
  return ALLOWED_ORIGINS.includes(originHeader) ? originHeader : ALLOWED_ORIGINS[0];
}
function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin'
  };
}
function json(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: Object.assign(
      { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=' + CACHE_SECONDS },
      corsHeaders(origin)
    )
  });
}

async function fetchAllProducts() {
  const res = await fetch(FIREBASE_DB_URL + '/rn_mall_products.json');
  if (!res.ok) throw new Error('Firebase fetch failed: ' + res.status);
  const data = (await res.json()) || {};
  return Object.keys(data)
    .map(function (id) { return Object.assign({ id: id }, data[id]); })
    .filter(function (p) { return p.visible !== false; });
}

async function fetchAllCategories() {
  const res = await fetch(FIREBASE_DB_URL + '/rn_mall_categories.json');
  if (!res.ok) throw new Error('Firebase fetch failed: ' + res.status);
  const data = (await res.json()) || {};
  return Object.keys(data)
    .map(function (id) { return Object.assign({ id: id }, data[id]); })
    .filter(function (c) { return c.visible !== false; })
    .sort(function (a, b) { return (a.order || 99) - (b.order || 99); });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const allowOrigin = pickAllowOrigin(request.headers.get('Origin'));

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(allowOrigin) });
    if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405, allowOrigin);

    // Cloudflare's own edge cache, keyed by the full request URL. This is
    // what makes many customers hitting this Worker in the same ~60s window
    // collapse into exactly ONE real fetch to Firebase, not one per visitor.
    const cache = caches.default;
    const cacheKey = new Request(url.toString(), request);
    const cached = await cache.match(cacheKey);
    if (cached) return cached;

    try {
      let responseBody;

      if (url.pathname === '/products') {
        const category = url.searchParams.get('category');
        const page = Math.max(1, parseInt(url.searchParams.get('page')) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit')) || 20));

        let products = await fetchAllProducts();
        if (category) products = products.filter(function (p) { return p.category === category; });

        const total = products.length;
        const start = (page - 1) * limit;
        const pageItems = products.slice(start, start + limit);

        responseBody = { products: pageItems, total: total, page: page, limit: limit };
      } else if (url.pathname === '/categories') {
        responseBody = { categories: await fetchAllCategories() };
      } else {
        return json({ error: 'Not found. Try /products or /categories.' }, 404, allowOrigin);
      }

      const response = json(responseBody, 200, allowOrigin);
      ctx.waitUntil(cache.put(cacheKey, response.clone()));
      return response;
    } catch (e) {
      return json({ error: e.message }, 502, allowOrigin);
    }
  }
};
