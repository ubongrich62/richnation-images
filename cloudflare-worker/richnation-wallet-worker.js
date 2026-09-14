// RichNation Mall — Cloudflare Worker, the ONLY place wallet balances,
// RichPoints, salaries, and payout totals are allowed to change.
//
// WHY THIS EXISTS: every one of the six app pages is a static file with no
// backend, so before this Worker existed, a customer's own browser wrote its
// own new walletBalance/points straight to Firebase (and could call the
// award/credit/debit helper functions directly from the browser console
// with whatever amount it liked, no real payment or purchase required), and
// admin.html wrote every staff/vendor/rider/investor payout the same way.
// Firebase's rules alone can't tell "the real app doing a legitimate
// update" apart from "someone hand-crafting the same request with a number
// they made up", because both look identical over the REST API. That meant
// anyone who understood basic web requests, or just opened devtools, could
// give themselves a wallet balance or RichPoints balance of any size and
// spend it on real orders, no password or hacking tool needed. The
// Paystack card top-up had the same shape of problem for a different
// reason: it only credited the wallet based on what the CUSTOMER's OWN
// browser reported back after the payment popup closed, never checking
// with Paystack directly that a real payment actually happened.
//
// This Worker closes all of that the same way richnation-storage-worker.js
// and richnation-push-worker.js already keep other privileged operations
// out of public static HTML: it holds a trusted credential (a Firebase
// service account) that Realtime Database Rules automatically bypass, the
// same way the Admin SDK does, so once the matching rule change (see
// firebase-database.rules.json) is published, ONLY this Worker can change
// these specific fields, no matter what a browser sends Firebase directly.
// Every action below either verifies a real record (a real order, a real
// Paystack transaction) before crediting, or requires a secret only the
// admin panel knows before adjusting someone's money on request.
//
// ── HOW TO DEPLOY (no command line needed) ──
// 1. Firebase Console -> your project -> gear icon -> Project settings ->
//    Service accounts tab -> reuse the SAME service account .json file you
//    already generated for richnation-push-worker.js (or "Generate new
//    private key" if you need it again). KEEP THIS FILE PRIVATE.
// 2. Cloudflare dashboard -> Compute -> Workers -> Create -> Create Worker.
//    Name it something like richnation-wallet, Deploy.
// 3. "Edit code", delete the sample, paste this entire file in, Deploy.
// 4. Settings -> Variables and Secrets -> Add, three of them:
//    - Secret FIREBASE_SERVICE_ACCOUNT: paste the entire service account
//      .json contents (same value richnation-push-worker.js uses).
//    - Secret ADMIN_KEY: make up any long random password, this proves a
//      request to /adjust really came from your own admin panel.
//    - Secret PAYSTACK_SECRET_KEY: your Paystack secret key (starts
//      "sk_"), from your Paystack dashboard -> Settings -> API Keys &
//      Webhooks. Only needed for verifying card top-ups; never the same as
//      the "pk_" public key already used in the app.
// 5. Your Worker's URL is shown at the top of its page, paste it into the
//    app's admin Site Customiser -> Settings -> Wallet Worker URL, and
//    paste the same ADMIN_KEY into the field next to it (that panel is the
//    only place this key is ever typed in or stored, in that browser's own
//    localStorage, never in any of the six app files' source).
//
// WHAT CHANGES FOR EVERYONE ELSE: nothing about how the app looks or is
// used. Customers still see "Pay with Wallet", redeem points at checkout,
// and top up by card exactly as before. Admin still clicks "Adjust Wallet"
// and types a number. The only difference is the number is now checked and
// written by this trusted Worker instead of directly by whichever browser
// asked for the change.

