#!/usr/bin/env node
// ── MIGRATE OLD FIREBASE STORAGE IMAGES TO CLOUDFLARE R2 ──
//
// WHY THIS EXISTS: when RichNation Mall moved image uploads to Cloudflare R2
// (via richnation-storage-worker.js), that only changed where NEW uploads
// go. Every image uploaded before that switch is still sitting on Firebase
// Storage, still being served from there, still counting against Firebase's
// (much smaller) free tier. This script finds every one of those old URLs
// anywhere in the database, re-uploads the actual image bytes to R2 through
// your existing storage Worker, and rewrites the database to point at the
// new R2 URL instead — so from that point on, that image is served by R2,
// not Firebase.
//
// WHAT THIS DOES NOT DO: it does not delete the old copy sitting in Firebase
// Storage. It just stops anything from pointing at it. The old files sit
// there harmlessly (Firebase Storage's 5GB free tier is very unlikely to be
// an issue for leftover files nobody requests anymore) — clean them up later
// from Firebase Console -> Storage if you want to reclaim the space, there's
// no rush since they're not costing anything once nothing references them.
//
// ── HOW TO RUN (no npm install needed, just Node.js) ──
// 1. Requires Node.js 18 or newer (for built-in fetch). Check with: node -v
// 2. Fill in STORAGE_WORKER_URL below with your actual deployed Worker URL
//    (the one you pasted into Site Customiser -> Storage) - it MUST be filled
//    in before running, the script will refuse to run otherwise.
// 3. Dry run first, to see what it WOULD do without changing anything:
//      node scripts/migrate-images-to-r2.js --dry-run
// 4. Review the printed list and the log file it writes. If it looks right:
//      node scripts/migrate-images-to-r2.js
// 5. It writes a full log (migration-log-<timestamp>.json) of every URL it
//    changed, old -> new, so you have a record and can spot-check results.
// 6. Safe to re-run: anything already migrated no longer matches the
//    Firebase Storage URL pattern, so a second run just finds nothing left
//    to do.

const FIREBASE_DB_URL = 'https://richnation-portal-default-rtdb.firebaseio.com';
const STORAGE_WORKER_URL = ''; // <-- FILL THIS IN, e.g. 'https://richnation-storage.yoursubdomain.workers.dev'

const DRY_RUN = process.argv.includes('--dry-run');

// Matches both URL shapes Firebase Storage has used over the years.
const FIREBASE_STORAGE_URL_RE = /^https:\/\/(firebasestorage\.googleapis\.com|storage\.googleapis\.com)\/.+$/;

// Same folder allow-list richnation-storage-worker.js already enforces (see
// IMAGE_FOLDERS in that file) - this script only ever targets folders that
// are already on that list, so uploads can't be rejected with "Unknown
// folder". Falls back to 'products' (always allowed) for anything that
// doesn't map cleanly; worst case an image lands in a slightly odd folder,
// which is harmless, vs. a rejected upload, which isn't.
function guessFolder(path){
  const p = path.toLowerCase();
  if (p.startsWith('rn_mall_products')) return 'products';
  if (p.startsWith('rn_mall_staff')) return 'staff-photos';
  if (p.startsWith('rn_mall_investors')) return 'investor-photos';
  if (p.startsWith('rn_mall_riders')) return 'rider-photos';
  if (p.startsWith('rn_mall_vendors')) return 'vendor-photos';
  if (p.startsWith('rn_mall_orders')) return 'orders';
  if (p.includes('review')) return 'reviews';
  if (p.includes('bannerimages') || p.includes('herobanner') || p.includes('hero-banner')) return 'hero-banner';
  if (p.includes('custombanner') || p.includes('promoad')) return 'promo-ads';
  if (p.includes('popupad')) return 'popup-ads';
  if (p.includes('color')) return 'colors';
  if (p.includes('paymenticon')) return 'payment-icons';
  return 'products';
}

function extFromContentType(ct){
  if (ct.includes('png')) return '.png';
  if (ct.includes('webp')) return '.webp';
  if (ct.includes('gif')) return '.gif';
  if (ct.includes('svg')) return '.svg';
  return '.jpg';
}

