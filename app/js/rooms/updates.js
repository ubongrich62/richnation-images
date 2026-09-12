// Read-only channel-progress feed. Returns a cleanup function so the caller
// (switchRoom) can clear the poll interval — the original never did this.
function buildUpdates(main) {
  main.appendChild(div({ class: 'section-head' },
    div({ class: 'section-title' }, 'Channel Updates'),
    div({ class: 'section-sub' }, 'Progress reports and milestone updates from management.')));
  const list = div({ class: 'content-pad' });
  main.appendChild(list);

  async function load() {
    try {
      const snap = await db.ref('rna_updates').once();
      const val = snap.val() || {};
      const items = Object.values(val).sort((a, b) => (b.ts || 0) - (a.ts || 0));
      clear(list);
      if (!items.length) {
        list.appendChild(div({ class: 'empty-state' },
          div({ class: 'empty-state-icon' }, '📈'),
          div({}, 'No updates yet. Management will post channel progress here.')));
        return;
      }
      items.forEach(u => {
        const card = div({ class: 'announcement' });
        const head = div({ class: 'announcement-head' });
        head.appendChild(span({ class: 'announcement-icon' }, '📣'));
        head.appendChild(span({ class: 'announcement-title' }, u.title || 'Channel Update'));
        card.appendChild(head);
        card.appendChild(div({ class: 'announcement-meta' }, `${u.date || ''} by ${u.author || 'Management'}`));
        card.appendChild(pEl({ class: 'announcement-body' }, u.body || ''));
        if (u.progress != null && u.progress !== '') {
          const pw = div({ class: 'u-flex u-between u-small u-muted', style: { marginTop: 10 } },
            span({}, u.progressLabel || 'Progress'), span({}, u.progress + '%'));
          const track = div({ class: 'progress-track' }, div({ class: 'progress-fill', style: { width: u.progress + '%' } }));
          card.appendChild(pw); card.appendChild(track);
        }
        list.appendChild(card);
      });
    } catch (e) {
      clear(list);
      list.appendChild(div({ class: 'empty-state' }, 'Could not load updates: ' + e.message));
    }
  }

  load();
  const interval = setInterval(load, 3000);
  return () => clearInterval(interval);
}
