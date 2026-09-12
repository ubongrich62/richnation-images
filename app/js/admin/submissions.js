// Admin → Submissions tab: website onboarding submissions (investors/students).
async function renderSubmissionsTab(el) {
  let sub = 'investors';
  const bar = div({ class: 'subtab-bar' });
  const list = div({});
  el.appendChild(bar); el.appendChild(list);

  function renderBar() {
    clear(bar);
    [['investors', 'Investors'], ['students', 'Students']].forEach(([id, label]) => {
      const b = button(label, null, () => { sub = id; renderBar(); loadList(); });
      b.className = 'subtab-btn' + (id === sub ? ' is-active' : '');
      bar.appendChild(b);
    });
  }

  async function loadList() {
    clear(list);
    list.appendChild(div({ class: 'empty-state' }, 'Loading...'));
    try {
      const snap = await db.ref('rna_form_submissions').once();
      const all = Object.values(snap.val() || {});
      const filtered = all.filter(s => (sub === 'students') === (s.type === 'student'));
      clear(list);
      if (!filtered.length) { list.appendChild(div({ class: 'empty-state' }, `No ${sub} submissions yet.`)); return; }
      filtered.sort((a, b) => String(b.submittedAt || '').localeCompare(String(a.submittedAt || ''))).forEach(s => list.appendChild(renderSubmissionCard(s)));
    } catch (e) {
      clear(list); list.appendChild(div({ class: 'empty-state' }, 'Could not load submissions: ' + e.message));
    }
  }

  renderBar(); loadList();
}

const PLAN_LABELS = { premium: 'Premium — ₦3,000,000', standard: 'Standard — ₦1,500,000', special: 'Special — ₦1,000,000', training: 'Training — ₦100,000' };