// Walks the ENTIRE database export looking for string values that are
// Firebase Storage URLs, recording the exact path to each one (e.g.
// "rn_mall_products/abc123/images/0") so the new URL can be written back
// to that exact spot afterward, wherever in the tree it actually lives.
function collectFirebaseStorageUrls(node, path, out){
  if (node == null) return;
  if (typeof node === 'string') {
    if (FIREBASE_STORAGE_URL_RE.test(node)) out.push({ path, url: node });
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((child, i) => collectFirebaseStorageUrls(child, path ? path + '/' + i : String(i), out));
    return;
  }
  if (typeof node === 'object') {
    for (const key of Object.keys(node)) {
      collectFirebaseStorageUrls(node[key], path ? path + '/' + key : key, out);
    }
  }
}

async function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }

async function main(){
  if (!STORAGE_WORKER_URL && !DRY_RUN) {
    console.error('STORAGE_WORKER_URL is not set. Open this script and fill it in near the top before running for real.');
    console.error('(You can still run --dry-run without it, to see what would be migrated.)');
    process.exit(1);
  }

  console.log(DRY_RUN ? 'DRY RUN - no changes will be written.\n' : 'LIVE RUN - this WILL change your database and upload files to R2.\n');

  console.log('Fetching the full database (one request, this app\'s DB is small, should be quick)...');
  const dbRes = await fetch(FIREBASE_DB_URL + '/.json');
  if (!dbRes.ok) throw new Error('Failed to fetch database: HTTP ' + dbRes.status);
  const data = await dbRes.json();

  const found = [];
  collectFirebaseStorageUrls(data, '', found);

  console.log('Found ' + found.length + ' Firebase Storage URL(s) still referenced in the database.\n');
  if (!found.length) {
    console.log('Nothing to migrate. Every image reference already points somewhere else (R2 or otherwise).');
    return;
  }

  const log = [];
  let ok = 0, failed = 0;

  for (const item of found) {
    process.stdout.write('-> ' + item.path + ' ... ');
    try {
      if (DRY_RUN) {
        console.log('would migrate');
        log.push({ path: item.path, oldUrl: item.url, status: 'dry-run' });
        ok++;
        continue;
      }

      const imgRes = await fetch(item.url);
      if (!imgRes.ok) throw new Error('could not download original (HTTP ' + imgRes.status + ')');
      const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
      const buffer = Buffer.from(await imgRes.arrayBuffer());

      const folder = guessFolder(item.path);
      const newPath = folder + '/' + Date.now() + '_' + Math.random().toString(36).slice(2, 8) + extFromContentType(contentType);

      const uploadRes = await fetch(STORAGE_WORKER_URL.replace(/\/+$/, '') + '?path=' + encodeURIComponent(newPath), {
        method: 'POST',
        headers: { 'Content-Type': contentType },
        body: buffer
      });
      if (!uploadRes.ok) throw new Error('upload to R2 failed (HTTP ' + uploadRes.status + '): ' + (await uploadRes.text()));
      const uploadJson = await uploadRes.json();
      if (!uploadJson.url) throw new Error('Worker did not return a url in its response');

      const patchRes = await fetch(FIREBASE_DB_URL + '/' + item.path + '.json', {
        method: 'PUT',
        body: JSON.stringify(uploadJson.url)
      });
      if (!patchRes.ok) throw new Error('failed to update database (HTTP ' + patchRes.status + ')');

      console.log('done -> ' + uploadJson.url);
      log.push({ path: item.path, oldUrl: item.url, newUrl: uploadJson.url, status: 'ok' });
      ok++;

      await sleep(150); // stay polite to both services, this isn't a race
    } catch (e) {
      console.log('FAILED: ' + e.message);
      log.push({ path: item.path, oldUrl: item.url, error: e.message, status: 'failed' });
      failed++;
    }
  }

  const logFile = 'migration-log-' + Date.now() + '.json';
  require('fs').writeFileSync(logFile, JSON.stringify(log, null, 2));

  console.log('\n' + ok + ' succeeded, ' + failed + ' failed.');
  console.log('Full log written to ' + logFile);
  if (DRY_RUN) console.log('\nThis was a dry run - nothing was actually changed. Remove --dry-run to perform the real migration.');
  if (failed) console.log('\nSome images failed to migrate - check the log above for which ones and why. Safe to re-run: anything that already succeeded won\'t be touched again.');
}

main().catch(e => { console.error('\nMigration script crashed:', e); process.exit(1); });
