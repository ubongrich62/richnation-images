// Admin → Rooms tab: broadcast a message to any room, and control General Discussion.
function renderRoomsTab(el) {
  let selectedRoom = ROOMS.find(r => !r.adminOnly).id;
  let msgText = '';
  const sendCard = div({ class: 'card', style: { marginBottom: 14 } });
  sendCard.appendChild(div({ class: 'card-title' }, 'Send Message to Room'));
  sendCard.appendChild(field('Select Room', fieldSelect(selectedRoom, ROOMS.filter(r => !r.adminOnly).map(r => [r.id, r.label]), v => selectedRoom = v)));
  const msgTA = fieldTextarea(msgText, v => msgText = v, 'Message to broadcast...', 3);
  sendCard.appendChild(field('Message', msgTA));
  sendCard.appendChild(button('Send to Room', 'primary', async () => {
    const text = msgText.trim();
    if (!text) return;
    await db.ref('rna_rooms/' + selectedRoom).push({
      id: uid(), text, senderId: 'admin', senderName: 'General Manager', senderPlan: 'admin',
      isAdmin: true, time: timeStr(), date: dateStr(), ts: Date.now()
    });
    msgText = ''; msgTA.value = '';
    toast('Message sent to ' + ROOMS.find(r => r.id === selectedRoom).label + '.');
  }, 'btn-full'));
  el.appendChild(sendCard);

  const genCard = div({ class: 'card' });
  const statusLine = div({ class: 'u-small u-muted', style: { marginBottom: 12 } });
  genCard.appendChild(div({ class: 'card-title' }, 'General Discussion Control'));
  genCard.appendChild(statusLine);
  const actionsRow = div({ class: 'u-flex u-gap-sm' });
  genCard.appendChild(actionsRow);
  el.appendChild(genCard);

  async function refresh() {
    const snap = await db.ref('rna_room_settings/general/open').once();
    const isOpen = snap.val() !== false;
    statusLine.textContent = isOpen ? 'Status: General Discussion is currently OPEN — members can post' : 'Status: General Discussion is currently CLOSED — members can only read';
    clear(actionsRow);
    actionsRow.appendChild(button('Open Discussion', 'primary', async () => { await db.ref('rna_room_settings/general').update({ open: true }); toast('General Discussion opened.'); refresh(); }));
    actionsRow.appendChild(button('Close Discussion', 'danger', async () => { await db.ref('rna_room_settings/general').update({ open: false }); toast('General Discussion closed.'); refresh(); }));
  }
  refresh();
}