function corsHeaders(){
  return {
    'Access-Control-Allow-Origin':'*',
    'Access-Control-Allow-Methods':'POST,OPTIONS',
    'Access-Control-Allow-Headers':'Content-Type,X-Admin-Key'
  };
}
function json(body,status){
  return new Response(JSON.stringify(body),{status:status||200,headers:Object.assign({'Content-Type':'application/json'},corsHeaders())});
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

// Cached in module scope, reused across requests handled by the same warm
// Worker isolate, an access token is valid for an hour.
let _cachedToken = null, _cachedTokenExp = 0;

async function getAccessToken(serviceAccount){
  const now = Math.floor(Date.now()/1000);
  if (_cachedToken && _cachedTokenExp > now + 60) return _cachedToken;

  const header = {alg:'RS256', typ:'JWT'};
  const claims = {
    iss: serviceAccount.client_email,
    // Grants this token the same trusted, rules-bypassing access the Admin
    // SDK has, exactly what lets this Worker read the TRUE current balance
    // and write the new one regardless of what the rules say for an
    // ordinary (unauthenticated) browser request. BOTH scopes are required
    // for that bypass: firebase.database alone still authenticates fine
    // (writes succeed against permissive rules), but Firebase only grants
    // full admin-style rule bypass when userinfo.email is paired with it,
    // the same combination the Admin SDK's own token request uses under the
    // hood. Missing userinfo.email is what caused this Worker's own writes
    // to money fields to start getting rejected by the .validate rules the
    // moment those rules were published, since without it the token is just
    // an ordinary authenticated request, fully subject to the rules meant
    // to exempt it.
    scope: 'https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now
  };
  const signingInput = base64url(JSON.stringify(header)) + '.' + base64url(JSON.stringify(claims));

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(serviceAccount.private_key),
    {name:'RSASSA-PKCS1-v1_5', hash:'SHA-256'},
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, new TextEncoder().encode(signingInput));
  const jwt = signingInput + '.' + base64url(signature);

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {'Content-Type':'application/x-www-form-urlencoded'},
    body: 'grant_type=' + encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer') + '&assertion=' + jwt
  });
  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) throw new Error('Could not get an access token from Google: ' + JSON.stringify(tokenData));

  _cachedToken = tokenData.access_token;
  _cachedTokenExp = now + (tokenData.expires_in || 3600);
  return _cachedToken;
}

// Firebase Realtime Database's REST API authenticates via an "auth" QUERY
// PARAMETER, whatever the credential type (legacy secret, a user's ID
// token, or a service-account OAuth2 access token), see
// https://firebase.google.com/docs/database/rest/auth. Neither of the two
// things this used to try (?access_token=, then an Authorization: Bearer
// header, both conventions from OTHER Google APIs) are what the Realtime
// Database itself checks, so both were silently ignored and every request
// was treated as fully unauthenticated, a flat 401 "Unauthorized request."
// regardless of whether the token was valid or the service account had the
// right IAM role.
function authedUrl(dbUrl, path, accessToken){
  return dbUrl.replace(/\/+$/,'') + '/' + path + '.json?auth=' + accessToken;
}
async function dbGet(dbUrl, path, accessToken){
  const r = await fetch(authedUrl(dbUrl, path, accessToken));
  if (!r.ok) return null;
  return await r.json();
}
// These three return {ok, status, text} instead of a bare boolean, so a
// failed write can tell you WHY (Firebase's own error text, e.g. a
// permission-denied reason or a validation failure) instead of just "it
// didn't work" — the difference between debugging this in five seconds
// versus guessing blind.
async function dbPatch(dbUrl, path, data, accessToken){
  const r = await fetch(authedUrl(dbUrl, path, accessToken), {
    method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify(data)
  });
  return {ok:r.ok, status:r.status, text: r.ok ? '' : await r.text()};
}
async function dbPut(dbUrl, path, data, accessToken){
  const r = await fetch(authedUrl(dbUrl, path, accessToken), {
    method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(data)
  });
  return {ok:r.ok, status:r.status, text: r.ok ? '' : await r.text()};
}
async function dbPost(dbUrl, path, data, accessToken){
  const r = await fetch(authedUrl(dbUrl, path, accessToken), {
    method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(data)
  });
  return {ok:r.ok, status:r.status, text: r.ok ? '' : await r.text()};
}
function dbErr(res){ return res.status + (res.text ? ': '+res.text : ''); }

