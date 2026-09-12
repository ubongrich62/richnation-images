// Admin → Updates tab: post a channel-progress update to the member feed.
function renderUpdatesTab(el) {
  const state = { title: '', body: '', progress: '', progressLabel: '' };
  const card = div({ class: 'card' });
  el.appendChild(card);
  card.appendChild(div({ class: 'card-title' }, 'Post Channel Update'));
  card.appendChild(field('Update Title', fieldInput(state.title, v => state.title = v, 'e.g. Week 3 Progress')));
  card.appendChild(field('Update Body', fieldTextarea(state.body, v => state.body = v, 'Describe the progress or milestone...', 5)));
  card.appendChild(div({ class: 'grid-2' },
    field('Progress % (optional)', fieldInput(state.progress, v => state.progress = v, '', 'number')),
    field('Progress Label (optional)', fieldInput(state.progressLabel, v => state.progressLabel = v, 'e.g. Watch Time Progress'))));
  const errBox = div({ class: 'info-box info-box-red', style: { display: 'none' } });
  card.appendChild(errBox);
  card.appendChild(button('Post Update', 'primary', async () => {
    if (!state.title.trim() || !state.body.trim()) { errBox.textContent = 'Title and body are required.'; errBox.style.display = 'block'; return; }
    errBox.style.display = 'none';
    await db.ref('rna_updates').push({
      title: state.title, body: state.body, progress: state.progress ? Number(state.progress) : null,
      progressLabel: state.progressLabel, author: 'General Manager', date: dateStr(), ts: Date.now()
    });
    toast('Update posted.');
    state.title = ''; state.body = ''; state.progress = ''; state.progressLabel = '';
    clear(el); renderUpdatesTab(el);
  }, 'btn-full btn-lg'));
}
