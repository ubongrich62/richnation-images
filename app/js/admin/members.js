// Admin → Members tab: register new members, manage all members, generate passwords.
const PKG_NOTES = {
  premium: 'N3,000,000 total. N500,000 deposit to start. Remaining N2,500,000 recovered via 70/30 revenue sharing after monetization.',
  standard: 'N1,500,000 total. Installment options available. 100% earnings belong to investor — no revenue sharing.',
  special: 'N1,000,000 total. Management approved. 100% earnings belong to investor — no revenue sharing.',
  training: 'N100,000 total. Full payment or N50,000 first installment. 100% earnings belong to student.'
};
const CHANNEL_NICHES = ['', 'Movie Recap', 'Finance', 'Football', 'Entertainment', 'Storytelling', 'Faceless Content', 'Digital Education', 'Motivation', 'Other'];
const CHANNEL_STATUSES = ['Channel Setup in Progress', 'Channel Setup Completed', 'Content Testing in Progress', 'Niche Optimization', 'Growth Phase — Building Watch Time', 'Monetization Application Submitted', 'Monetized -- Earning', 'Not Started Yet'];
const MONO_STATUSES = ['Channel Setup in Progress', 'Content Testing in Progress', 'Niche Optimization', 'Growth Phase — Building Watch Time', 'Monetization Application Submitted', 'Monetized -- Earning', 'Channel Paused'];

function renderMembersTab(el, session) {
  let sub = 'register';
  const bar = div({ class: 'subtab-bar' });
  const body = div({});
  el.appendChild(bar); el.appendChild(body);

  function renderBar() {
    clear(bar);
    [['register', 'Register New Member'], ['all', 'All Members'], ['genpass', 'Generate Password']].forEach(([id, label]) => {
      const b = button(label, null, () => { sub = id; renderBar(); renderBody(); });
      b.className = 'subtab-btn' + (id === sub ? ' is-active' : '');
      bar.appendChild(b);
    });
  }
  function renderBody() {
    clear(body);
    if (sub === 'register') renderRegister(body);
    else if (sub === 'all') renderAllMembers(body);
    else renderGenPassword(body);
  }
  renderBar(); renderBody();
}

