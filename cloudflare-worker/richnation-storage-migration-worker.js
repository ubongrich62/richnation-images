// RichNation Mall — Cloudflare Worker, ONE-TIME tool to finish the Firebase
// Storage -> R2 migration that richnation-storage-worker.js started.
//
// BACKGROUND: richnation-storage-worker.js already sends every NEW image
// upload to R2. But images uploaded BEFORE that Worker existed are still
// sitting on Firebase Storage, and their URLs are still saved throughout
// the Realtime Database (product photos, banners, staff/vendor/rider/
// investor photos, review photos, etc.) — Firebase Storage keeps charging
// you for storage + egress on those until they're actually moved. This
// Worker does that move: finds every Firebase Storage URL anywhere in the
// database, downloads that file, uploads it to your existing R2 bucket,
// and rewrites the database record to point at R2 instead.
//
// WHY THIS IS ITS OWN WORKER, WITH ITS OWN SECRET KEY (unlike the other
// three Workers, which have no login): those Workers each do one narrow,
// validated thing (send a push to a token you already own; upload one
// image under 8MB into an allow-listed folder). This Worker can overwrite
// ANY path in your entire database — that is real, broad power, so unlike
// the rest of this app it does NOT run open. Nobody can trigger it without
// the MIGRATION_KEY secret you set below.
//
// ── HOW TO DEPLOY (no command line needed) ──
// 1. Cloudflare dashboard -> Compute -> Workers -> Create -> Create Worker.
//    Name it e.g. richnation-storage-migration, Deploy.
// 2. "Edit code" -> delete the sample -> paste this entire file in -> Deploy.
// 3. Settings -> Bindings -> Add -> R2 Bucket. Variable name: BUCKET (must
//    match exactly). Bucket: the same richnation-storage bucket the storage
//    Worker already uses.
// 4. Settings -> Variables and Secrets -> Add -> type: Secret.
//      Name: FIREBASE_SERVICE_ACCOUNT — value: same service account JSON
//      you already generated for richnation-push-worker.js (or generate a
//      new one: Firebase Console -> Project settings -> Service accounts ->
//      Generate new private key). Paste the ENTIRE file contents as-is.
// 5. Add a second Secret:
//      Name: MIGRATION_KEY — value: make up any long random string
//      yourself (this is the password that protects this Worker — nobody
//      else knows it, so nobody else can run this).
// 6. Confirm STORAGE_WORKER_HOST below actually matches your deployed
//    richnation-storage Worker's real URL (shown at the top of ITS page).
//
// ── HOW TO USE ──
// Visit, in your own browser, once deployed:
//   https://<this-worker>.<your-subdomain>.workers.dev/?key=<your MIGRATION_KEY>
// This is a DRY RUN — it reports every Firebase Storage URL it found and
// what it WOULD do, and changes nothing. Read that report.
// When it looks right, visit the same URL with &commit=true added:
//   https://<this-worker>.<your-subdomain>.workers.dev/?key=<your MIGRATION_KEY>&commit=true
// Each call migrates a small batch and tells you how many are left —
// keep reloading that same URL until the response says remaining: 0.
// Nothing is deleted from Firebase Storage by this tool — once you've
// confirmed the app looks correct with everything on R2, delete the old
// files from Firebase Storage yourself, on your own schedule.
// When you're done migrating, delete this Worker entirely — it has no
// further use and no reason to keep existing with this much access.

const FIREBASE_DB_URL = 'https://richnation-portal-default-rtdb.firebaseio.com';
// Must match your actual deployed richnation-storage Worker's URL (shown at
// the top of its Cloudflare dashboard page). Double-check this before running.
const STORAGE_WORKER_HOST = 'https://richnation-storage.ubongrich62.workers.dev';
// Never touched by this tool — these two paths hold sensitive admin-only
// data unrelated to images, and are deliberately never even fetched.
const SKIP_TOP_LEVEL_KEYS = ['mgmt_vault', 'mgmt_notes'];
const BATCH_SIZE = 15; // small on purpose: Workers cap subrequests per call

function json(body, status){
  return new Response(JSON.stringify(body, null, 2), {status: status||200, headers:{'Content-Type':'application/json'}});
}
function base64url(input){
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : new Uint8Array(input);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function pemToArrayBuffer(pem){
  const b64 = pem.replace(/-----BEGIN PRIVATE KEY-----/,'').replace(/-----END PRIVATE KEY-----/,'').replace(/\s+/g,'');
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

// Same service-account -> OAuth access-token exchange as richnation-push-worker.js,
// using the exact scope list Firebase's own Admin SDK requests — this is what
// lets a single request bypass per-record Database Rules the same way the
// Admin SDK does, which a plain unauthenticated request cannot.
async function getAccessToken(serviceAccount){
  const now = Math.floor(Date.now()/1000);
  const header = {alg:'RS256', typ:'JWT'};
  const claims = {
    iss: serviceAccount.client_email,
    scope: [
      'https://www.googleapis.com/auth/cloud-platform',
      'https://www.googleapis.com/auth/firebase.database',
      'https://www.googleapis.com/auth/userinfo.email'
    ].join(' '),
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now
  };
  const signingInput = base64url(JSON.stringify(header)) + '.' + base64url(JSON.stringify(claims));
  const cryptoKey = await crypto.subtle.importKey('pkcs8', pemToArrayBuffer(serviceAccount.private_key),
    {name:'RSASSA-PKCS1-v1_5', hash:'SHA-256'}, false, ['sign']);
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, new TextEncoder().encode(signingInput));
  const jwt = signingInput + '.' + base64url(signature);

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {'Content-Type':'application/x-www-form-urlencoded'},
    body: 'grant_type=' + encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer') + '&assertion=' + jwt
  });
  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) throw new Error('Could not get an access token from Google: ' + JSON.stringify(tokenData));
  return tokenData.access_token;
}

