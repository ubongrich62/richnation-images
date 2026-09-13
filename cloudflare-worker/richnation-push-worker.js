// RichNation Mall — Cloudflare Worker, sends real push notifications via
// Firebase Cloud Messaging (FCM).
//
// WHY THIS EXISTS: this app has no backend server (same reason logins are a
// client-side password check instead of a real auth server), but actually
// SENDING a push notification requires a privileged call to Google's FCM
// API, signed with a Firebase service account key. That key must never be
// embedded in the six public static app files (anyone could read it out of
// the page source and send arbitrary pushes as your project). This Worker
// is the small, private place that key lives instead, exactly the same
// pattern as richnation-storage-worker.js keeps your R2 bucket credentials
// out of the public site.
//
// ── HOW TO DEPLOY (no command line needed) ──
// 1. Firebase Console -> your project -> gear icon -> Project settings ->
//    Cloud Messaging tab -> under "Web configuration", generate a key pair
//    if you don't have one already (this is your VAPID key, the app needs
//    it too, see below, it's fine to be public).
// 2. Same Project settings -> Service accounts tab -> "Generate new private
//    key" -> Generate key. This downloads a .json file. KEEP THIS FILE
//    PRIVATE, do not commit it to this repo, do not paste it into any of
//    the six app files, it only ever goes into the Worker secret in step 5.
// 3. Cloudflare dashboard -> left sidebar -> Compute -> Workers -> Create ->
//    Create Worker. Name it something like richnation-push, Deploy.
// 4. On the Worker's page, click "Edit code", delete the sample code, paste
//    this entire file in, click "Deploy" again.
// 5. Back on the Worker's page -> Settings -> Variables and Secrets -> Add
//    -> type: Secret. Name it exactly FIREBASE_SERVICE_ACCOUNT (must match
//    exactly). Value: open the .json file from step 2 in a text editor,
//    copy its ENTIRE contents, paste as the secret's value. Save.
// 6. Your Worker's URL is shown at the top of its page, looks like
//    https://richnation-push.<your-subdomain>.workers.dev, paste that into
//    the app's admin Site Customiser -> Push Notifications -> Push Worker
//    URL, and paste the VAPID key from step 1 into the field next to it.
//
// SECURITY NOTE: like the storage Worker, this endpoint has no login (none
// of the six app pages have a server-side session to check), it relies on
// FCM device tokens being long, unguessable, per-device secrets that only
// get onto a device by that browser actually subscribing, the same risk
// profile as everything else in this app that has no backend. It does NOT
// accept or forward anything from the caller into the signed request other
// than the token/title/body/data you're choosing to send, so it can't be
// used to exfiltrate the service account key or sign arbitrary requests.

function corsHeaders(){
  return {
    'Access-Control-Allow-Origin':'*',
    'Access-Control-Allow-Methods':'POST,OPTIONS',
    'Access-Control-Allow-Headers':'Content-Type'
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
// Worker isolate (a cold start just fetches a fresh one), access tokens are
// valid for an hour, no reason to sign a fresh JWT and round-trip Google's
// token endpoint on every single push sent.
let _cachedToken = null, _cachedTokenExp = 0;

async function getAccessToken(serviceAccount){
  const now = Math.floor(Date.now()/1000);
  if (_cachedToken && _cachedTokenExp > now + 60) return _cachedToken;

  const header = {alg:'RS256', typ:'JWT'};
  const claims = {
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
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

async function sendOne(serviceAccount, accessToken, token, title, body, data, url){
  const message = {
    message: {
      token: token,
      notification: {title: title, body: body},
      data: Object.keys(data||{}).reduce(function(acc,k){acc[k]=String(data[k]);return acc;},{}), // FCM data payload values must be strings
      webpush: {
        notification: {icon: 'https://richnationmall.com/images/branding/richnation-logo-v3.png'},
        fcm_options: url ? {link: url} : undefined
      }
    }
  };
  const res = await fetch('https://fcm.googleapis.com/v1/projects/' + serviceAccount.project_id + '/messages:send', {
    method: 'POST',
    headers: {'Authorization':'Bearer ' + accessToken, 'Content-Type':'application/json'},
    body: JSON.stringify(message)
  });
  const result = await res.json();
  // FCM's own way of saying "this token is dead, stop sending to it", the
  // caller uses this to clean stale tokens off a customer/rider/admin record.
  const isInvalidToken = !res.ok && result.error && result.error.status && ['NOT_FOUND','UNREGISTERED','INVALID_ARGUMENT'].includes(result.error.status);
  return {token: token, ok: res.ok, invalidToken: isInvalidToken, error: res.ok ? null : (result.error && result.error.message)};
}

export default {
  async fetch(request, env){
    if (request.method === 'OPTIONS') return new Response(null,{status:204,headers:corsHeaders()});
    if (request.method !== 'POST') return json({error:'Method not allowed'},405);
    if (!env.FIREBASE_SERVICE_ACCOUNT) return json({error:'This Worker is not configured yet, the FIREBASE_SERVICE_ACCOUNT secret is missing.'},500);

    let payload;
    try { payload = await request.json(); } catch (e) { return json({error:'Invalid JSON body'},400); }

    const tokens = Array.isArray(payload.tokens) ? payload.tokens.filter(Boolean) : (payload.token ? [payload.token] : []);
    if (!tokens.length) return json({error:'No token(s) provided'},400);
    if (!payload.title || !payload.body) return json({error:'title and body are required'},400);

    let serviceAccount;
    try { serviceAccount = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT); }
    catch (e) { return json({error:'FIREBASE_SERVICE_ACCOUNT secret is not valid JSON'},500); }

    let accessToken;
    try { accessToken = await getAccessToken(serviceAccount); }
    catch (e) { return json({error:'Auth with Google failed: ' + e.message},502); }

    const results = await Promise.all(tokens.map(function(t){
      return sendOne(serviceAccount, accessToken, t, payload.title, payload.body, payload.data, payload.url);
    }));
    return json({results: results});
  }
};
