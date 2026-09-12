// Minimal Firebase Realtime Database REST client (no SDK).
// Mirrors the subset of the SDK surface the app needs; "realtime" updates
// are simulated by polling since the REST API has no push/streaming here.
const FB_URL = 'https://richnation-portal-default-rtdb.firebaseio.com';
const POLL_MS = 2500;

function fbFetch(path, opts) {
  return fetch(FB_URL + '/' + path + '.json', opts).then(r => r.json());
}

const activePolls = new Map();

function startPoll(key, url, cb) {
  stopPoll(key);
  const tick = () => fetch(url).then(r => r.json()).then(val => cb({ val: () => val })).catch(() => {});
  tick();
  activePolls.set(key, setInterval(tick, POLL_MS));
}
function stopPoll(key) {
  if (activePolls.has(key)) { clearInterval(activePolls.get(key)); activePolls.delete(key); }
}

function dbRef(path) {
  const base = FB_URL + '/' + path + '.json';
  return {
    path,
    once: () => fbFetch(path).then(val => ({ val: () => val })),
    set: data => fbFetch(path, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
    update: data => fbFetch(path, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
    push: data => fbFetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
    remove: () => fbFetch(path, { method: 'DELETE' }),
    on: (evt, cb) => { startPoll(path, base, cb); return path; },
    off: () => stopPoll(path),
    orderByEqualTo: (child, val) => ({
      once: () => fetch(base + `?orderBy="${child}"&equalTo=${JSON.stringify(val)}`).then(r => r.json()).then(val => ({ val: () => val }))
    }),
    limitToLast: n => ({
      on: (evt, cb) => { startPoll(path + '_lim', `${base}?limitToLast=${n}&orderBy="$key"`, cb); return path + '_lim'; },
      once: () => fetch(`${base}?limitToLast=${n}&orderBy="$key"`).then(r => r.json()).then(val => ({ val: () => val }))
    })
  };
}

const db = { ref: dbRef };