function renderRegister(body) {
  const reg = {
    fullName: '', gender: 'Prefer not to say', email: '', phone: '', country: 'Nigeria', stateCity: '',
    plan: 'premium', payRef: '', totalPaid: '', balance: '', balanceDate: '',
    channelName: '', niche: '', channelStatus: 'Channel Setup in Progress',
    password: '', notes: ''
  };
  const form = div({ class: 'card' });
  body.appendChild(form);

  function draw() {
    clear(form);
    form.appendChild(div({ class: 'card-title' }, 'Section 1: Personal Details'));
    form.appendChild(div({ class: 'grid-2' },
      field('Full Name *', fieldInput(reg.fullName, v => reg.fullName = v, 'Member full name')),
      field('Gender', fieldSelect(reg.gender, [['Male', 'Male'], ['Female', 'Female'], ['Prefer not to say', 'Prefer not to say']], v => reg.gender = v))));
    form.appendChild(div({ class: 'grid-2' },
      field('Email *', fieldInput(reg.email, v => reg.email = v, 'member@email.com', 'email')),
      field('WhatsApp Number *', fieldInput(reg.phone, v => reg.phone = v, '+234...'))));
    form.appendChild(div({ class: 'grid-2' },
      field('Country *', fieldInput(reg.country, v => reg.country = v, 'Nigeria')),
      field('State/City *', fieldInput(reg.stateCity, v => reg.stateCity = v, 'e.g. Lagos'))));

    form.appendChild(div({ class: 'divider' }));
    form.appendChild(div({ class: 'card-title' }, 'Section 2: Package Selection'));
    const planSel = fieldSelect(reg.plan, [['premium', 'Premium — N3,000,000'], ['standard', 'Standard — N1,500,000'], ['special', 'Special — N1,000,000'], ['training', 'Training — N100,000']], v => { reg.plan = v; draw(); });
    form.appendChild(field('Package *', planSel));
    form.appendChild(div({ class: 'info-box info-box-brand' }, PKG_NOTES[reg.plan]));

    form.appendChild(div({ class: 'divider' }));
    form.appendChild(div({ class: 'card-title' }, 'Section 3: Payment Records'));
    form.appendChild(field('Payment Reference / Receipt Number', fieldInput(reg.payRef, v => reg.payRef = v, 'e.g. TRX12345')));
    form.appendChild(div({ class: 'grid-2' },
      field('Total Amount Paid (₦)', fieldInput(reg.totalPaid, v => reg.totalPaid = v, '0', 'number')),
      field('Outstanding Balance (₦)', fieldInput(reg.balance, v => { reg.balance = v; draw(); }, '0', 'number'))));
    if (Number(reg.balance) > 0) {
      form.appendChild(field('Balance Completion Date', fieldInput(reg.balanceDate, v => reg.balanceDate = v, '', 'date')));
      form.appendChild(div({ class: 'info-box info-box-red' }, 'Important: If the balance is not paid by the date set, the account may be disabled or made inactive.'));
    }

    form.appendChild(div({ class: 'divider' }));
    form.appendChild(div({ class: 'card-title' }, 'Section 4: YouTube Channel'));
    form.appendChild(field('Channel Name (optional)', fieldInput(reg.channelName, v => reg.channelName = v, 'Channel name')));
    form.appendChild(div({ class: 'grid-2' },
      field('Niche', fieldSelect(reg.niche, CHANNEL_NICHES.map(n => [n, n || 'Not selected yet']), v => reg.niche = v)),
      field('Channel Status', fieldSelect(reg.channelStatus, CHANNEL_STATUSES.map(s => [s, s]), v => reg.channelStatus = v))));

    form.appendChild(div({ class: 'divider' }));
    form.appendChild(div({ class: 'card-title' }, 'Section 5: Portal Login Password'));
    const pwWrap = div({ class: 'password-wrap' });
    const pwInp = fieldInput(reg.password, v => reg.password = v, 'Set a password', 'password');
    pwInp.style.paddingRight = '44px';
    const eyeBtn = btn({ class: 'password-toggle', type: 'button' }); eyeBtn.innerHTML = '&#128065;';
    let visible = false;
    eyeBtn.addEventListener('click', () => { visible = !visible; pwInp.type = visible ? 'text' : 'password'; eyeBtn.classList.toggle('is-visible', visible); });
    pwWrap.appendChild(pwInp); pwWrap.appendChild(eyeBtn);
    form.appendChild(div({ class: 'field' }, fieldLabel('Password *'), pwWrap));
    form.appendChild(button('Generate Password', 'dark', () => { reg.password = genPassword(); draw(); }, 'btn-sm'));

    form.appendChild(div({ class: 'divider' }));
    form.appendChild(field('Admin Notes (optional)', fieldTextarea(reg.notes, v => reg.notes = v, 'Any internal notes about this member...', 3)));

    const errBox = div({ class: 'info-box info-box-red', style: { display: 'none' } });
    form.appendChild(errBox);

    const submitBtn = button('Register Member Now', 'primary', async () => {
      if (!reg.fullName.trim() || !reg.email.includes('@') || !reg.phone.trim() || !reg.password.trim()) {
        errBox.textContent = 'Please provide name, a valid email, phone number, and a password.';
        errBox.style.display = 'block'; return;
      }
      errBox.style.display = 'none';
      submitBtn.textContent = 'Registering...'; submitBtn.disabled = true;
      const mid = 'member_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5);
      const memberData = {
        id: mid, name: reg.fullName, gender: reg.gender, email: reg.email, phone: reg.phone,
        country: reg.country, stateCity: reg.stateCity, plan: reg.plan, payRef: reg.payRef,
        totalPaid: reg.totalPaid, balance: reg.balance, balanceDate: reg.balanceDate,
        channelName: reg.channelName, niche: reg.niche, channelStatus: reg.channelStatus,
        password: reg.password, notes: reg.notes, joinDate: dateStr(),
        registeredBy: 'admin', source: 'admin_registration', portalStatus: 'active', accountStatus: 'active'
      };
      try {
        await db.ref('rna_members/' + mid).set(memberData);
        await db.ref('rna_form_submissions/rna_reg_' + mid).set({
          id: 'rna_reg_' + mid, type: reg.plan === 'training' ? 'student' : 'investor',
          fullName: reg.fullName, email: reg.email, phone: reg.phone, submittedAt: dateStr(), status: 'Admin Registered'
        });
        await db.ref('rna_notifications').push({ type: 'new_registration', name: reg.fullName, formType: 'Admin Registered — ' + PACKAGES[reg.plan].label, date: dateStr(), read: false });
        showRegSuccess(body, memberData);
      } catch (e) {
        errBox.textContent = 'Error: ' + e.message; errBox.style.display = 'block';
        submitBtn.textContent = 'Register Member Now'; submitBtn.disabled = false;
      }
    }, 'btn-full btn-lg');
    submitBtn.style.marginTop = '16px';
    form.appendChild(submitBtn);
  }
  draw();
}