// RichPoints rates, mirrored from index.html's rpRates() so this Worker can
// compute the CORRECT amount for a given reason itself instead of trusting
// whatever number the caller's browser sends. Falls back to the same
// defaults index.html uses when admin hasn't configured a rate yet.
function pointsRate(settings, key){
  const defaults = {review:20, referral:100, profile:30, share:10, coupon:10, register:500, newsletter:400, perNaira:100};
  const v = settings && settings[key];
  return (v != null) ? v : defaults[key];
}

// One-time bonuses (a flag field on the customer record stops this from
// ever paying out twice for the same person).
const ONE_TIME_REASONS = {
  signup:     {settingKey:'register',   flagField:'registerBonusAwarded'},
  newsletter: {settingKey:'newsletter', flagField:'newsletterBonusAwarded'},
  profile:    {settingKey:'profile',    flagField:'profileBonusAwarded'}
};
// Repeatable small awards, same fixed rate every time, no per-use record
// needed. share/coupon have no independently-verifiable server-side record
// of the action happening (a "share" or "coupon applied" leaves no durable
// trace to check against), so this Worker still trusts that the caller is
// the app calling it after a real share/coupon-apply, the same accepted
// trade-off already documented for every other endpoint in this app that
// has no login. Bounded, though: it can only ever be worth exactly the
// admin-configured rate, never whatever amount a scripted caller asks for.
const REPEATABLE_REASONS = ['share','coupon'];