// Matches a Firebase Storage download URL and pulls out the underlying
// object path, e.g. "products/1789_abc.jpg" from
// https://firebasestorage.googleapis.com/v0/b/BUCKET/o/products%2F1789_abc.jpg?alt=media&token=...
const FIREBASE_STORAGE_URL_RE = /^https:\/\/firebasestorage\.googleapis\.com\/v0\/b\/[^/]+\/o\/([^?]+)\?/;

function findStorageUrls(node, pathSoFar, out){
  if (node === null || node === undefined) return;
  if (typeof node === 'string'){
    const m = node.match(FIREBASE_STORAGE_URL_RE);
    if (m) out.push({dbPath: pathSoFar, oldUrl: node, objectPath: decodeURIComponent(m[1])});
    return;
  }
  if (typeof node !== 'object') return;
  for (const key of Object.keys(node)){
    findStorageUrls(node[key], pathSoFar.concat([key]), out);
  }
}

function guessContentType(objectPath){
  const ext = (objectPath.split('.').pop() || '').toLowerCase();
  return {jpg:'image/jpeg', jpeg:'image/jpeg', png:'image/png', gif:'image/gif',
          webp:'image/webp', svg:'image/svg+xml'}[ext] || 'application/octet-stream';
}

export default {
  async fetch(request, env){
    const url = new URL(request.url);
    if (!env.MIGRATION_KEY || url.searchParams.get('key') !== env.MIGRATION_KEY){
      return json({error:'Missing or wrong key.'},403);
    }
    if (!env.FIREBASE_SERVICE_ACCOUNT) return json({error:'FIREBASE_SERVICE_ACCOUNT secret is not set.'},500);
    if (!env.BUCKET) return json({error:'R2 bucket binding (BUCKET) is not set.'},500);

    let serviceAccount;
    try { serviceAccount = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT); }
    catch (e) { return json({error:'FIREBASE_SERVICE_ACCOUNT secret is not valid JSON.'},500); }

    let accessToken;
    try { accessToken = await getAccessToken(serviceAccount); }
    catch (e) { return json({error:'Auth with Google failed: ' + e.message},502); }

    let tree;
    try {
      const res = await fetch(FIREBASE_DB_URL + '/.json?auth=' + accessToken);
      if (!res.ok) return json({error:'Could not read the database: HTTP ' + res.status},502);
      tree = await res.json();
    } catch (e) { return json({error:'Could not read the database: ' + e.message},502); }

    for (const k of SKIP_TOP_LEVEL_KEYS) delete tree[k];

    const found = [];
    findStorageUrls(tree, [], found);

    const commit = url.searchParams.get('commit') === 'true';
    if (!commit){
      return json({
        mode: 'dry-run — nothing was changed',
        totalFound: found.length,
        sample: found.slice(0, BATCH_SIZE).map(f => ({dbPath: f.dbPath.join('/'), objectPath: f.objectPath, willBecome: STORAGE_WORKER_HOST + '/' + f.objectPath})),
        note: found.length > BATCH_SIZE
          ? 'Showing the first ' + BATCH_SIZE + ' of ' + found.length + '. Add &commit=true when ready; each call migrates a small batch and is safe to call repeatedly until remaining is 0.'
          : 'Add &commit=true when ready.'
      });
    }

    const batch = found.slice(0, BATCH_SIZE);
    const results = [];
    for (const item of batch){
      try {
        const imgRes = await fetch(item.oldUrl);
        if (!imgRes.ok) { results.push({dbPath: item.dbPath.join('/'), ok:false, error:'download failed: HTTP ' + imgRes.status}); continue; }
        const bytes = await imgRes.arrayBuffer();
        await env.BUCKET.put(item.objectPath, bytes, {httpMetadata:{contentType: imgRes.headers.get('Content-Type') || guessContentType(item.objectPath)}});

        const newUrl = STORAGE_WORKER_HOST + '/' + item.objectPath;
        const dbPathStr = item.dbPath.map(encodeURIComponent).join('/');
        const patchRes = await fetch(FIREBASE_DB_URL + '/' + dbPathStr + '.json?auth=' + accessToken, {
          method: 'PUT',
          body: JSON.stringify(newUrl)
        });
        if (!patchRes.ok) { results.push({dbPath: item.dbPath.join('/'), ok:false, error:'DB update failed: HTTP ' + patchRes.status}); continue; }

        results.push({dbPath: item.dbPath.join('/'), ok:true, newUrl});
      } catch (e) {
        results.push({dbPath: item.dbPath.join('/'), ok:false, error: e.message});
      }
    }

    return json({
      mode: 'commit',
      migratedThisBatch: results.filter(r => r.ok).length,
      failedThisBatch: results.filter(r => !r.ok),
      remaining: found.length - batch.length,
      results
    });
  }
};