function renderSubmissionCard(sub) {
  const name = sub.fullName || sub.name || 'Unknown';
  const balance = Number(sub.balance || sub.outstandingBalance || 0);
  const hasBalance = balance > 0;
  const card = div({ class: 'collapse-card' + (hasBalance ? ' is-flagged' : '') });
  const head = div({ class: 'collapse-head' });
  head.appendChild(div({ class: 'avatar avatar-md' }, initials(name)));
  const info = div({ style: { flex: 1, minWidth: 160 } });
  info.appendChild(div({ style: { fontWeight: 700, fontSize: 13.5 } }, name));
  info.appendChild(div({ class: 'u-small u-muted' }, `${sub.email || ''} · ${sub.phone || ''}`));
  info.appendChild(div({ class: 'u-small u-muted' }, `${sub.country || ''}${sub.stateCity ? ', ' + sub.stateCity : ''} · ${sub.submittedAt || ''}`));
  head.appendChild(info);
  if (sub.plan && PLAN_LABELS[sub.plan]) head.appendChild(badge(PLAN_LABELS[sub.plan].split(' — ')[0], (PACKAGES[sub.plan] || {}).badge || 'muted'));
  if (hasBalance) head.appendChild(badge('Balance: ₦' + balance.toLocaleString(), 'red'));

  const statusSel = fieldSelect(sub.status || 'Pending', ['Pending', 'Code Sent', 'Active', 'Follow Up Needed', 'Balance Overdue', 'Declined'].map(s => [s, s]), async v => {
    await db.ref('rna_form_submissions/' + sub.id).update({ status: v });
    toast('Status updated to: ' + v);
  });
  statusSel.style.width = '160px';
  statusSel.addEventListener('click', e => e.stopPropagation());
  head.appendChild(statusSel);
  card.appendChild(head);

  const bodyEl = div({ class: 'collapse-body', style: { display: 'none' } });
  let open = false;
  head.addEventListener('click', e => { if (e.target === statusSel) return; open = !open; bodyEl.style.display = open ? 'block' : 'none'; });

  const personal = [
    detailRow('Full Name', name), detailRow('Gender', sub.gender), detailRow('Email', sub.email),
    detailRow('WhatsApp', sub.phone), detailRow('Country', sub.country), detailRow('State/City', sub.stateCity),
    detailRow('Age Range', sub.ageRange)
  ].filter(Boolean);
  if (personal.length) bodyEl.appendChild(section('Personal Details', personal));

  const payment = [
    detailRow('Payment Ref', sub.payRef), detailRow('Total Paid', sub.totalPaid && '₦' + Number(sub.totalPaid).toLocaleString()),
    detailRow('Outstanding Balance', hasBalance && '₦' + balance.toLocaleString()), detailRow('Balance Due Date', sub.balanceDate),
    detailRow('Payment Structure', sub.paymentStructure), detailRow('1st Payment', sub.firstPayAmt && `₦${sub.firstPayAmt} on ${sub.firstPayDate || '—'}`),
    detailRow('2nd Payment', sub.secondPayAmt && `₦${sub.secondPayAmt} on ${sub.secondPayDate || '—'}`),
    detailRow('3rd Payment', sub.thirdPayAmt && `₦${sub.thirdPayAmt} on ${sub.thirdPayDate || '—'}`)
  ].filter(Boolean);
  if (payment.length) bodyEl.appendChild(section('Payment Records', payment));

  if (sub.type !== 'student') {
    const channel = [
      detailRow('Package', sub.plan && PLAN_LABELS[sub.plan]), detailRow('Agreed %', sub.agreedPct && sub.agreedPct + '%'),
      detailRow('Channel Name', sub.channelName), detailRow('Channel Niche', sub.niche),
      detailRow('Channel Status', sub.channelStatus), detailRow('Handles Received', sub.receivedHandles || sub.handles),
      detailRow('Has Channel', sub.hasChannel)
    ].filter(Boolean);
    if (channel.length) bodyEl.appendChild(section('Channel Details', channel));
  } else {
    const student = [
      detailRow('How Heard', sub.howHeard), detailRow('Skill Level', sub.skillLevel), detailRow('Has Channel', sub.hasChannel),
      detailRow('Main Goal', sub.goal), detailRow('Expectation', sub.expectation), detailRow('Challenge', sub.challenge)
    ].filter(Boolean);
    if (student.length) bodyEl.appendChild(section('Student Background', student));
  }

  const comm = [detailRow('Preferred Channel', sub.commPref), detailRow('Had Delays', sub.commDelay), detailRow('Satisfaction', sub.satisfaction)].filter(Boolean);
  if (comm.length) bodyEl.appendChild(section('Communication', comm));

  const msg = sub.message || sub.personalMsg;
  if (msg) bodyEl.appendChild(section('Message to Management', [div({ class: 'u-small', style: { color: 'var(--text-2)', lineHeight: 1.6 } }, msg)]));

  bodyEl.appendChild(section('Submission Info', [
    detailRow('Submitted', sub.submittedAt), detailRow('Source', sub.source || 'Website'), detailRow('Submission ID', sub.id)
  ].filter(Boolean)));

  if (hasBalance) bodyEl.appendChild(div({ class: 'info-box info-box-red' }, `Outstanding: ₦${balance.toLocaleString()} — Due: ${sub.balanceDate || 'not set'}`));

  const actions = div({ class: 'u-flex u-gap-sm u-wrap', style: { marginTop: 12 } });
  actions.appendChild(button('Copy WhatsApp', 'ghost', () => copyToClipboard(sub.phone || ''), 'btn-sm'));
  actions.appendChild(button('Copy Email', 'ghost', () => copyToClipboard(sub.email || ''), 'btn-sm'));
  const followMsg = hasBalance
    ? `Hi ${name}, this is RichNation Academy management. This is a friendly reminder about your outstanding balance of ₦${balance.toLocaleString()}${sub.balanceDate ? ' due ' + sub.balanceDate : ''}. Please reach out if you have any questions.`
    : `Hi ${name}, this is RichNation Academy management checking in on you. How have things been going with your channel/investment? Let us know if you need anything.`;
  actions.appendChild(h('a', { class: 'btn btn-dark btn-sm', href: waLink(sub.phone, followMsg), target: '_blank' }, hasBalance ? 'Follow Up (Balance)' : 'Follow Up'));
  actions.appendChild(button('Delete', 'danger', async () => {
    if (!confirm(`Delete ${name}'s submission?`)) return;
    await db.ref('rna_form_submissions/' + sub.id).remove();
    card.remove();
  }, 'btn-sm'));
  bodyEl.appendChild(actions);

  card.appendChild(bodyEl);
  return card;
}

function section(label, rows) {
  return div({ class: 'collapse-section' }, div({ class: 'collapse-section-label' }, label), ...rows);
}