function showRegSuccess(body, member) {
  clear(body);
  const card = div({ class: 'card card-hi' });
  card.appendChild(div({ class: 'card-title' }, '✓ Member Registered Successfully'));
  const portalUrl = 'https://richnation-academy-communitys.netlify.app';
  [['Package', PACKAGES[member.plan].label], ['Email', member.email], ['Password', member.password], ['Portal', portalUrl]]
    .forEach(([l, v]) => card.appendChild(div({ class: 'detail-row' }, span({ class: 'detail-row-label' }, l), span({ class: 'detail-row-value mono' }, v))));

  const waMsg = `Welcome to RichNation Academy, ${member.name}!\n\nYour ${PACKAGES[member.plan].label} package is active.\n\nPortal login:\nLink: ${portalUrl}\nEmail: ${member.email}\nPassword: ${member.password}\n\nPlease log in and check the Welcome room for next steps.`;
  const actions = div({ class: 'u-flex u-gap-sm u-wrap', style: { marginTop: 14 } });
  actions.appendChild(h('a', { class: 'btn btn-primary', href: waLink(member.phone, waMsg), target: '_blank' }, 'Send Login via WhatsApp'));
  actions.appendChild(button('Copy Login Details', 'dark', () => copyToClipboard(`Portal: ${portalUrl}\nEmail: ${member.email}\nPassword: ${member.password}`)));
  actions.appendChild(button('Register Another Member', 'ghost', () => renderRegister(body)));
  card.appendChild(actions);
  body.appendChild(card);
}

async function renderAllMembers(body) {
  body.appendChild(div({ class: 'empty-state' }, 'Loading members...'));
  let members;
  try {
    const snap = await db.ref('rna_members').once();
    const all = snap.val() || {};
    members = Object.values(all).filter(m => m.id !== 'admin' && m.plan !== 'admin').sort((a, b) => String(b.id).localeCompare(String(a.id)));
  } catch (e) {
    clear(body); body.appendChild(div({ class: 'empty-state' }, 'Could not load members: ' + e.message)); return;
  }
  clear(body);
  body.appendChild(div({ class: 'card-title' }, `All Member Accounts (${members.length})`));
  if (!members.length) { body.appendChild(div({ class: 'empty-state' }, 'No members yet.')); return; }
  members.forEach(m => body.appendChild(renderMemberCard(m, body)));
}

