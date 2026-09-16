// RichNation Mall — Cloudflare Worker, Phase 1 + Phase 2a of the move toward
// a real backend (see the architecture discussion this shipped alongside).
//
// PHASE 1 (already live): serves cached, paginated reads of products and
// categories, instead of the customer site fetching the entire raw Firebase
// table directly. Firebase was only ever contacted here, server-side, on a
// cache miss.
//
// PHASE 2a (this version): products/categories now live in Cloudflare D1 (a
// real SQL database) as the actual source of truth for READS. Admin still
// writes to Firebase Realtime Database directly, completely unchanged, so
// admin's own workflow has zero risk from this change. A sync step (either
// the /admin/sync endpoint below, called once by hand, or the scheduled()
// Cron handler at the bottom, called automatically every few minutes) pulls
// admin's Firebase writes into D1. If D1 has no data yet (before the first
// sync ever runs) or a D1 read fails for any reason, this Worker falls back
// to reading Firebase directly, the exact Phase 1 behavior, so the
// storefront never breaks during the cutover.
//
// PHASE 2b (a later, separate piece, NOT done here): move admin's actual
// write path to D1 directly (authenticated Worker endpoints admin.html
// calls instead of writing to Firebase). That's the point where Firebase's
// role for this data actually ends. Until then, Firebase stays the place
// admin edits land, and D1 stays a synced read replica.
//
// rn_mall_settings is still deliberately NOT served by this Worker - it
// likely has a few fields mixed in (worker URLs, API keys) that need a
// careful, explicit allow-list before anything reads it through a cached
// public endpoint, rather than guessing at what's safe.
//
// ── HOW TO DEPLOY / UPGRADE FROM PHASE 1 ──
// 1. Cloudflare dashboard -> Storage & databases -> D1 SQL Database ->
//    Create Database. Name it something like richnation-db, Create.
//    (Skip this step if you already have one you want to reuse.)
// 2. Go to Compute -> Workers -> richnation-data -> Settings -> Bindings ->
//    Add binding -> type "D1 database" -> Variable name: DB -> D1 database:
//    richnation-db -> Save/Deploy.
// 3. Same Worker -> Settings -> Variables and Secrets -> Add -> type Secret
//    -> Name: ADMIN_SYNC_KEY (must match exactly) -> Value: make up any
//    long random string, this is just a password only you know, to stop
//    randoms from triggering a resync -> Save.
// 4. Click "Edit code", replace everything with this entire file, Deploy.
// 5. Trigger the first sync by hand: visit, in your own browser,
//    https://richnation-data.<your-subdomain>.workers.dev/admin/sync?key=<the secret you picked in step 3>
//    You should get back JSON like {"ok":true,"products":18,"categories":8,"syncedAt":...}.
// 6. Check /products and /categories still return the same data as before,
//    now sourced from D1 - should look identical from the storefront's side.
// 7. (Recommended) Set up automatic resyncing so future admin edits in
//    Firebase keep flowing into D1 without you visiting /admin/sync by
//    hand every time: same Worker page -> Triggers (or Settings -> Trigger
//    Events) -> Cron Triggers -> Add Cron Trigger -> e.g. "*/5 * * * *"
//    (every 5 minutes) is a reasonable starting point.

const FIREBASE_DB_URL = 'https://richnation-portal-default-rtdb.firebaseio.com';
const CACHE_SECONDS = 60;

const ALLOWED_ORIGINS = ['https://richnationmall.com', 'https://www.richnationmall.com'];
function pickAllowOrigin(originHeader) {
  return ALLOWED_ORIGINS.includes(originHeader) ? originHeader : ALLOWED_ORIGINS[0];
}
function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
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

async function fetchAllProductsFromFirebase() {
  const res = await fetch(FIREBASE_DB_URL + '/rn_mall_products.json');
  if (!res.ok) throw new Error('Firebase fetch failed: ' + res.status);
  const data = (await res.json()) || {};
  return Object.keys(data)
    .map(function (id) { return Object.assign({ id: id }, data[id]); })
    .filter(function (p) { return p.visible !== false; });
}

async function fetchAllCategoriesFromFirebase() {
  const res = await fetch(FIREBASE_DB_URL + '/rn_mall_categories.json');
  if (!res.ok) throw new Error('Firebase fetch failed: ' + res.status);
  const data = (await res.json()) || {};
  return Object.keys(data)
    .map(function (id) { return Object.assign({ id: id }, data[id]); })
    .filter(function (c) { return c.visible !== false; })
    .sort(function (a, b) { return (a.order || 99) - (b.order || 99); });
}

// The full product/category object is stored as one JSON blob per row
// (rather than a fully normalized column-per-field schema) deliberately -
// Firebase's documents are already schema-less (colors, sizes, images
// arrays vary product to product), and hand-mapping every field into rigid
// SQL columns is a separate, bigger project that doesn't need to block
// getting this data into a real database at all. category/visible/order are
// pulled into their own indexed columns since those are exactly what gets
// filtered/sorted on every read.
async function ensureSchema(env) {
  await env.DB.batch([
    env.DB.prepare(
      'CREATE TABLE IF NOT EXISTS products (' +
      'id TEXT PRIMARY KEY, category TEXT, visible INTEGER NOT NULL DEFAULT 1, ' +
      'data TEXT NOT NULL, updated_at INTEGER NOT NULL)'
    ),
    env.DB.prepare(
      'CREATE TABLE IF NOT EXISTS categories (' +
      'id TEXT PRIMARY KEY, order_num INTEGER NOT NULL DEFAULT 99, visible INTEGER NOT NULL DEFAULT 1, ' +
      'data TEXT NOT NULL, updated_at INTEGER NOT NULL)'
    )
  ]);
}

