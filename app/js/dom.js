// Tiny hyperscript-style DOM helper — no framework, no build step.
function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  if (props) Object.entries(props).forEach(([k, v]) => {
    if (v == null) return;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (['value', 'type', 'placeholder', 'rows', 'accept', 'src', 'alt', 'disabled', 'checked', 'href', 'target', 'name', 'min', 'max', 'title'].includes(k)) el[k] = v;
    else el.setAttribute(k, v);
  });
  kids.flat(3).forEach(c => {
    if (c == null || c === false) return;
    el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  });
  return el;
}
const div = (...a) => h('div', ...a);
const span = (...a) => h('span', ...a);
const btn = (...a) => h('button', ...a);
const inputEl = (...a) => h('input', ...a);
const textareaEl = (...a) => h('textarea', ...a);
const selectEl = (...a) => h('select', ...a);
const labelEl = (...a) => h('label', ...a);
const optionEl = (...a) => h('option', ...a);
const pEl = (...a) => h('p', ...a);

function clear(el) { el.innerHTML = ''; }
function mount(root, el) { clear(root); if (el) root.appendChild(el); }
