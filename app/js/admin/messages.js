// Admin → Messages tab: a per-member My Channel inbox with reply.
async function renderMessagesTab(el, session) {
  el.appendChild(div({ class: 'empty-state' }, 'Loading members...'));
  let members;
  try {
    const snap = await db.ref('rna_members').once();
    members = Object.values(snap.val() || {}).filter(m => m.id !== 'admin' && m.plan !== 'admin');
  } catch (e) {
    clear(el); el.appendChild(div({ class: 'empty-state' }, 'Could not load members: ' + e.message)); return;
  }
  clear(el);
  if (!members.length) { el.appendChild(div({ class: 'empty-state' }, 'No members yet.')); return; }
  members.forEach(m => el.appendChild(renderMemberInbox(m)));
}

function renderMemberInbox(m) {
  const pkg = PACKAGES[m.plan] || PACKAGES.standard;
  const card = div({ class: 'collapse-card' });
  const head = div({ class: 'collapse-head', style: { cursor: 'default' } });
  head.appendChild(div({ class: 'avatar avatar-md' }, initials(m.name)));
  const info = div({ style: { flex: 1, minWidth: 160 } });
  info.appendChild(div({ style: { fontWeight: 700, fontSize: 13.5 } }, m.name));
  info.appendChild(div({ class: 'u-small u-muted' }, m.email || ''));
  info.appendChild(badge(pkg.label, pkg.badge));
  head.appendChild(info);

  let chatOpen = false;
  const chatWrap = div({ style: { display: 'none' }, class: 'collapse-body' });
  const toggleBtn = button('Open Chat', 'dark', () => toggleChat(), 'btn-sm');
  head.appendChild(toggleBtn);
  card.appendChild(head); card.appendChild(chatWrap);

  let poll = null;
  function toggleChat() {
    chatOpen = !chatOpen;
    toggleBtn.textContent = chatOpen ? 'Close Chat' : 'Open Chat';
    chatWrap.style.display = chatOpen ? 'block' : 'none';
    if (chatOpen) startChat(); else stopChat();
  }
  function stopChat() { if (poll) { clearInterval(poll); poll = null; } }

  function startChat() {
    clear(chatWrap);
    const msgList = div({ class: 'chat-area', style: { maxHeight: 320 } });
    chatWrap.appendChild(msgList);
    const replyRow = div({ class: 'u-flex u-gap-sm', style: { marginTop: 10 } });
    const ta = h('textarea', { class: 'compose-input', placeholder: 'Reply to ' + m.name + '...', rows: 2 });
    const sendBtn = button('Send', 'primary', async () => {
      const text = ta.value.trim();
      if (!text) return;
      ta.value = '';
      await db.ref('rna_my_channel/' + m.id).push({
        id: uid(), text, senderId: 'admin', senderName: 'General Manager', senderPlan: 'admin',
        isAdmin: true, time: timeStr(), date: dateStr(), ts: Date.now()
      });
      await db.ref('rna_notifications_member/' + m.id).push({ type: 'reply', from: 'Management', text: text.slice(0, 80), date: dateStr(), read: false });
      toggleChat();
    }, 'btn-sm');
    replyRow.appendChild(ta); replyRow.appendChild(sendBtn);
    chatWrap.appendChild(replyRow);

    async function load() {
      try {
        const snap = await db.ref('rna_my_channel/' + m.id).limitToLast(60).once();
        const val = snap.val() || {};
        const entries = Object.entries(val).sort((a, b) => (a[1].ts || 0) - (b[1].ts || 0));
        clear(msgList);
        if (!entries.length) { msgList.appendChild(div({ class: 'empty-state' }, 'No messages yet from this member.')); return; }
        entries.forEach(([key, msg]) => msgList.appendChild(renderInboxMsg(m.id, key, msg)));
        msgList.scrollTop = msgList.scrollHeight;
      } catch (e) {
        clear(msgList); msgList.appendChild(div({ class: 'empty-state' }, 'Could not load messages: ' + e.message));
      }
    }
    load();
    poll = setInterval(load, 2500);
  }

  return card;
}

function renderInboxMsg(memberId, key, msg) {
  const isAdminMsg = !!msg.isAdmin;
  const row = div({ class: 'msg-row' + (isAdminMsg ? ' is-own' : '') });
  const body = div({ class: 'msg-body' });
  const bubble = div({ class: 'msg-bubble ' + (isAdminMsg ? 'is-me' : 'is-them') });
  if (msg.deleted) {
    bubble.appendChild(div({ style: { color: 'var(--red)', fontStyle: 'italic' } }, '[DELETED] ' + msg.text));
    body.appendChild(bubble);
    body.appendChild(div({ class: 'msg-time' }, `${msg.date || ''} ${msg.time || ''} — ${msg.senderName || 'Member'} [visible to admin only]`));
    body.appendChild(span({ class: 'u-small u-muted' }, 'Deleted'));
  } else {
    bubble.appendChild(div({}, msg.text));
    body.appendChild(bubble);
    body.appendChild(div({ class: 'msg-time' }, `${msg.date || ''} ${msg.time || ''}`));
    const delLink = span({ style: { color: 'var(--red)', cursor: 'pointer', textDecoration: 'underline', fontSize: 11 } }, 'Delete');
    delLink.addEventListener('click', async () => {
      await db.ref('rna_my_channel/' + memberId + '/' + key).update({ deleted: true, deletedAt: dateStr(), deletedBy: 'admin' });
    });
    body.appendChild(delLink);
  }
  row.appendChild(body);
  return row;
}
