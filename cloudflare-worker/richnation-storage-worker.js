// RichNation Mall — Cloudflare Worker, image/file storage on Cloudflare R2.
//
// This replaces Firebase Storage as the place product photos, review
// photos, staff/vendor/investor/rider profile photos, and staff task
// attachments live. R2 itself has no safe way to accept an unauthenticated
// upload straight from browser JavaScript (that needs either a secret
// signing key, which can never be embedded in a public static site, or a
// small server sitting in front of it), so this Worker is that small
// server: it validates the request, then writes to R2 using this Worker's
// own R2 binding (no key of any kind embedded in the six app files).
//
// WHAT THIS DOES NOT CHANGE: none of your existing images move. Anything
// already uploaded stays on Firebase Storage and keeps working exactly as
// it does today, this only changes where NEW uploads go from the moment
// it's wired in.
//
// ── HOW TO DEPLOY (no command line needed) ──
// 1. Cloudflare dashboard, left sidebar -> Storage & databases -> R2 ->
//    Overview -> Create bucket. Name it richnation-storage (or anything,
//    you'll reference it below), pick a location, Create bucket.
// 2. Left sidebar -> Compute -> Workers -> Create -> Create Worker.
//    Name it whatever you like, e.g. richnation-storage, Deploy.
// 3. On the Worker's page, click "Edit code", delete the sample code,
//    paste this entire file in, click "Deploy" again.
// 4. Back on the Worker's page -> Settings -> Bindings -> Add binding ->
//    R2 Bucket. Variable name: BUCKET (must match exactly, that's the name
//    this code refers to below). Bucket: the one you made in step 1.
// 5. Your Worker's URL is shown at the top of its page, looks like
//    https://richnation-storage.<your-subdomain>.workers.dev, that's the
//    URL to paste into the app's admin Site Customiser -> Settings ->
//    Storage (Cloudflare R2).
//
// NO SECRET KEY IS INVOLVED, ON PURPOSE. This app has no login system for
// any of its six public pages, every write to Firebase already works the
// same way, open to anyone who calls the URL, protected only by validating
// the shape of what's being written (folder name, file type, size), never
// by a password. A secret embedded in these same public static files would
// not actually be secret, anyone could read it out of the page source, so
// it would add complexity without adding real protection. This Worker uses
// the same structural checks (folder allow-list, image-only where that
// applies, size caps) as firebase-storage.rules already does today, that
// is the same risk profile as the rest of this app, not a weaker one.
//
// Storage cost from here: Cloudflare R2 free tier is 10GB storage and 10
// million reads a month, paid tier beyond that is $0.015/GB-month stored,
// and reads/downloads are free at any volume, that's the whole reason for
// this move. Workers requests (every upload, delete, and image view) are
// free up to 100,000/day, $0.30 per extra million after that.

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;   // 8MB, matches the old Storage rule cap
const MAX_FILE_BYTES = 15 * 1024 * 1024;   // 15MB, for non-image task/submission attachments

// Same folder list this app already writes to today (see firebase-storage.rules).
// Keeping an allow-list here for the same reason that file had one: there is no
// login on this endpoint (the six apps that upload are all public static pages),
// so this is what stops the endpoint being used to fill the bucket with junk.
const IMAGE_FOLDERS = new Set([
  'banners','products','staff','investors','riders','vendors','orders',
  'hero-banner','payment-icons','colors','vendor-photos','vendor-products',
  'reviews','staff-photos','staff-products','investor-photos','rider-photos',
  'promo-ads','popup-ads'
]);
const ANY_FILE_FOLDERS = new Set(['task-files','submissions','promo-ad-videos']);