function renderMemberCard(m, listContainer) {
  const pkg = PACKAGES[m.plan] || PACKAGES.standard;
  const isActive = m.portalStatus === 'active' || m.accountStatus === 'active' || (!m.portalStatus && !m.accountStatus);
  const card = div({ class: 'collapse-card' });
  const head = div({ class: 'collapse-head' });
  head.appendChild(div({ class: 'avatar avatar-md' }, initials(m.name)));
  const info = div({ style: { flex: 1, minWidth: 160 } });
  info.appendChild(div({ style: { fontWeight: 700, fontSize: 13.5 } }, m.name));
  info.appendChild(div({ class: 'u-small u-muted' }, `${m.email || ''} · ${m.phone || ''}`));
  info.appendChild(div({ class: 'u-small u-muted' }, `${m.country || ''}${m.stateCity ? ', ' + m.stateCity : ''} · Joined ${m.joinDate || '—'}`));
  if (m.channelName || m.niche) info.appendChild(div({ class: 'u-small u-muted' }, `Channel: ${m.channelName || '—'} (${m.niche || 'niche not set'})`));
  head.appendChild(info);
  head.appendChild(badge(pkg.label, pkg.badge));
  head.appendChild(badge(isActive ? 'Active' : 'Inactive', isActive ? 'green' : 'red'));
  card.appendChild(head);

  const bodyEl = div({ class: 'collapse-body', style: { display: 'none' } });
  let expanded = false;
  head.addEventListener('click', () => { expanded = !expanded; bodyEl.style.display = expanded ? 'block' : 'none'; });

  // Password row
  bodyEl.appendChild(div({ class: 'collapse-section' },
    div({ class: 'collapse-section-label' }, 'Current Password'),
    div({ class: 'u-flex u-center u-gap-sm' }, span({ class: 'mono', style: { color: 'var(--brand)' } }, m.password || '—'),
      button('Copy', 'dark', e => { e.stopPropagation(); copyToClipboard(m.password || ''); }, 'btn-sm'))));

  // Update password
  let newPw = m.password || '';
  const pwInp = fieldInput(newPw, v => newPw = v, '');
  const pwRow = div({ class: 'collapse-section u-flex u-gap-sm' }, pwInp,
    button('Gen', 'dark', e => { e.stopPropagation(); newPw = genPassword(); pwInp.value = newPw; }, 'btn-sm'),
    button('Save', 'primary', async e => {
      e.stopPropagation();
      await db.ref('rna_members/' + m.id + '/password').set(newPw);
      m.password = newPw;
      toast('Password updated for ' + m.name + '.');
    }, 'btn-sm'));
  bodyEl.appendChild(div({ class: 'collapse-section-label' }, 'Update Password'));
  bodyEl.appendChild(pwRow);

  // Actions
  const actions = div({ class: 'collapse-section u-flex u-gap-sm u-wrap' });
  actions.appendChild(button('Copy Email', 'ghost', e => { e.stopPropagation(); copyToClipboard(m.email || ''); }, 'btn-sm'));
  actions.appendChild(button('Copy WhatsApp', 'ghost', e => { e.stopPropagation(); copyToClipboard(m.phone || ''); }, 'btn-sm'));
  const waMsg = `Hi ${m.name}, this is RichNation Academy management. Here is your portal login:\nhttps://richnation-academy-communitys.netlify.app\nEmail: ${m.email}\nPassword: ${m.password}`;
  const waA = h('a', { class: 'btn btn-dark btn-sm', href: waLink(m.phone, waMsg), target: '_blank', onClick: e => e.stopPropagation() }, 'Send Login via WhatsApp');
  actions.appendChild(waA);
  actions.appendChild(button(isActive ? 'Deactivate' : 'Activate', isActive ? 'danger' : 'primary', async e => {
    e.stopPropagation();
    const next = isActive ? 'inactive' : 'active';
    await db.ref('rna_members/' + m.id).update({ accountStatus: next, portalStatus: next });
    toast(`${m.name} ${next === 'active' ? 'activated' : 'deactivated'}.`);
    clear(listContainer.parentElement); renderAllMembers(listContainer.parentElement);
  }, 'btn-sm'));
  actions.appendChild(button('Delete', 'danger', async e => {
    e.stopPropagation();
    if (!confirm(`Delete ${m.name}'s account permanently?`)) return;
    await db.ref('rna_members/' + m.id).remove();
    card.remove();
  }, 'btn-sm'));
  bodyEl.appendChild(actions);

  // Edit profile (collapsible)
  let editorOpen = false;
  const editorWrap = div({ style: { display: 'none' } });
  const editToggle = button('Edit Member Profile', 'ghost', e => {
    e.stopPropagation();
    editorOpen = !editorOpen;
    editToggle.textContent = editorOpen ? 'Close Editor' : 'Edit Member Profile';
    editorWrap.style.display = editorOpen ? 'block' : 'none';
    if (editorOpen && !editorWrap.dataset.built) { buildEditor(); editorWrap.dataset.built = '1'; }
  }, 'btn-sm');
  bodyEl.appendChild(div({ class: 'collapse-section' }, editToggle, editorWrap));

  function buildEditor() {
    const ed = { ...m };
    const f = div({ class: 'card', style: { marginTop: 10, background: 'var(--surf-2)' } });
    f.appendChild(div({ class: 'grid-2' },
      field('Full Name', fieldInput(ed.name, v => ed.name = v)),
      field('Gender', fieldSelect(ed.gender || 'Prefer not to say', [['Male', 'Male'], ['Female', 'Female'], ['Prefer not to say', 'Prefer not to say']], v => ed.gender = v))));
    f.appendChild(div({ class: 'grid-2' },
      field('Email', fieldInput(ed.email, v => ed.email = v)),
      field('WhatsApp', fieldInput(ed.phone, v => ed.phone = v))));
    f.appendChild(div({ class: 'grid-2' },
      field('Country', fieldInput(ed.country, v => ed.country = v)),
      field('State/City', fieldInput(ed.stateCity, v => ed.stateCity = v))));
    f.appendChild(field('Package', fieldSelect(ed.plan, [['premium', 'Premium'], ['standard', 'Standard'], ['special', 'Special'], ['training', 'Training']], v => ed.plan = v)));
    f.appendChild(div({ class: 'grid-2' },
      field('Payment Ref', fieldInput(ed.payRef, v => ed.payRef = v)),
      field('Total Paid (₦)', fieldInput(ed.totalPaid, v => ed.totalPaid = v))));
    f.appendChild(div({ class: 'grid-2' },
      field('Balance (₦)', fieldInput(ed.balance, v => ed.balance = v)),
      field('Balance Due Date', fieldInput(ed.balanceDate, v => ed.balanceDate = v, '', 'date'))));
    f.appendChild(div({ class: 'grid-2' },
      field('Channel Name', fieldInput(ed.channelName, v => ed.channelName = v)),
      field('Niche', fieldInput(ed.niche, v => ed.niche = v))));
    f.appendChild(field('Notes', fieldTextarea(ed.notes, v => ed.notes = v, '', 3)));
    f.appendChild(button('Save Changes', 'primary', async () => {
      const updates = {
        name: ed.name, gender: ed.gender, email: ed.email, phone: ed.phone, country: ed.country, stateCity: ed.stateCity,
        plan: ed.plan, payRef: ed.payRef, totalPaid: ed.totalPaid, balance: ed.balance, balanceDate: ed.balanceDate,
        channelName: ed.channelName, niche: ed.niche, notes: ed.notes, updatedAt: dateStr(), updatedBy: 'admin'
      };
      await db.ref('rna_members/' + m.id).update(updates);
      await db.ref('rna_form_submissions/rna_reg_' + m.id).update({ ...updates, fullName: updates.name }).catch(() => {});
      Object.assign(m, updates);
      toast(`${ed.name} profile updated successfully!`);
    }, 'btn-full'));
    editorWrap.appendChild(f);
  }

  // Channel & monetization (expand on demand)
  let monoOpen = false, monoLoaded = false;
  const monoWrap = div({ style: { display: 'none' } });
  const monoToggle = button('+ Expand Channel & Monetization', 'ghost', async e => {
    e.stopPropagation();
    monoOpen = !monoOpen;
    monoToggle.textContent = monoOpen ? '- Collapse Channel & Monetization' : '+ Expand Channel & Monetization';
    monoWrap.style.display = monoOpen ? 'block' : 'none';
    if (monoOpen && !monoLoaded) { monoLoaded = true; await buildMono(); }
  }, 'btn-sm');
  bodyEl.appendChild(div({ class: 'collapse-section' }, monoToggle, monoWrap));

  async function buildMono() {
    monoWrap.appendChild(div({ class: 'empty-state' }, 'Loading...'));
    const snap = await db.ref('rna_members/' + m.id).once();
    const live = snap.val() || m;
    clear(monoWrap);
    const f = div({ class: 'card', style: { marginTop: 10, background: 'var(--surf-2)' } });
    const isMonetized = live.channelStatus === 'Monetized -- Earning' || live.monetized === true;
    f.appendChild(div({ class: 'u-flex u-between u-center', style: { marginBottom: 10 } },
      div({ class: 'card-title', style: { marginBottom: 0 } }, 'Channel & Monetization'),
      badge(isMonetized ? 'MONETIZED' : 'Not Yet Monetized', isMonetized ? 'green' : 'brand')));

    const statusSel = fieldSelect(live.channelStatus || 'Channel Setup in Progress', MONO_STATUSES.map(s => [s, s]), async v => {
      await db.ref('rna_members/' + m.id).update({ channelStatus: v });
      if (v === 'Monetized -- Earning') toast(`${m.name}'s channel is now MONETIZED!`);
    });
    f.appendChild(field('Channel Status', statusSel));
    f.appendChild(div({ class: 'grid-2' },
      field('Channel Name', fieldInput(live.channelName, v => live.channelName = v)),
      field('Niche', fieldInput(live.niche, v => live.niche = v))));

    f.appendChild(div({ class: 'card-title', style: { fontSize: 12.5, marginTop: 10 } }, 'Earnings Tracking'));
    f.appendChild(div({ class: 'grid-2' },
      field('Last Payout', fieldInput(live.lastPayout, v => live.lastPayout = v, 'e.g. $616.95')),
      field('Total Earnings So Far', fieldInput(live.totalEarnings, v => live.totalEarnings = v))));
    f.appendChild(div({ class: 'grid-2' },
      field('Next Payout Date', fieldInput(live.nextPayoutDate, v => live.nextPayoutDate = v, '', 'date')),
      field('RichNation Share (30%)', fieldInput(live.rnaShare, v => live.rnaShare = v))));
    f.appendChild(field('Management Notes', fieldTextarea(live.managementNotes, v => live.managementNotes = v, '', 3)));

    f.appendChild(button('Save Channel & Earnings Data', 'primary', async () => {
      await db.ref('rna_members/' + m.id).update({
        channelName: live.channelName, niche: live.niche, lastPayout: live.lastPayout,
        totalEarnings: live.totalEarnings, nextPayoutDate: live.nextPayoutDate, rnaShare: live.rnaShare,
        managementNotes: live.managementNotes, monetized: statusSel.value === 'Monetized -- Earning', updatedAt: dateStr()
      });
      toast('Channel data saved.');
    }, 'btn-full'));

    const waMsg2 = `Channel update for ${m.name}:\nChannel: ${live.channelName || '—'}\nStatus: ${live.channelStatus || '—'}\nLast Payout: ${live.lastPayout || '—'}\nTotal Earnings: ${live.totalEarnings || '—'}`;
    f.appendChild(h('a', { class: 'btn btn-dark btn-full', href: waLink(m.phone, waMsg2), target: '_blank', style: { marginTop: 8 } }, 'Send Channel Update via WhatsApp'));
    monoWrap.appendChild(f);
  }

  card.appendChild(bodyEl);
  return card;
}

