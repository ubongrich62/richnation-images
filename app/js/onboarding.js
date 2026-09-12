// 8-step investor/student onboarding wizard, ending in access-code verification
// that creates the rna_members/<id> record.
function renderOnboarding(prefillPkg, prefillName, prefillEmail, prefillRef) {
  let step = 0;
  const form = {
    fullName: prefillName || '', phone: '', email: prefillEmail || '', country: 'Nigeria',
    plan: prefillPkg || '', paymentRef: prefillRef || '', investmentAmount: '', agreedPct: '30',
    paymentStructure: '', firstPayAmt: '', firstPayDate: '',
    secondPayAmt: '', secondPayDate: '', thirdPayAmt: '', thirdPayDate: '',
    totalPaid: '', outstandingBalance: '',
    channelName: '', niche: '', receivedHandles: 'Not yet',
    channelStatus: 'Channel Setup Completed',
    commPref: 'WhatsApp', commDelay: 'No',
    message: '',
    confirmItems: [], accessCode: ''
  };

  const page = div({ class: 'auth-page' });
  const card = div({ class: 'auth-card auth-card-wide' });

  const logoWrap = div({ style: { textAlign: 'center', marginBottom: 22 } });
  logoWrap.appendChild(div({ class: 'auth-logo-mark', style: { margin: '0 auto 12px' } }, 'RNA'));
  logoWrap.appendChild(div({ class: 'h-display', style: { fontSize: 18, marginBottom: 3 } }, 'RichNation Academy'));
  logoWrap.appendChild(div({ class: 'u-small u-muted', style: { letterSpacing: '1px', textTransform: 'uppercase' } }, 'Investor Onboarding'));
  card.appendChild(logoWrap);

  const stepTrack = div({ class: 'step-track' });
  for (let i = 0; i < 8; i++) stepTrack.appendChild(div({ class: 'step-dot' }));
  card.appendChild(stepTrack);

  function updateDots() {
    Array.from(stepTrack.children).forEach((d, i) => {
      d.classList.toggle('is-done', i < step);
      d.classList.toggle('is-active', i === step);
    });
  }

  const stepWrap = div({});
  card.appendChild(stepWrap);
  const navRow = div({ class: 'step-nav' });
  card.appendChild(navRow);

  function renderStep() {
    clear(stepWrap); clear(navRow); updateDots();
    [s0, s1, s2, s3, s4, s5, s6, s7][step]();
  }
  function next() { step = Math.min(7, step + 1); renderStep(); }
  function back() { step = Math.max(0, step - 1); renderStep(); }
  function navBtns(canNext, nextLabel) {
    if (step > 0) navRow.appendChild(button('← Back', 'ghost', back));
    navRow.appendChild(div({ class: 'u-flex-1' }));
    if (step < 7) navRow.appendChild(button(nextLabel || 'Continue →', 'primary', () => { if (!canNext || canNext()) next(); }));
  }
  function sectionHead(title, sub) {
    stepWrap.appendChild(div({ class: 'step-title' }, title));
    if (sub) stepWrap.appendChild(div({ class: 'step-sub' }, sub));
  }

  // STEP 0 — Welcome (auto-skipped when payment already prefilled name/email/pkg)
  function s0() {
    if (prefillName && prefillEmail && prefillPkg) { next(); return; }
    sectionHead('Welcome to RichNation Academy');
    stepWrap.appendChild(div({ class: 'u-small', style: { color: 'var(--text-2)', lineHeight: 1.75, marginBottom: 16 } },
      'Complete this form to activate your membership and get access to your community room. This takes about 3 minutes.'));
    stepWrap.appendChild(div({ class: 'info-box info-box-brand' },
      'This form helps RichNation Academy maintain transparency, track your investment, confirm your agreement, and keep you updated on your YouTube channel progress.'));
    const pkgParam = new URLSearchParams(window.location.search).get('pkg');
    if (pkgParam && PACKAGES[pkgParam]) {
      form.plan = pkgParam;
      stepWrap.appendChild(div({ class: 'info-box info-box-green' }, '✓ Package detected: ' + PACKAGES[pkgParam].label));
    }
    navRow.appendChild(div({ class: 'u-flex-1' }));
    navRow.appendChild(button('Start Onboarding →', 'primary', next));
  }

  // STEP 1 — Personal details
  function s1() {
    sectionHead('Section 1: Your Details', 'Personal information for your investor profile.');
    const nameInp = fieldInput(form.fullName, v => form.fullName = v, 'Enter your full name');
    const phoneInp = fieldInput(form.phone, v => form.phone = v, 'WhatsApp number e.g. +234...');
    const emailInp = fieldInput(form.email, v => form.email = v, 'your@email.com', 'email');
    const countryInp = fieldInput(form.country, v => form.country = v, 'e.g. Nigeria');
    stepWrap.appendChild(field('Full Name *', nameInp));
    stepWrap.appendChild(field('Phone Number (WhatsApp preferred) *', phoneInp));
    stepWrap.appendChild(div({ class: 'grid-2' }, field('Email Address *', emailInp), field('Country *', countryInp)));
    navBtns(() => {
      if (!form.fullName.trim() || !form.phone.trim() || !form.email.trim()) { toast('Please fill all required fields.', true); return false; }
      return true;
    });
  }

  // STEP 2 — Investment details
  function s2() {
    sectionHead('Section 2: Investment Details', 'Select your investment plan and terms.');
    const plans = [
      ['premium', 'Premium Full-Service — ₦3,000,000'],
      ['standard', 'Standard Full-Service — ₦1,500,000'],
      ['special', 'Special Consideration — ₦1,000,000'],
      ['training', 'Training Program — ₦100,000']
    ];
    stepWrap.appendChild(fieldLabel('Selected Investment Plan *'));
    const group = div({ class: 'choice-group', style: { marginBottom: 14 } });
    plans.forEach(([val, label]) => {
      const item = div({ class: 'choice-item' + (form.plan === val ? ' is-selected' : '') });
      const inp = inputEl({ type: 'radio', name: 'plan', checked: form.plan === val });
      item.appendChild(inp);
      item.appendChild(span({ class: 'choice-label' }, label));
      item.addEventListener('click', () => {
        form.plan = val;
        group.querySelectorAll('.choice-item').forEach(r => r.classList.remove('is-selected'));
        item.classList.add('is-selected'); inp.checked = true;
      });
      group.appendChild(item);
    });
    stepWrap.appendChild(group);
    const amtInp = fieldInput(form.investmentAmount, v => form.investmentAmount = v, 'e.g. 1500000', 'number');
    const pctSel = fieldSelect(form.agreedPct, [['30', '30% to RichNation Academy'], ['25', '25% to RichNation Academy'], ['20', '20% to RichNation Academy']], v => form.agreedPct = v);
    const structSel = fieldSelect(form.paymentStructure, [['', 'Select...'], ['one-time', 'One-time Payment'], ['installment', 'Installment Payment']], v => form.paymentStructure = v);
    stepWrap.appendChild(field('Total Agreed Investment Amount (₦) *', amtInp));
    stepWrap.appendChild(div({ class: 'grid-2' }, field('Agreed % to RichNation Academy *', pctSel), field('Payment Structure *', structSel)));
    navBtns(() => { if (!form.plan || !form.investmentAmount) { toast('Select a plan and enter amount.', true); return false; } return true; });
  }

  // STEP 3 — Payment records
  function s3() {
    sectionHead('Section 3: Payment Records', 'Enter payments made so far.');
    const payRow = (label, amtVal, onAmt, dateVal, onDate) => {
      const a = fieldInput(amtVal, onAmt, 'Amount (₦)', 'number');
      const d = fieldInput(dateVal, onDate, '', 'date');
      return div({ style: { marginBottom: 12 } }, fieldLabel(label), div({ class: 'grid-2' }, a, d));
    };
    stepWrap.appendChild(payRow('First Payment Amount & Date', form.firstPayAmt, v => form.firstPayAmt = v, form.firstPayDate, v => form.firstPayDate = v));
    stepWrap.appendChild(payRow('Second Payment Amount & Date', form.secondPayAmt, v => form.secondPayAmt = v, form.secondPayDate, v => form.secondPayDate = v));
    stepWrap.appendChild(payRow('Third Payment Amount & Date (if any)', form.thirdPayAmt, v => form.thirdPayAmt = v, form.thirdPayDate, v => form.thirdPayDate = v));
    const tot = fieldInput(form.totalPaid, v => form.totalPaid = v, 'Total paid so far (₦)', 'number');
    const bal = fieldInput(form.outstandingBalance, v => form.outstandingBalance = v, 'Outstanding balance (₦)', 'number');
    stepWrap.appendChild(div({ class: 'grid-2' }, field('Total Amount Paid So Far (₦) *', tot), field('Outstanding Balance (₦)', bal)));
    navBtns(() => { if (!form.totalPaid) { toast('Enter total amount paid.', true); return false; } return true; });
  }

  // STEP 4 — Channel details
  function s4() {
    sectionHead('Section 4: YouTube Channel Details', 'Channel information for tracking your progress.');
    const chName = fieldInput(form.channelName, v => form.channelName = v, 'Channel name if assigned');
    const niches = [['', 'Select niche...'], ['Movie Recap', 'Movie Recap'], ['Finance', 'Finance'], ['Football', 'Football'], ['Entertainment', 'Entertainment'], ['Storytelling', 'Storytelling'], ['Faceless Content', 'Faceless Content'], ['Digital Education', 'Digital Education'], ['Other', 'Other']];
    const nicheSel = fieldSelect(form.niche, niches, v => form.niche = v);
    const handlesSel = fieldSelect(form.receivedHandles, [['Yes', 'Yes — I have received my channel handles'], ['Not yet', 'Not yet — Will be shared soon']], v => form.receivedHandles = v);
    stepWrap.appendChild(field('Assigned YouTube Channel Name (if available)', chName));
    stepWrap.appendChild(field('Channel Niche Selected', nicheSel));
    stepWrap.appendChild(field('Have you received your channel handles?', handlesSel));
    navBtns(() => true);
  }

  // STEP 5 — Channel status
  function s5() {
    sectionHead('Section 5: Channel Status', 'What stage is your channel currently at?');
    const statuses = ['Channel Setup Completed', 'Content Testing in Progress', 'Niche Optimization', 'Growth Phase', 'Monetization in Progress', 'Monetized', 'Not Sure / No Update Yet', 'Other'];
    const group = div({ class: 'choice-group' });
    statuses.forEach(s => {
      const item = div({ class: 'choice-item' + (form.channelStatus === s ? ' is-selected' : '') });
      const inp = inputEl({ type: 'radio', name: 'status', checked: form.channelStatus === s });
      item.appendChild(inp); item.appendChild(span({ class: 'choice-label' }, s));
      item.addEventListener('click', () => {
        form.channelStatus = s;
        group.querySelectorAll('.choice-item').forEach(r => r.classList.remove('is-selected'));
        item.classList.add('is-selected'); inp.checked = true;
      });
      group.appendChild(item);
    });
    stepWrap.appendChild(group);
    navBtns(() => true);
  }

  // STEP 6 — Communication preferences & message
  function s6() {
    sectionHead('Section 6 & 7: Communication', 'Your preferred contact method and any message for management.');
    const commSel = fieldSelect(form.commPref, [['WhatsApp', 'WhatsApp'], ['Email', 'Email'], ['Phone', 'Phone'], ['All', 'All Channels']], v => form.commPref = v);
    const delaySel = fieldSelect(form.commDelay, [['No', 'No'], ['Yes', 'Yes — I have experienced delays'], ['Maybe', 'Maybe']], v => form.commDelay = v);
    const msgTA = fieldTextarea(form.message, v => form.message = v, 'Share any message, concern, or question regarding your channel...', 4);
    stepWrap.appendChild(div({ class: 'grid-2' }, field('Preferred Communication Channel *', commSel), field('Have you experienced communication delays?', delaySel)));
    stepWrap.appendChild(field('Message to Management (Optional)', msgTA));
    navBtns(() => true);
  }

  // STEP 7 — Acknowledgment & access code → submit
  function s7() {
    sectionHead('Section 8: Acknowledgment & Access', 'Confirm your understanding and enter your access code to join.');
    const acks = [
      'I understand YouTube monetization is not instant and depends on algorithm performance',
      'I agree to the investment terms and percentage arrangement',
      'I understand that content strategy and niche testing may change to achieve better results',
      'I acknowledge that RichNation Academy manages my channel on my behalf'
    ];
    const checked = new Set(form.confirmItems);
    const group = div({ class: 'choice-group', style: { marginBottom: 16 } });
    acks.forEach((a, i) => {
      const item = div({ class: 'choice-item' });
      const inp = inputEl({ type: 'checkbox', checked: checked.has(i) });
      inp.addEventListener('change', () => { if (inp.checked) checked.add(i); else checked.delete(i); form.confirmItems = [...checked]; });
      item.appendChild(inp); item.appendChild(labelEl({ class: 'choice-label' }, a));
      group.appendChild(item);
    });
    stepWrap.appendChild(fieldLabel('Please confirm the following (check all):'));
    stepWrap.appendChild(group);
    const codeInp = fieldInput(form.accessCode, v => form.accessCode = v, 'Enter your access code from management');
    stepWrap.appendChild(field('Community Access Code', codeInp));
    stepWrap.appendChild(div({ class: 'info-box info-box-brand' },
      'Your access code was sent to you by RichNation Academy management after payment. Contact richnationacademy1@gmail.com if you have not received it.'));

    if (step > 0) navRow.appendChild(button('← Back', 'ghost', back));
    navRow.appendChild(div({ class: 'u-flex-1' }));
    const submitBtn = button('Complete & Join Community →', 'primary', null, 'btn-full');
    submitBtn.addEventListener('click', async () => {
      if (form.confirmItems.length < 4) { toast('Please check all acknowledgment boxes.', true); return; }
      if (!form.accessCode.trim()) { toast('Enter your access code.', true); return; }
      submitBtn.textContent = 'Verifying...'; submitBtn.disabled = true;
      try {
        const code = form.accessCode.trim().toUpperCase();
        const snap = await db.ref('rna_access_codes/' + code).once();
        const codeData = snap.val();
        if (!codeData) {
          toast('Invalid access code. Contact management.', true);
          submitBtn.textContent = 'Complete & Join Community →'; submitBtn.disabled = false; return;
        }
        const memberId = 'member_' + uid();
        const pkg = codeData.pkg || form.plan || 'standard';
        const memberData = {
          id: memberId, name: form.fullName, phone: form.phone, email: form.email, country: form.country,
          plan: pkg, joinDate: dateStr(), joinTime: timeStr(), status: 'active',
          form: { ...form, accessCode: '[VERIFIED]' },
          accessCode: code
        };
        await db.ref('rna_members/' + memberId).set(memberData);
        await db.ref('rna_access_codes/' + code).update({ used: true, usedBy: form.fullName, usedAt: dateStr() });
        setSession(memberData);
        toast('Welcome to RichNation Academy!');
        setTimeout(() => boot(), 500);
      } catch (e) {
        toast('Error: ' + e.message, true);
        submitBtn.textContent = 'Complete & Join Community →'; submitBtn.disabled = false;
      }
    });
    navRow.appendChild(submitBtn);
  }

  renderStep();
  page.appendChild(card);
  return page;
}
