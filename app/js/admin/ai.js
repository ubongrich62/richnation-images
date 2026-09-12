// Admin → AI tab.
//
// The original file called the Anthropic API directly from the browser with
// a hardcoded API key embedded in client-side JS. That's a real credential
// leak — anyone can view-source it — so it is intentionally NOT carried over.
// This preserves the same UI/UX (quick prompts, chat history) but sends to
// `window.RNA_AI_ENDPOINT`, a server-side proxy you control that holds the
// real key and forwards to Anthropic. Until that endpoint is configured,
// the panel explains what's missing instead of silently failing.
const QUICK_PROMPTS = [
  'Draft reply to worried investor',
  'Write channel progress update',
  'Welcome new member',
  'Reply to monetization question',
  'Encourage patience'
];

function renderAiTab(el) {
  const configured = !!window.RNA_AI_ENDPOINT;
  const history = [];

  const card = div({ class: 'card' });
  card.appendChild(div({ class: 'card-title' }, 'AI Assistant'));
  if (!configured) {
    card.appendChild(div({ class: 'info-box info-box-brand' },
      'AI Assistant is not wired up in this build. Set window.RNA_AI_ENDPOINT to a server-side proxy that holds your Anthropic API key and forwards requests — never call the API with a key embedded in this page.'));
  }

  const chips = div({ class: 'u-flex u-gap-sm u-wrap', style: { marginBottom: 14 } });
  QUICK_PROMPTS.forEach(p => chips.appendChild(button(p, 'ghost', () => { input.value = p; send(); }, 'btn-sm')));
  card.appendChild(chips);

  const msgs = div({ class: 'chat-area', style: { minHeight: 240, maxHeight: 380, background: 'var(--surf-0)', borderRadius: 'var(--radius-sm)', marginBottom: 10 } });
  card.appendChild(msgs);

  const row = div({ class: 'u-flex u-gap-sm' });
  const input = h('textarea', { class: 'compose-input', placeholder: configured ? 'Ask the AI assistant...' : 'AI assistant not configured', rows: 2, disabled: !configured });
  const sendBtn = button('Send', 'primary', send, '');
  sendBtn.disabled = !configured;
  row.appendChild(input); row.appendChild(sendBtn);
  card.appendChild(row);
  el.appendChild(card);

  input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });

  function addBubble(role, text) {
    const isUser = role === 'user';
    const row = div({ class: 'msg-row' + (isUser ? ' is-own' : '') });
    const body = div({ class: 'msg-body' });
    body.appendChild(div({ class: 'msg-bubble ' + (isUser ? 'is-me' : 'is-them') }, text));
    if (!isUser) {
      const copyLink = span({ class: 'u-small', style: { color: 'var(--text-3)', cursor: 'pointer', textDecoration: 'underline', marginTop: 3 } }, 'Copy');
      copyLink.addEventListener('click', () => copyToClipboard(text));
      body.appendChild(copyLink);
    }
    row.appendChild(body);
    msgs.appendChild(row);
    msgs.scrollTop = msgs.scrollHeight;
    return row;
  }

  async function send() {
    const text = input.value.trim();
    if (!text || !configured) return;
    input.value = '';
    addBubble('user', text);
    history.push({ role: 'user', content: text });
    const placeholder = addBubble('assistant', '...');
    try {
      const res = await fetch(window.RNA_AI_ENDPOINT, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history.slice(-10) })
      });
      const data = await res.json();
      const reply = data.reply || data.text || '(no response)';
      placeholder.remove();
      addBubble('assistant', reply);
      history.push({ role: 'assistant', content: reply });
    } catch (e) {
      placeholder.remove();
      addBubble('assistant', 'Error reaching AI endpoint: ' + e.message);
    }
  }
}
