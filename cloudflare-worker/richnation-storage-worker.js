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
// 1. Cloudflare dashboard -> R2 Object Storage -> Create bucket.
//    Name it richnation-storage (or anything, you'll reference it below).
// 2. Cloudflare dashboard -> Workers & Pages -> Create -> Create Worker.
//    Name it whatever you like, e.g. richnation-storage.
// 3. Click "Edit code", delete the sample code, paste this entire file in,
//    click "Deploy".
// 4. Back on the Worker's page -> Settings -> Bindings -> Add binding ->
//    R2 Bucket. Variable name: BUCKET (must match exactly, that's the name
//    this code refers to below). Bucket: the one you made in step 1.
// 5. Your Worker's URL is shown at the top of its page, looks like
//    https://richnation-storage.<your-subdomain>.workers.dev, that's the
//    URL to paste into the app's admin Site Customiser.
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
  'reviews','staff-photos','staff-products','investor-photos','rider-photos'
]);
const ANY_FILE_FOLDERS = new Set(['task-files','submissions']);

function corsHeaders(){
  return {
    'Access-Control-Allow-Origin':'*',
    'Access-Control-Allow-Methods':'GET,POST,DELETE,OPTIONS',
    'Access-Control-Allow-Headers':'Content-Type'
  };
}
function json(body,status){
  return new Response(JSON.stringify(body),{status:status||200,headers:Object.assign({'Content-Type':'application/json'},corsHeaders())});
}
function folderOf(path){return (path.split('/')[0]||'');}

export default {
  async fetch(request, env){
    const url = new URL(request.url);
    const path = decodeURIComponent(url.pathname.slice(1)); // strip leading /

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
    if(request.method === 'DELETE' && url.searchParams.has('path')){
      await env.BUCKET.delete(url.searchParams.get('path'));
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