// Only these origins are allowed to read this Worker's responses from a
// BROWSER — without this, any other website could silently use this
// Worker's upload endpoint (which has no secret key, by original design)
// as free file hosting for THEIR OWN content, off your R2 bucket. This
// does NOT stop a direct script/curl call made outside a browser, CORS is
// purely a browser-enforced mechanism.
const ALLOWED_ORIGINS = ['https://richnationmall.com', 'https://www.richnationmall.com'];
function pickAllowOrigin(originHeader){
  return ALLOWED_ORIGINS.includes(originHeader) ? originHeader : ALLOWED_ORIGINS[0];
}
function _corsHeaders(origin){
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods':'GET,POST,DELETE,OPTIONS',
    'Access-Control-Allow-Headers':'Content-Type',
    'Vary':'Origin'
  };
}
function _json(body,status,origin){
  return new Response(JSON.stringify(body),{status:status||200,headers:Object.assign({'Content-Type':'application/json'},_corsHeaders(origin))});
}
function folderOf(path){return (path.split('/')[0]||'');}

export default {
  async fetch(request, env){
    const url = new URL(request.url);
    const path = decodeURIComponent(url.pathname.slice(1)); // strip leading /
    // Shadows the module-level helpers above for the rest of this one
    // request, so every existing corsHeaders()/json(...) call below
    // automatically gets THIS request's real, safely-checked origin
    // without needing to touch each of those call sites individually.
    const allowOrigin = pickAllowOrigin(request.headers.get('Origin'));
    function corsHeaders(){ return _corsHeaders(allowOrigin); }
    function json(body,status){ return _json(body,status,allowOrigin); }

    if(request.method === 'OPTIONS'){
      return new Response(null,{status:204,headers:corsHeaders()});
    }

    // ── UPLOAD ──
    if(request.method === 'POST' && url.searchParams.has('path')){
      const uploadPath = url.searchParams.get('path');
      const folder = folderOf(uploadPath);
      const isImageFolder = IMAGE_FOLDERS.has(folder);
      const isAnyFileFolder = ANY_FILE_FOLDERS.has(folder);
      if(!isImageFolder && !isAnyFileFolder){
        return json({error:'Unknown folder: '+folder},400);
      }
      const contentType = request.headers.get('Content-Type') || 'application/octet-stream';
      if(isImageFolder && !contentType.startsWith('image/')){
        return json({error:'This folder only accepts images'},400);
      }
      const body = await request.arrayBuffer();
      const maxBytes = isImageFolder ? MAX_IMAGE_BYTES : MAX_FILE_BYTES;
      if(body.byteLength > maxBytes){
        return json({error:'File too large'},413);
      }
      await env.BUCKET.put(uploadPath, body, {httpMetadata:{contentType}});
      return json({url: url.origin + '/' + uploadPath});
    }

    // ── DELETE ──
    // Previously had NO folder check at all, unlike upload just above it,
    // meaning any path in the entire bucket (not just the app's own known
    // folders) could be deleted by anyone who found this Worker's URL. Now
    // held to the exact same allow-list as uploads, closing that gap without
    // touching the "no secret key" design (there's still no login on this
    // endpoint, deleting a file in one of the app's own folders is still
    // possible for anyone who can reach it, same accepted trade-off as
    // upload already has, but the entire rest of the bucket is now off-limits).
    if(request.method === 'DELETE' && url.searchParams.has('path')){
      const deletePath = url.searchParams.get('path');
      const folder = folderOf(deletePath);
      if(!IMAGE_FOLDERS.has(folder) && !ANY_FILE_FOLDERS.has(folder)){
        return json({error:'Unknown folder: '+folder},400);
      }
      await env.BUCKET.delete(deletePath);
      return json({ok:true});
    }

    // ── READ (what customers' browsers actually load as the image src) ──
    if(request.method === 'GET' && path){
      const obj = await env.BUCKET.get(path);
      if(!obj) return new Response('Not found',{status:404,headers:corsHeaders()});
      const headers = new Headers(corsHeaders());
      obj.writeHttpMetadata(headers);
      headers.set('etag', obj.httpEtag);
      headers.set('Cache-Control','public, max-age=31536000, immutable');
      return new Response(obj.body,{headers});
    }

    return json({error:'Not found'},404);
  }
};
