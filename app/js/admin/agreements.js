// Admin → Agreements tab: post-monetization management agreements submitted
// by members, plus the member-facing wizard that creates them.
async function renderAgreementsTab(el) {
  el.appendChild(div({ class: 'empty-state' }, 'Loading agreements...'));
  let agreements;
  try {
    const snap = await db.ref('rna_monetization_agreements').once();
    agreements = Object.values(snap.val() || {}).sort((a, b) => String(b.submittedAt || '').localeCompare(String(a.submittedAt || '')));
  } catch (e) {
    clear(el); el.appendChild(div({ class: 'empty-state' }, 'Could not load agreements: ' + e.message)); return;
  }
  clear(el);
  if (!agreements.length) { el.appendChild(div({ class: 'empty-state' }, 'No agreements submitted yet. Agreements appear here after monetized members submit their choice.')); return; }
  agreements.forEach(a => el.appendChild(renderAgreementCard(a)));
}

function renderAgreementCard(a) {
  const continued = a.choice === 'continued';
  const card = div({ class: 'collapse-card', style: { borderColor: continued ? 'var(--brand-line)' : 'var(--green-line)' } });
  const head = div({ class: 'collapse-head' });
  head.appendChild(div({ class: 'avatar avatar-md' }, initials(a.fullName)));
  const info = div({ style: { flex: 1, minWidth: 160 } });
  info.appendChild(div({ style: { fontWeight: 700, fontSize: 13.5 } }, a.fullName));
  info.appendChild(div({ class: 'u-small u-muted' }, `${a.email || ''} · ${a.phone || ''} · ${a.submittedAt || ''}`));
  head.appendChild(info);
  head.appendChild(badge(continued ? 'Continued Management' : 'Self-Management Handover', continued ? 'brand' : 'green'));
  const statusSel = fieldSelect(a.adminStatus || 'Pending Review', ['Pending Review', 'Reviewed', 'Agreement Active', 'Handover Completed', 'Terminated'].map(s => [s, s]), async v => {
    await db.ref('rna_monetization_agreements/' + a.id).update({ adminStatus: v });
    toast('Status updated to: ' + v);
  });
  statusSel.style.width = '170px';
  statusSel.addEventListener('click', e => e.stopPropagation());
  head.appendChild(statusSel);
  card.appendChild(head);

  const bodyEl = div({ class: 'collapse-body', style: { display: 'none' } });
  let open = false;
  head.addEventListener('click', e => { if (e.target === statusSel) return; open = !open; bodyEl.style.display = open ? 'block' : 'none'; });

  bodyEl.appendChild(section('Channel Details', [
    detailRow('Channel Name', a.channelName), detailRow('Monthly Earnings Est.', a.monthlyEarnings),
    detailRow('Choice', continued ? 'Continued Management' : 'Self-Management Handover')
  ].filter(Boolean)));

  if (continued) {
    bodyEl.appendChild(section('Payment Transfer Details', [
      detailRow('Transfer Method', a.transferMethod), detailRow('YouTube Payout Day', a.payoutDay),
      detailRow('Bank Name', a.bankName), detailRow('Account Number', a.accountNumber)
    ].filter(Boolean)));
    const acks = [['Covers own content expenses', a.ackExpenses], ['Agrees to 30% RichNation share', a.ack30pct], ['Understands pause conditions', a.ackPause], ['Acknowledges policy terms', a.ackPolicy]];
    bodyEl.appendChild(section('Acknowledgments', acks.map(([label, val]) =>
      div({ class: 'detail-row' }, span({ class: 'detail-row-label' }, label), badge(val ? 'YES' : 'NO', val ? 'green' : 'red')))));
  } else {
    bodyEl.appendChild(section('Handover Details', [
      detailRow('Preferred Handover Date', a.handoverDate),
      div({ class: 'detail-row' }, span({ class: 'detail-row-label' }, 'Balances Settled'), badge(a.ackSettled ? 'YES' : 'PENDING', a.ackSettled ? 'green' : 'yellow'))
    ].filter(Boolean)));
  }

  const actions = div({ class: 'u-flex u-gap-sm u-wrap', style: { marginTop: 12 } });
  actions.appendChild(button('Copy WhatsApp', 'ghost', () => copyToClipboard(a.phone || ''), 'btn-sm'));
  const waMsg = continued
    ? `Hi ${a.fullName}, thank you for confirming Continued Management for ${a.channelName || 'your channel'}. RichNation Academy will keep managing your channel under the agreed 70/30 revenue split. We'll be in touch about your next payout.`
    : `Hi ${a.fullName}, we've received your handover request for ${a.channelName || 'your channel'}. RichNation Academy will confirm your outstanding balances and complete the handover by your requested date.`;
  actions.appendChild(h('a', { class: 'btn btn-dark btn-sm', href: waLink(a.phone, waMsg), target: '_blank' }, 'Send WhatsApp Response'));
  actions.appendChild(button('Delete', 'danger', async () => {
    if (!confirm('Delete this agreement?')) return;
    await db.ref('rna_monetization_agreements/' + a.id).remove();
    card.remove();
  }, 'btn-sm'));
  bodyEl.appendChild(actions);

  card.appendChild(bodyEl);
  return card;
}