export default {
  async fetch(request, env){
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null,{status:204,headers:corsHeaders()});
    if (request.method !== 'POST') return json({error:'Method not allowed'},405);
    if (!env.FIREBASE_SERVICE_ACCOUNT) return json({error:'This Worker is not configured yet, the FIREBASE_SERVICE_ACCOUNT secret is missing.'},500);

    let payload;
    try { payload = await request.json(); } catch (e) { return json({error:'Invalid JSON body'},400); }
    if (!payload.dbUrl) return json({error:'dbUrl is required'},400);

    let serviceAccount;
    try { serviceAccount = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT); }
    catch (e) { return json({error:'FIREBASE_SERVICE_ACCOUNT secret is not valid JSON'},500); }

    let accessToken;
    try { accessToken = await getAccessToken(serviceAccount); }
    catch (e) { return json({error:'Auth with Google failed: ' + e.message},502); }

    const action = url.pathname.replace(/^\/+/,'').split('/')[0] || payload.action;

    // ── /spend: checkout wallet payment OR points redemption ──
    // The customer's browser never states a "new balance", only "please
    // take this many <field> for this reason". The TRUE current value is
    // read here, server-side, and it only proceeds if there's actually
    // enough, closing the hole where a customer could set their own
    // walletBalance/points directly in Firebase and spend the fabricated
    // amount on a real order.
    if (action === 'spend') {
      const {customerId, field, amount, orderId, description} = payload;
      if (!customerId || !['walletBalance','points'].includes(field) || !(amount > 0)) {
        return json({error:'customerId, a valid field, and a positive amount are required'},400);
      }
      const current = (await dbGet(payload.dbUrl, 'rn_mall_customers/'+customerId+'/'+field, accessToken)) || 0;
      if (current < amount) return json({error:'Insufficient balance', currentBalance: current}, 402);
      const newBalance = current - amount;
      const update = {}; update[field] = newBalance;
      const res1 = await dbPatch(payload.dbUrl, 'rn_mall_customers/'+customerId, update, accessToken);
      if (!res1.ok) return json({error:'Could not update balance ('+dbErr(res1)+')'},502);
      if (field === 'walletBalance') {
        await dbPost(payload.dbUrl, 'rn_mall_wallet_transactions/'+customerId, {type:'debit',amount:amount,description:description||('Order payment'+(orderId?' ('+orderId+')':'')),date:new Date().toISOString().slice(0,10),ts:Date.now()}, accessToken);
      }
      return json({ok:true, newBalance:newBalance});
    }

    // ── /earn: settings-driven points/wallet awards, amount decided here ──
    // The caller says WHY (a fixed reason key), never HOW MUCH, this
    // Worker looks the rate up in your own RichPoints settings and, for
    // "purchase" and "referral", checks a real order actually exists and
    // matches before paying out, so a scripted caller can't invent a
    // reason or an order to farm points against.
    if (action === 'earn') {
      const {customerId, reason, orderId} = payload;
      if (!customerId || !reason) return json({error:'customerId and reason are required'},400);
      const settings = await dbGet(payload.dbUrl, 'rn_mall_settings', accessToken) || {};
      const cust = await dbGet(payload.dbUrl, 'rn_mall_customers/'+customerId, accessToken);
      if (!cust) return json({error:'Customer not found'},404);

      const oneTime = ONE_TIME_REASONS[reason];
      if (oneTime) {
        if (cust[oneTime.flagField]) return json({ok:true, alreadyAwarded:true, amount:0});
        const amount = pointsRate(settings, oneTime.settingKey);
        if (amount <= 0) return json({ok:true, amount:0});
        const newVal = (cust.points||0) + amount;
        const update = {points:newVal}; update[oneTime.flagField] = true;
        const res1 = await dbPatch(payload.dbUrl, 'rn_mall_customers/'+customerId, update, accessToken);
        if (!res1.ok) return json({error:'Could not credit bonus ('+dbErr(res1)+')'},502);
        return json({ok:true, amount:amount, newBalance:newVal});
      }

      if (reason === 'purchase') {
        if (!orderId) return json({error:'orderId is required for a purchase award'},400);
        const order = await dbGet(payload.dbUrl, 'rn_mall_orders/'+orderId, accessToken);
        if (!order || !order.customer || order.customer.id !== customerId) return json({error:'Order not found for this customer'},404);
        if (order.pointsAwarded) return json({ok:true, alreadyAwarded:true, amount:0}); // never pays out twice for the same order
        const perNaira = pointsRate(settings,'perNaira') || 100;
        const amount = Math.floor((order.total||0)/perNaira);
        if (amount <= 0) return json({ok:true, amount:0});
        const newVal = (cust.points||0) + amount;
        const res1 = await dbPatch(payload.dbUrl, 'rn_mall_customers/'+customerId, {points:newVal}, accessToken);
        if (!res1.ok) return json({error:'Could not credit purchase points ('+dbErr(res1)+')'},502);
        const res2 = await dbPatch(payload.dbUrl, 'rn_mall_orders/'+orderId, {pointsAwarded:true}, accessToken);
        if (!res2.ok) return json({error:'Credited points but could not mark order ('+dbErr(res2)+')'},502);
        return json({ok:true, amount:amount, newBalance:newVal});
      }

      if (reason === 'referral') {
        if (!orderId) return json({error:'orderId is required for a referral award'},400);
        const order = await dbGet(payload.dbUrl, 'rn_mall_orders/'+orderId, accessToken);
        const referred = order && order.customer ? await dbGet(payload.dbUrl, 'rn_mall_customers/'+order.customer.id, accessToken) : null;
        if (!referred || referred.referredBy !== customerId) return json({error:'This order was not referred by this customer'},400);
        if (order.referralAwarded) return json({ok:true, alreadyAwarded:true, amount:0});
        const priorOrders = await dbGet(payload.dbUrl, 'rn_mall_customer_orders/'+order.customer.id, accessToken) || {};
        if (Object.keys(priorOrders).length > 1) return json({ok:true, alreadyAwarded:true, amount:0, reason:'not their first order'});
        const amount = pointsRate(settings,'referral');
        if (amount <= 0) return json({ok:true, amount:0});
        const newVal = (cust.points||0) + amount;
        const res1 = await dbPatch(payload.dbUrl, 'rn_mall_customers/'+customerId, {points:newVal}, accessToken);
        if (!res1.ok) return json({error:'Could not credit referral points ('+dbErr(res1)+')'},502);
        const res2 = await dbPatch(payload.dbUrl, 'rn_mall_orders/'+orderId, {referralAwarded:true}, accessToken);
        if (!res2.ok) return json({error:'Credited points but could not mark order ('+dbErr(res2)+')'},502);
        return json({ok:true, amount:amount, newBalance:newVal});
      }

      if (reason === 'review') {
        // Reviews live nested as rn_mall_reviews/{productId}/{reviewKey},
        // not as a flat top-level id, and are tagged with userId (the
        // reviewer), not customerId.
        const {productId, reviewKey} = payload;
        if (!productId || !reviewKey) return json({error:'productId and reviewKey are required for a review award'},400);
        const review = await dbGet(payload.dbUrl, 'rn_mall_reviews/'+productId+'/'+reviewKey, accessToken);
        if (!review || review.userId !== customerId) return json({error:'Review not found for this customer'},404);
        if (review.pointsAwarded) return json({ok:true, alreadyAwarded:true, amount:0});
        const amount = pointsRate(settings,'review');
        if (amount <= 0) return json({ok:true, amount:0});
        const newVal = (cust.points||0) + amount;
        const res1 = await dbPatch(payload.dbUrl, 'rn_mall_customers/'+customerId, {points:newVal}, accessToken);
        if (!res1.ok) return json({error:'Could not credit review points ('+dbErr(res1)+')'},502);
        const res2 = await dbPatch(payload.dbUrl, 'rn_mall_reviews/'+productId+'/'+reviewKey, {pointsAwarded:true}, accessToken);
        if (!res2.ok) return json({error:'Credited points but could not mark review ('+dbErr(res2)+')'},502);
        return json({ok:true, amount:amount, newBalance:newVal});
      }

      if (REPEATABLE_REASONS.includes(reason)) {
        const amount = pointsRate(settings, reason);
        if (amount <= 0) return json({ok:true, amount:0});
        const newVal = (cust.points||0) + amount;
        const res1 = await dbPatch(payload.dbUrl, 'rn_mall_customers/'+customerId, {points:newVal}, accessToken);
        if (!res1.ok) return json({error:'Could not credit points ('+dbErr(res1)+')'},502);
        return json({ok:true, amount:amount, newBalance:newVal});
      }

      return json({error:'Unknown reason'},400);
    }

    // ── /verify-topup: Paystack card top-up, verified server-side ──
    // Never trusts the browser's own "payment succeeded" callback, that
    // callback fires purely client-side and a scripted caller could invoke
    // it (or the old creditWallet function) directly without ever paying.
    // This asks Paystack itself whether that exact transaction reference
    // really was paid, and for how much, before crediting anything.
    if (action === 'verify-topup') {
      if (!env.PAYSTACK_SECRET_KEY) return json({error:'This Worker is not configured yet, the PAYSTACK_SECRET_KEY secret is missing.'},500);
      const {customerId, reference} = payload;
      if (!customerId || !reference) return json({error:'customerId and reference are required'},400);
      // Idempotency: a reference already recorded here was already credited,
      // refuse to pay out twice for a replayed/reused reference.
      const already = await dbGet(payload.dbUrl, 'rn_mall_processed_topups/'+reference, accessToken);
      if (already) return json({ok:true, alreadyCredited:true});
      let verifyRes, verifyData;
      try {
        verifyRes = await fetch('https://api.paystack.co/transaction/verify/'+encodeURIComponent(reference), {
          headers:{'Authorization':'Bearer '+env.PAYSTACK_SECRET_KEY}
        });
        verifyData = await verifyRes.json();
      } catch (e) { return json({error:'Could not reach Paystack: '+e.message},502); }
      const tx = verifyData && verifyData.data;
      if (!verifyRes.ok || !tx || tx.status !== 'success') return json({error:'Payment not verified as successful'},402);
      if (tx.customer && tx.customer.email) {
        const cust = await dbGet(payload.dbUrl, 'rn_mall_customers/'+customerId, accessToken);
        if (!cust || cust.email !== tx.customer.email) return json({error:'Payment email does not match this customer'},400);
      }
      const amount = Math.round((tx.amount||0)/100); // Paystack amounts are in kobo
      if (amount <= 0) return json({error:'Invalid amount on this transaction'},400);
      const cust2 = await dbGet(payload.dbUrl, 'rn_mall_customers/'+customerId, accessToken);
      if (!cust2) return json({error:'Customer not found'},404);
      const newBalance = (cust2.walletBalance||0) + amount;
      const res1 = await dbPatch(payload.dbUrl, 'rn_mall_customers/'+customerId, {walletBalance:newBalance}, accessToken);
      if (!res1.ok) return json({error:'Could not credit wallet ('+dbErr(res1)+')'},502);
      await dbPut(payload.dbUrl, 'rn_mall_processed_topups/'+reference, {customerId:customerId, amount:amount, ts:Date.now()}, accessToken);
      await dbPost(payload.dbUrl, 'rn_mall_wallet_transactions/'+customerId, {type:'credit',amount:amount,description:'Card top-up (Ref: '+reference+')',date:new Date().toISOString().slice(0,10),ts:Date.now()}, accessToken);
      return json({ok:true, amount:amount, newBalance:newBalance});
    }

    // ── /refund-order: customer self-cancels their own order ──
    // Same shape of problem as everything else here: the cancel-my-order
    // page used to read order.total out of a client-side copy of the order
    // and credit that straight to walletBalance. This re-reads the REAL
    // stored order, confirms it actually belongs to this customer, is
    // eligible for a refund, and hasn't already been refunded, before
    // crediting anything.
    if (action === 'refund-order') {
      const {customerId, orderId} = payload;
      if (!customerId || !orderId) return json({error:'customerId and orderId are required'},400);
      const order = await dbGet(payload.dbUrl, 'rn_mall_orders/'+orderId, accessToken);
      if (!order || !order.customer || order.customer.id !== customerId) return json({error:'Order not found for this customer'},404);
      if (order.payMethod === 'pod') return json({error:'Pay on Delivery orders are not refunded to wallet'},400);
      if (order.refunded) return json({ok:true, alreadyRefunded:true, amount:0});
      const amount = order.total || 0;
      if (amount <= 0) return json({ok:true, amount:0});
      const cust = await dbGet(payload.dbUrl, 'rn_mall_customers/'+customerId, accessToken);
      if (!cust) return json({error:'Customer not found'},404);
      const newBalance = (cust.walletBalance||0) + amount;
      const res1 = await dbPatch(payload.dbUrl, 'rn_mall_customers/'+customerId, {walletBalance:newBalance}, accessToken);
      if (!res1.ok) return json({error:'Could not process refund ('+dbErr(res1)+')'},502);
      const res2 = await dbPatch(payload.dbUrl, 'rn_mall_orders/'+orderId, {refunded:true}, accessToken);
      if (!res2.ok) return json({error:'Refunded but could not mark order ('+dbErr(res2)+')'},502);
      await dbPost(payload.dbUrl, 'rn_mall_wallet_transactions/'+customerId, {type:'refund',amount:amount,description:'Refund for cancelled order '+orderId,date:new Date().toISOString().slice(0,10),ts:Date.now()}, accessToken);
      return json({ok:true, amount:amount, newBalance:newBalance});
    }

    // ── /verify-payment: order payment (full or POD deposit), verified ──
    // Same problem as the wallet top-up: the checkout page used to mark an
    // order "Payment Confirmed" purely because the Paystack popup's own
    // callback fired in the browser, which a scripted caller could invoke
    // (or call saveOrder directly) without ever actually paying. This
    // checks with Paystack itself that the reference was really paid, for
    // at least the expected amount, before the app is allowed to treat the
    // order as paid.
    if (action === 'verify-payment') {
      if (!env.PAYSTACK_SECRET_KEY) return json({error:'This Worker is not configured yet, the PAYSTACK_SECRET_KEY secret is missing.'},500);
      const {reference, expectedAmount} = payload;
      if (!reference || !(expectedAmount > 0)) return json({error:'reference and expectedAmount are required'},400);
      const already = await dbGet(payload.dbUrl, 'rn_mall_processed_payments/'+reference, accessToken);
      if (already) return json({ok:true, alreadyVerified:true});
      let verifyRes, verifyData;
      try {
        verifyRes = await fetch('https://api.paystack.co/transaction/verify/'+encodeURIComponent(reference), {
          headers:{'Authorization':'Bearer '+env.PAYSTACK_SECRET_KEY}
        });
        verifyData = await verifyRes.json();
      } catch (e) { return json({error:'Could not reach Paystack: '+e.message},502); }
      const tx = verifyData && verifyData.data;
      if (!verifyRes.ok || !tx || tx.status !== 'success') return json({error:'Payment not verified as successful'},402);
      const paidAmount = Math.round((tx.amount||0)/100); // Paystack amounts are in kobo
      if (paidAmount < Math.round(expectedAmount)) return json({error:'Amount paid does not match the order total', paidAmount:paidAmount},400);
      await dbPut(payload.dbUrl, 'rn_mall_processed_payments/'+reference, {amount:paidAmount, ts:Date.now()}, accessToken);
      return json({ok:true, amount:paidAmount});
    }

    // ── /adjust: admin-only, general-purpose money field change ──
    // Every admin-panel action that changes a wallet/points/salary/payout
    // total (Adjust Wallet, Adjust Points, salary set/paid, vendor/rider/
    // investor payouts, withdrawal approvals) goes through here instead of
    // writing the field directly, gated on a shared key only this admin
    // panel knows (see the deploy notes above), never embedded in any of
    // the six public app files.
    if (action === 'adjust') {
      if (!env.ADMIN_KEY) return json({error:'This Worker is not configured yet, the ADMIN_KEY secret is missing.'},500);
      const suppliedKey = request.headers.get('X-Admin-Key') || payload.adminKey;
      if (!suppliedKey || suppliedKey !== env.ADMIN_KEY) return json({error:'Invalid admin key'},401);
      const {collection, id, field, mode, value} = payload;
      const ALLOWED_COLLECTIONS = ['rn_mall_customers','rn_mall_staff','rn_mall_vendors','rn_mall_riders','rn_mall_investors'];
      const ALLOWED_FIELDS = ['walletBalance','points','salary','totalPaid'];
      if (!ALLOWED_COLLECTIONS.includes(collection)) return json({error:'Unknown collection'},400);
      if (!ALLOWED_FIELDS.includes(field)) return json({error:'Field not allowed via this endpoint'},400);
      if (!id) return json({error:'id is required'},400);
      let newVal = value;
      if (mode === 'add') {
        const current = (await dbGet(payload.dbUrl, collection+'/'+id+'/'+field, accessToken)) || 0;
        newVal = current + (parseFloat(value)||0);
      }
      const update = {}; update[field] = newVal;
      const res1 = await dbPatch(payload.dbUrl, collection+'/'+id, update, accessToken);
      if (!res1.ok) return json({error:'Could not update record ('+dbErr(res1)+')'},502);
      return json({ok:true, newValue:newVal});
    }

    return json({error:'Unknown action, expected /spend, /earn, /verify-topup, or /adjust'},404);
  }
};