// Wipes and reinserts everything on each sync rather than diffing old vs
// new rows - a mall-sized catalog is hundreds of items, not millions, so
// this stays cheap and avoids needing separate delete-tracking logic for
// products/categories admin removes in Firebase.
async function syncFromFirebase(env) {
  await ensureSchema(env);
  const [products, categories] = await Promise.all([
    fetchAllProductsFromFirebase(),
    fetchAllCategoriesFromFirebase()
  ]);
  const now = Date.now();
  const stmts = [env.DB.prepare('DELETE FROM products')];
  for (const p of products) {
    stmts.push(
      env.DB.prepare('INSERT INTO products (id, category, visible, data, updated_at) VALUES (?,?,?,?,?)')
        .bind(p.id, p.category || null, p.visible === false ? 0 : 1, JSON.stringify(p), now)
    );
  }
  stmts.push(env.DB.prepare('DELETE FROM categories'));
  for (const c of categories) {
    stmts.push(
      env.DB.prepare('INSERT INTO categories (id, order_num, visible, data, updated_at) VALUES (?,?,?,?,?)')
        .bind(c.id, c.order || 99, c.visible === false ? 0 : 1, JSON.stringify(c), now)
    );
  }
  await env.DB.batch(stmts);
  return { products: products.length, categories: categories.length, syncedAt: now };
}

async function fetchProductsFromD1(env, category) {
  const stmt = category
    ? env.DB.prepare('SELECT data FROM products WHERE visible = 1 AND category = ?').bind(category)
    : env.DB.prepare('SELECT data FROM products WHERE visible = 1');
  const res = await stmt.all();
  return res.results.map(function (r) { return JSON.parse(r.data); });
}

async function fetchCategoriesFromD1(env) {
  const res = await env.DB.prepare('SELECT data FROM categories WHERE visible = 1 ORDER BY order_num').all();
  return res.results.map(function (r) { return JSON.parse(r.data); });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const allowOrigin = pickAllowOrigin(request.headers.get('Origin'));

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(allowOrigin) });

    // Manual/on-demand sync trigger. Not customer-facing, only you would
    // ever call this (e.g. right after deploying this version, or anytime
    // you don't want to wait for the next scheduled Cron sync). Protected
    // by a shared secret rather than left wide open, since it forces a
    // real Firebase read + D1 rewrite each time it's called.
    if (url.pathname === '/admin/sync') {
      if (!env.ADMIN_SYNC_KEY || url.searchParams.get('key') !== env.ADMIN_SYNC_KEY) {
        return json({ error: 'Unauthorized' }, 401, allowOrigin);
      }
      try {
        const result = await syncFromFirebase(env);
        return json(Object.assign({ ok: true }, result), 200, allowOrigin);
      } catch (e) {
        return json({ error: e.message }, 502, allowOrigin);
      }
    }

    if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405, allowOrigin);

    // Cloudflare's own edge cache, keyed by the full request URL. This is
    // what makes many customers hitting this Worker in the same ~60s window
    // collapse into exactly ONE real D1/Firebase read, not one per visitor.
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

        let products;
        try {
          products = await fetchProductsFromD1(env, category);
        } catch (d1Err) {
          // D1 not bound/set up yet, or the first sync hasn't run yet -
          // fall straight back to Phase 1's direct-Firebase behavior so the
          // storefront never breaks mid-cutover.
          console.warn('D1 products read failed, falling back to Firebase:', d1Err.message);
          products = await fetchAllProductsFromFirebase();
          if (category) products = products.filter(function (p) { return p.category === category; });
        }

        const total = products.length;
        const start = (page - 1) * limit;
        const pageItems = products.slice(start, start + limit);

        responseBody = { products: pageItems, total: total, page: page, limit: limit };
      } else if (url.pathname === '/categories') {
        let categories;
        try {
          categories = await fetchCategoriesFromD1(env);
        } catch (d1Err) {
          console.warn('D1 categories read failed, falling back to Firebase:', d1Err.message);
          categories = await fetchAllCategoriesFromFirebase();
        }
        responseBody = { categories: categories };
      } else {
        return json({ error: 'Not found. Try /products, /categories, or /admin/sync.' }, 404, allowOrigin);
      }

      const response = json(responseBody, 200, allowOrigin);
      ctx.waitUntil(cache.put(cacheKey, response.clone()));
      return response;
    } catch (e) {
      return json({ error: e.message }, 502, allowOrigin);
    }
  },

  // Cloudflare Cron Trigger handler (see step 7 in the deploy notes above) -
  // keeps D1 in sync with whatever admin has been editing in Firebase,
  // automatically, without anyone needing to visit /admin/sync by hand.
  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      syncFromFirebase(env).catch(function (e) {
        console.error('Scheduled D1 sync failed:', e.message);
      })
    );
  }
};