// ── Member-facing Post-Monetization Agreement wizard ──
// Original file defines this but the only place that would open it
// (the member's own My Channel room) was itself never implemented there —
// we surface it as a banner action in Welcome once channelStatus reads
// "Monetized -- Earning", which is the closest faithful integration point.
function showMonoAgreementForm(session) {
  let step = 0;
  const fd = {
    fullName: session.name || '', email: session.email || '', phone: session.phone || '',
    channelName: session.channelName || '', monthlyEarnings: '',
    choice: '', ackExpenses: false, ack30pct: false, ackPause: false, ackPolicy: false,
    transferMethod: '', payoutDay: '', bankName: '', accountNumber: '',
    handoverDate: '', ackSettled: false,
    ackVoluntary: false, ackBinding: false, ackRC: false
  };

  const overlay = div({ class: 'modal-backdrop', style: { zIndex: 99999, alignItems: 'flex-start', paddingTop: '4vh' } });
  const shell = div({ class: 'modal', style: { maxWidth: 560 } });
  shell.appendChild(div({ class: 'modal-title' }, 'Post-Monetization Agreement'));
  shell.appendChild(div({ class: 'u-small u-muted', style: { marginBottom: 14 } }, 'RichNation Academy'));
  const track = div({ class: 'progress-track', style: { marginBottom: 18 } });
  const fill = div({ class: 'progress-fill' });
  track.appendChild(fill);
  shell.appendChild(track);
  const body = div({});
  shell.appendChild(body);
  overlay.appendChild(shell);
  document.body.appendChild(overlay);

  function setStep(n) { step = n; fill.style.width = ((n + 1) / 6 * 100) + '%'; draw(); }
  function close() { overlay.remove(); }

  function draw() {
    clear(body);
    if (step === 0) return s0();
    if (step === 1) return s1();
    if (step === 2) return s2();
    if (step === 3) return fd.choice === 'continued' ? s3() : s4();
    if (step === 4) return s5();
  }

  function s0() {
    body.appendChild(div({ class: 'auth-eyebrow' }, 'Congratulations! 🎉'));
    body.appendChild(div({ class: 'auth-caption' }, 'Your channel is now monetized. Choose how you would like to move forward.'));
    const opt1 = div({ class: 'choice-item', style: { flexDirection: 'column', alignItems: 'flex-start', gap: 6, padding: 16 } });
    opt1.appendChild(div({ style: { fontWeight: 700 } }, 'Option 1 — Continued Management'));
    opt1.appendChild(div({ class: 'u-small u-muted' }, 'RichNation Academy keeps managing your channel. You cover ongoing content expenses; RichNation takes a 30% share of earnings and you keep 70%.'));
    opt1.addEventListener('click', () => { fd.choice = 'continued'; setStep(1); });
    const opt2 = div({ class: 'choice-item', style: { flexDirection: 'column', alignItems: 'flex-start', gap: 6, padding: 16, marginTop: 10 } });
    opt2.appendChild(div({ style: { fontWeight: 700 } }, 'Option 2 — Self-Management Handover'));
    opt2.appendChild(div({ class: 'u-small u-muted' }, 'Full handover of the channel to you. You take over management entirely and keep 100% of earnings.'));
    opt2.addEventListener('click', () => { fd.choice = 'handover'; setStep(1); });
    body.appendChild(opt1); body.appendChild(opt2);
  }

  function policySection(title, items) {
    const s = div({ style: { marginBottom: 14 } });
    s.appendChild(div({ style: { fontWeight: 700, fontSize: 12.5, marginBottom: 6 } }, title));
    items.forEach(it => s.appendChild(div({ class: 'u-small u-muted', style: { marginBottom: 4, lineHeight: 1.6 } }, '• ' + it)));
    return s;
  }
  function s1() {
    body.appendChild(div({ class: 'auth-eyebrow' }, 'Post-Monetization Policy'));
    body.appendChild(policySection('What RichNation Academy Covers', ['Ongoing channel strategy, upload scheduling, and optimization guidance', 'Monitoring performance and advising on content decisions']));
    body.appendChild(policySection('What You Cover', ['Any tools, editors, or content production costs going forward', 'Your own tax and payout-account obligations']));
    body.appendChild(policySection('Revenue Arrangement', ['RichNation Academy receives 30% of monetized earnings; you receive 70%', 'Your 30% share is transferred within 3 business days of each YouTube payout']));
    body.appendChild(policySection('Important Warning', ['Missed or late expense coverage may result in your channel being paused until resolved']));
    body.appendChild(policySection('Termination', ['Either party may end this arrangement with 30 days\' written notice']));
    const nav = div({ class: 'step-nav' });
    nav.appendChild(button('← Back', 'ghost', () => setStep(0)));
    nav.appendChild(div({ class: 'u-flex-1' }));
    nav.appendChild(button('I Understand — Continue →', 'primary', () => setStep(2)));
    body.appendChild(nav);
  }

  function s2() {
    body.appendChild(div({ class: 'auth-eyebrow' }, 'Confirm Your Channel'));
    body.appendChild(field('Full Name *', fieldInput(fd.fullName, v => fd.fullName = v)));
    body.appendChild(field('Email *', fieldInput(fd.email, v => fd.email = v, '', 'email')));
    body.appendChild(field('WhatsApp *', fieldInput(fd.phone, v => fd.phone = v)));
    body.appendChild(field('Channel Name *', fieldInput(fd.channelName, v => fd.channelName = v)));
    body.appendChild(field('Monthly Earnings Estimate (optional)', fieldInput(fd.monthlyEarnings, v => fd.monthlyEarnings = v)));
    const nav = div({ class: 'step-nav' });
    nav.appendChild(button('← Back', 'ghost', () => setStep(1)));
    nav.appendChild(div({ class: 'u-flex-1' }));
    nav.appendChild(button('Continue →', 'primary', () => {
      if (!fd.fullName.trim() || !fd.email.trim() || !fd.phone.trim() || !fd.channelName.trim()) { toast('Please fill all required fields.', true); return; }
      setStep(3);
    }));
    body.appendChild(nav);
  }

  function ackItem(label, get, set) {
    const item = div({ class: 'choice-item' });
    const inp = inputEl({ type: 'checkbox', checked: get() });
    inp.addEventListener('change', () => set(inp.checked));
    item.appendChild(inp); item.appendChild(labelEl({ class: 'choice-label' }, label));
    return item;
  }

  function s3() {
    body.appendChild(div({ class: 'auth-eyebrow' }, 'Continued Management — Acknowledgments'));
    const grp = div({ class: 'choice-group', style: { marginBottom: 14 } });
    grp.appendChild(ackItem('I will cover my own content production expenses going forward', () => fd.ackExpenses, v => fd.ackExpenses = v));
    grp.appendChild(ackItem('I agree RichNation Academy receives 30% of my channel earnings', () => fd.ack30pct, v => fd.ack30pct = v));
    grp.appendChild(ackItem('I understand my channel may be paused if expenses are not covered', () => fd.ackPause, v => fd.ackPause = v));
    grp.appendChild(ackItem('I acknowledge the Post-Monetization Policy explained above', () => fd.ackPolicy, v => fd.ackPolicy = v));
    body.appendChild(grp);
    body.appendChild(div({ class: 'card-title', style: { fontSize: 13 } }, 'Payment Transfer Details'));
    body.appendChild(field('Transfer Method', fieldSelect(fd.transferMethod, [['', 'Select...'], ['Bank Transfer', 'Bank Transfer'], ['WhatsApp Payment', 'WhatsApp Payment'], ['Other', 'Other']], v => fd.transferMethod = v)));
    body.appendChild(field('YouTube Payout Day', fieldInput(fd.payoutDay, v => fd.payoutDay = v, 'e.g. 21st of each month')));
    body.appendChild(field('Bank Name', fieldInput(fd.bankName, v => fd.bankName = v)));
    body.appendChild(field('Account Number (optional)', fieldInput(fd.accountNumber, v => fd.accountNumber = v)));
    const nav = div({ class: 'step-nav' });
    nav.appendChild(button('← Back', 'ghost', () => setStep(2)));
    nav.appendChild(div({ class: 'u-flex-1' }));
    nav.appendChild(button('Continue →', 'primary', () => {
      if (!fd.ackExpenses || !fd.ack30pct || !fd.ackPause || !fd.ackPolicy) { toast('Please check all acknowledgments.', true); return; }
      setStep(4);
    }));
    body.appendChild(nav);
  }

  function s4() {
    body.appendChild(div({ class: 'auth-eyebrow' }, 'Self-Management Handover'));
    body.appendChild(field('Preferred Handover Date *', fieldInput(fd.handoverDate, v => fd.handoverDate = v, '', 'date')));
    const grp = div({ class: 'choice-group' });
    grp.appendChild(ackItem('I confirm all balances with RichNation Academy are settled', () => fd.ackSettled, v => fd.ackSettled = v));
    let ackHandover = false;
    grp.appendChild(ackItem('I understand RichNation Academy is no longer responsible for this channel after handover', () => ackHandover, v => ackHandover = v));
    body.appendChild(grp);
    const nav = div({ class: 'step-nav' });
    nav.appendChild(button('← Back', 'ghost', () => setStep(2)));
    nav.appendChild(div({ class: 'u-flex-1' }));
    nav.appendChild(button('Continue →', 'primary', () => {
      if (!fd.handoverDate || !fd.ackSettled || !ackHandover) { toast('Please complete all fields and acknowledgments.', true); return; }
      setStep(4);
    }));
    body.appendChild(nav);
  }

  function s5() {
    body.appendChild(div({ class: 'auth-eyebrow' }, 'Final Acknowledgment'));
    const grp = div({ class: 'choice-group', style: { marginBottom: 16 } });
    grp.appendChild(ackItem('I am entering this agreement voluntarily', () => fd.ackVoluntary, v => fd.ackVoluntary = v));
    grp.appendChild(ackItem('I understand this agreement is binding', () => fd.ackBinding, v => fd.ackBinding = v));
    grp.appendChild(ackItem('I acknowledge that RichNation Global LTD RC 8998019 is the authorized manager of my channel', () => fd.ackRC, v => fd.ackRC = v));
    body.appendChild(grp);
    const nav = div({ class: 'step-nav' });
    nav.appendChild(button('← Back', 'ghost', () => setStep(3)));
    nav.appendChild(div({ class: 'u-flex-1' }));
    const submitBtn = button('Submit Agreement →', 'primary', async () => {
      if (!fd.ackVoluntary || !fd.ackBinding || !fd.ackRC) { toast('Please check all final acknowledgments.', true); return; }
      submitBtn.textContent = 'Submitting...'; submitBtn.disabled = true;
      const aid = 'rna_agr_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
      try {
        await db.ref('rna_monetization_agreements/' + aid).set({ ...fd, id: aid, submittedAt: dateStr(), adminStatus: 'Pending Review' });
        await db.ref('rna_notifications').push({
          type: 'new_agreement', name: fd.fullName,
          formType: fd.choice === 'continued' ? 'Continued Management Agreement' : 'Self-Management Handover',
          date: dateStr(), read: false
        });
        close();
        toast('Agreement submitted — thank you!');
        window.open(waLink('2349164678560', `${fd.fullName} just submitted a Post-Monetization Agreement (${fd.choice === 'continued' ? 'Continued Management' : 'Self-Management Handover'}) for ${fd.channelName}.`), '_blank');
      } catch (e) {
        toast('Error: ' + e.message, true);
        submitBtn.textContent = 'Submit Agreement →'; submitBtn.disabled = false;
      }
    }, 'btn-full');
    nav.appendChild(submitBtn);
    body.appendChild(nav);
  }

  setStep(0);
}
