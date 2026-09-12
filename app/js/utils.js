// Shared helpers: session storage, formatting, toasts, and small form-field builders.
const SESSION_KEY = 'rna_sess_v2';

function uid() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }

function getSession() {
  try { const s = localStorage.getItem(SESSION_KEY); return s ? JSON.parse(s) : null; }
  catch { return null; }
}
function setSession(u) { localStorage.setItem(SESSION_KEY, JSON.stringify(u)); }
function clearSession() { localStorage.removeItem(SESSION_KEY); }

function toast(msg, isError) {
  document.querySelectorAll('.toast').forEach(t => t.remove());
  const t = div({ class: 'toast' + (isError ? ' toast-error' : '') }, msg);
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3200);
}

function initials(name) {
  return (name || '?').split(' ').filter(Boolean).map(n => n[0]).join('').slice(0, 2).toUpperCase();
}
function timeStr(ts) { return new Date(ts || Date.now()).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }); }
function dateStr(ts) { return new Date(ts || Date.now()).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); }
function naira(n) { const v = Number(n || 0); return '₦' + v.toLocaleString('en-NG'); }

function badge(text, kind) { return span({ class: 'badge badge-' + (kind || 'muted') }, text); }
function button(text, kind, cb, extra) { return btn({ class: 'btn btn-' + (kind || 'primary') + (extra ? ' ' + extra : ''), onClick: cb || null }, text); }

function fieldLabel(text) { return labelEl({ class: 'field-label' }, text); }
function fieldInput(val, cb, placeholder, type) {
  const i = inputEl({ class: 'input', type: type || 'text', placeholder: placeholder || '', value: val || '' });
  if (cb) i.addEventListener('input', e => cb(e.target.value));
  return i;
}
function fieldTextarea(val, cb, placeholder, rows) {
  const t = textareaEl({ class: 'textarea', placeholder: placeholder || '', rows: rows || 3 }, val || '');
  if (cb) t.addEventListener('input', e => cb(e.target.value));
  return t;
}
function fieldSelect(val, opts, cb) {
  const s = selectEl({ class: 'select' });
  opts.forEach(([v, l]) => {
    const o = optionEl({ value: v }, l || v);
    if (String(v) === String(val)) o.selected = true;
    s.appendChild(o);
  });
  if (cb) s.addEventListener('change', e => cb(e.target.value));
  return s;
}
function field(labelText, control) {
  return div({ class: 'field' }, fieldLabel(labelText), control);
}

// Password/coupon generation — charset excludes ambiguous chars (I,O,l,0,1).
const PW_CHARSET = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789@#';
function randomChars(len) {
  let out = '';
  for (let i = 0; i < len; i++) out += PW_CHARSET[Math.floor(Math.random() * PW_CHARSET.length)];
  return out;
}
function genPassword(prefix, len) { return (prefix || 'RNA@') + randomChars(len || 8); }

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => toast('Copied to clipboard.')).catch(() => toast('Could not copy.', true));
}
function waLink(phone, message) {
  const digits = String(phone || '').replace(/[^\d]/g, '');
  return 'https://wa.me/' + digits + (message ? '?text=' + encodeURIComponent(message) : '');
}

// Renders a label/value row, or null if the value is empty/placeholder-ish —
// used across admin detail panels to keep sparse records readable.
function detailRow(label, value) {
  const v = value == null ? '' : String(value).trim();
  if (!v || ['n0', 'n', 'undefined', 'null'].includes(v.toLowerCase())) return null;
  return div({ class: 'detail-row' }, span({ class: 'detail-row-label' }, label), span({ class: 'detail-row-value' }, v));
}