function renderGenPassword(body) {
  let format = 'standard', customPrefix = 'RNA@', result = '';
  const card = div({ class: 'card', style: { marginBottom: 14 } });
  body.appendChild(card);

  function draw() {
    clear(card);
    card.appendChild(div({ class: 'card-title' }, 'Quick Password Generator'));
    const formatSel = fieldSelect(format, [['standard', 'Standard (RNA@ + 8 chars)'], ['long', 'Long (RNA@ + 12 chars)'], ['simple', 'Simple (6 digits)'], ['custom', 'Custom prefix']], v => { format = v; draw(); });
    card.appendChild(field('Format', formatSel));
    if (format === 'custom') card.appendChild(field('Custom Prefix', fieldInput(customPrefix, v => customPrefix = v, 'RNA@')));
    card.appendChild(button('Generate Password', 'primary', () => {
      if (format === 'standard') result = genPassword('RNA@', 8);
      else if (format === 'long') result = genPassword('RNA@', 12);
      else if (format === 'simple') result = String(Math.floor(100000 + Math.random() * 900000));
      else result = genPassword(customPrefix || 'RNA@', 6);
      draw();
    }, 'btn-full'));
    if (result) {
      card.appendChild(div({ class: 'u-flex u-center u-between', style: { marginTop: 12, padding: '14px', background: 'var(--surf-0)', borderRadius: 'var(--radius-sm)' } },
        span({ class: 'mono', style: { fontSize: 17, color: 'var(--brand)' } }, result),
        button('Copy', 'dark', () => copyToClipboard(result), 'btn-sm')));
    }
  }
  draw();

  let count = '5', batch = [];
  const bulk = div({ class: 'card' });
  body.appendChild(bulk);
  function drawBulk() {
    clear(bulk);
    bulk.appendChild(div({ class: 'card-title' }, 'Bulk Generator'));
    bulk.appendChild(field('Count', fieldSelect(count, [['3', '3'], ['5', '5'], ['10', '10'], ['20', '20']], v => count = v)));
    bulk.appendChild(button('Generate Batch', 'primary', () => {
      batch = Array.from({ length: Number(count) }, () => genPassword('RNA@', 8));
      drawBulk();
    }, 'btn-full'));
    if (batch.length) {
      bulk.appendChild(div({ class: 'mono', style: { marginTop: 12, padding: '14px', background: 'var(--surf-0)', borderRadius: 'var(--radius-sm)', whiteSpace: 'pre-line', fontSize: 12.5 } }, batch.join('\n')));
      bulk.appendChild(button('Copy All', 'dark', () => copyToClipboard(batch.join('\n')), 'btn-sm'));
    }
  }
  drawBulk();

  const tips = div({ class: 'card' });
  tips.appendChild(div({ class: 'card-title' }, 'Password Tips'));
  [
    'Always send password via WhatsApp — never email only',
    'Tell the member to keep their password safe and private',
    'If a member forgets their password, generate a new one and update it in All Members',
    'Passwords are stored in Firebase and visible to admin only',
    'The RNA@ prefix helps members recognize it as their RichNation portal password'
  ].forEach(t => tips.appendChild(div({ class: 'u-small u-muted', style: { marginBottom: 8, lineHeight: 1.6 } }, '• ' + t)));
  body.appendChild(tips);
}
