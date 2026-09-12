// Shared chat engine for every message-based room: the six package/general/qa
// rooms (rna_rooms/<roomId>) and the private My Channel thread
// (rna_my_channel/<memberId>) both use this. The original left My Channel's
// member-facing view unimplemented (buildMyChannel was called but never
// defined) — this file provides it for real, on the same message model.

function avatarTint(plan, isAdminMsg) {
  if (isAdminMsg || plan === 'admin' || plan === 'premium') return { background: 'var(--brand-dim)', color: 'var(--brand)' };
  if (plan === 'special') return { background: 'var(--purple-dim)', color: 'var(--purple)' };
  if (plan === 'training') return { background: 'var(--green-dim)', color: 'var(--green)' };
  return { background: 'var(--blue-dim)', color: 'var(--blue)' };
}

function buildChatCore(main, opts) {
  const { session, path, title, subtitle, placeholder, generalToggle } = opts;
  const isAdmin = !!session.isAdmin;

  main.appendChild(div({ class: 'section-head' }, div({ class: 'section-title' }, title), div({ class: 'section-sub' }, subtitle)));

  const closedBanner = div({ class: 'content-pad', style: { paddingBottom: 0, display: 'none' } },
    div({ class: 'info-box info-box-red' }, 'General Discussion is currently closed by management.'));
  main.appendChild(closedBanner);

  let toggleBtn = null;
  if (generalToggle && isAdmin) {
    toggleBtn = button('', 'danger', onToggleGeneral, 'btn-sm');
    main.querySelector('.section-head').appendChild(toggleBtn);
    main.querySelector('.section-head').style.display = 'flex';
    main.querySelector('.section-head').style.justifyContent = 'space-between';
    main.querySelector('.section-head').style.alignItems = 'center';
  }

  const chatArea = div({ class: 'chat-area' });
  main.appendChild(chatArea);
  const composeBar = div({ class: 'compose-bar' });
  const textarea = h('textarea', { class: 'compose-input', placeholder: placeholder || 'Type a message...', rows: 1 });
  textarea.addEventListener('input', () => { textarea.style.height = 'auto'; textarea.style.height = Math.min(120, textarea.scrollHeight) + 'px'; });
  const sendBtn = button('Send', 'primary', sendMsg);
  composeBar.appendChild(textarea);
  composeBar.appendChild(sendBtn);
  main.appendChild(composeBar);

  textarea.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); }
  });

  async function onToggleGeneral() {
    const snap = await db.ref('rna_room_settings/general/open').once();
    const isOpen = snap.val() !== false;
    await db.ref('rna_room_settings/general').update({ open: !isOpen });
    toast(isOpen ? 'General Discussion closed.' : 'General Discussion opened.');
    refreshGeneralState();
  }
  async function refreshGeneralState() {
    if (!generalToggle) return;
    const snap = await db.ref('rna_room_settings/general/open').once();
    const isOpen = snap.val() !== false;
    if (toggleBtn) {
      toggleBtn.textContent = isOpen ? 'Close Discussion' : 'Open Discussion';
      toggleBtn.className = 'btn btn-sm ' + (isOpen ? 'btn-danger' : 'btn-primary');
    }
    if (!isAdmin) {
      closedBanner.style.display = isOpen ? 'none' : 'block';
      composeBar.style.display = isOpen ? 'flex' : 'none';
    }
  }

  function sendMsg() {
    const text = textarea.value.trim();
    if (!text) return;
    textarea.value = ''; textarea.style.height = 'auto';
    const msg = {
      id: uid(), text,
      senderId: session.id, senderName: session.name, senderPlan: session.plan,
      isAdmin, time: timeStr(), date: dateStr(), ts: Date.now()
    };
    db.ref(path).push(msg);
  }

  function renderMessage(key, msg) {
    const isOwn = msg.senderId === session.id;
    const row = div({ class: 'msg-row' + (isOwn ? ' is-own' : '') });
    const tint = avatarTint(msg.senderPlan, msg.isAdmin);
    row.appendChild(div({ class: 'avatar avatar-sm', style: tint }, initials(msg.senderName)));

    const body = div({ class: 'msg-body' });
    if (!isOwn) {
      const nameRow = div({ class: 'msg-sender', style: { color: tint.color } },
        msg.senderName + (msg.isAdmin ? ' (Management)' : ''));
      body.appendChild(nameRow);
      if (!msg.isAdmin && msg.senderPlan && PACKAGES[msg.senderPlan]) {
        body.appendChild(badge(PACKAGES[msg.senderPlan].label, PACKAGES[msg.senderPlan].badge));
      }
    }

    const bubbleClass = 'msg-bubble ' + (isOwn ? 'is-me' : msg.isAdmin ? 'is-admin' : 'is-them');
    const bubble = div({ class: bubbleClass });

    if (msg.deleted) {
      if (isAdmin) {
        bubble.appendChild(div({ style: { color: 'var(--red)', fontStyle: 'italic' } }, '[DELETED] ' + msg.text));
        body.appendChild(bubble);
        body.appendChild(div({ class: 'msg-time' }, `Deleted · ${msg.deletedAt || ''} · only you can see this`));
        const removeBtn = button('Remove Permanently', 'danger', () => {
          if (!confirm('Permanently remove this message? This cannot be undone.')) return;
          db.ref(path + '/' + key).remove();
          row.remove();
        }, 'btn-sm');
        removeBtn.style.marginTop = '4px';
        body.appendChild(removeBtn);
      } else {
        bubble.appendChild(div({ style: { fontStyle: 'italic', opacity: 0.7 } }, 'This message was deleted.'));
        body.appendChild(bubble);
      }
      row.appendChild(body);
      return row;
    }

    const textEl = div({}, msg.text);
    bubble.appendChild(textEl);
    body.appendChild(bubble);
    body.appendChild(div({ class: 'msg-time' }, `${msg.date} ${msg.time}${msg.edited ? ' · edited' : ''}`));

    const canEdit = isOwn;
    const canDelete = isOwn || isAdmin;
    if (canEdit || canDelete) {
      const actions = div({ class: 'u-flex u-gap-sm u-small', style: { marginTop: 3 } });
      if (canEdit) {
        const editLink = span({ style: { color: 'var(--text-3)', cursor: 'pointer', textDecoration: 'underline' } }, 'Edit');
        editLink.addEventListener('click', () => startEdit());
        actions.appendChild(editLink);
      }
      if (canDelete) {
        const delLink = span({ style: { color: 'var(--red)', cursor: 'pointer', textDecoration: 'underline' } },
          isAdmin && !isOwn ? 'Delete (Admin)' : 'Delete');
        delLink.addEventListener('click', () => {
          if (!confirm('Delete this message?')) return;
          db.ref(path + '/' + key).update({ deleted: true, deletedAt: dateStr(), deletedBy: isAdmin ? 'admin' : session.id, text: msg.text });
        });
        actions.appendChild(delLink);
      }
      body.appendChild(actions);
    }

    function startEdit() {
      clear(bubble);
      const ta = h('textarea', { class: 'textarea', style: { minHeight: '60px' } }, msg.text);
      bubble.appendChild(ta);
      const editActions = div({ class: 'u-flex u-gap-sm', style: { marginTop: 6 } });
      editActions.appendChild(button('Save', 'primary', async () => {
        const newText = ta.value.trim();
        if (!newText) return;
        await db.ref(path + '/' + key).update({ text: newText, edited: true, editedAt: dateStr() });
        clear(bubble); bubble.appendChild(div({}, newText));
      }, 'btn-sm'));
      editActions.appendChild(button('Cancel', 'ghost', () => { clear(bubble); bubble.appendChild(textEl); }, 'btn-sm'));
      bubble.appendChild(editActions);
    }

    row.appendChild(body);
    return row;
  }

  let lastScrollWasBottom = true;
  async function load() {
    try {
      const snap = await db.ref(path).limitToLast(60).once();
      const val = snap.val() || {};
      const entries = Object.entries(val).sort((a, b) => (a[1].ts || 0) - (b[1].ts || 0));
      const nearBottom = chatArea.scrollHeight - chatArea.scrollTop - chatArea.clientHeight < 80;
      clear(chatArea);
      if (!entries.length) {
        chatArea.appendChild(div({ class: 'empty-state' }, div({ class: 'empty-state-icon' }, '💬'), div({}, 'No messages yet. Say hello!')));
      } else {
        entries.forEach(([key, msg]) => chatArea.appendChild(renderMessage(key, msg)));
      }
      if (nearBottom || lastScrollWasBottom) chatArea.scrollTop = chatArea.scrollHeight;
    } catch (e) {
      clear(chatArea);
      chatArea.appendChild(div({ class: 'empty-state' }, 'Could not load messages: ' + e.message));
    }
  }

  load();
  if (generalToggle) refreshGeneralState();
  const interval = setInterval(load, 2500);
  return () => clearInterval(interval);
}

function buildChatRoom(main, session, roomId) {
  const room = ROOMS.find(r => r.id === roomId);
  return buildChatCore(main, {
    session, path: 'rna_rooms/' + roomId,
    title: room.label, subtitle: room.desc,
    placeholder: roomId === 'qa' ? 'Ask your question...' : 'Type a message...',
    generalToggle: roomId === 'general'
  });
}

function buildMyChannel(main, session) {
  return buildChatCore(main, {
    session, path: 'rna_my_channel/' + session.id,
    title: 'My Channel', subtitle: 'Talk to management privately',
    placeholder: 'Message management privately...',
    generalToggle: false
  });
}
