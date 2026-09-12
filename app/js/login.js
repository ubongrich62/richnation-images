// Sign-in screen: email + password against rna_members, with an admin bypass.
function renderLogin(prefillEmail, prefillMsg) {
  const page = div({ class: 'auth-page' });
  const card = div({ class: 'auth-card' });

  const logo = div({ class: 'auth-logo' });
  logo.appendChild(div({ class: 'auth-logo-mark' }, 'RNA'));
  logo.appendChild(div({ class: 'auth-title' }, 'RichNation Academy'));
  logo.appendChild(div({ class: 'auth-sub' }, 'Investor & Student Community Portal'));
  card.appendChild(logo);

  card.appendChild(div({ class: 'auth-eyebrow' }, 'Sign In to Your Portal'));
  card.appendChild(div({ class: 'auth-caption' }, 'Use the email and password sent to you by management.'));

  if (prefillMsg) {
    card.appendChild(div({ class: 'info-box info-box-brand' }, prefillMsg));
  }

  let emailVal = prefillEmail || '', passVal = '';
  const emailInp = fieldInput(prefillEmail || '', v => emailVal = v, 'your@email.com', 'email');

  const passInp = fieldInput('', v => passVal = v, 'Your password', 'password');
  passInp.style.paddingRight = '44px';
  const passWrap = div({ class: 'password-wrap' });
  const eyeBtn = btn({ class: 'password-toggle', type: 'button' });
  eyeBtn.innerHTML = '&#128065;';
  let pwVisible = false;
  eyeBtn.addEventListener('click', () => {
    pwVisible = !pwVisible;
    passInp.type = pwVisible ? 'text' : 'password';
    eyeBtn.classList.toggle('is-visible', pwVisible);
  });
  passWrap.appendChild(passInp);
  passWrap.appendChild(eyeBtn);

  const errBox = div({ class: 'info-box info-box-red', style: { display: 'none' } });

  card.appendChild(field('Email Address', emailInp));
  card.appendChild(div({ class: 'field' }, fieldLabel('Password'), passWrap));
  card.appendChild(errBox);

  function showError(msg) { errBox.textContent = msg; errBox.style.display = 'block'; }

  const signInBtn = button('Sign In', 'primary', null, 'btn-full btn-lg');
  signInBtn.style.marginBottom = '16px';

  signInBtn.addEventListener('click', async () => {
    if (!emailVal.trim() || !passVal.trim()) { showError('Please enter your email and password.'); return; }
    signInBtn.textContent = 'Signing in...'; signInBtn.disabled = true;

    if (passVal.trim() === ADMIN_PASS || (emailVal.trim().toLowerCase() === 'admin' && passVal.trim() === ADMIN_CODE)) {
      const adminData = { id: 'admin', name: 'General Manager', plan: 'admin', email: emailVal.trim(), isAdmin: true };
      setSession(adminData);
      toast('Welcome, Administrator.');
      setTimeout(() => boot(), 400);
      return;
    }

    try {
      const snap = await db.ref('rna_members').once();
      const all = snap.val() || {};
      const matches = Object.values(all).filter(m => m.email && m.email.toLowerCase() === emailVal.trim().toLowerCase());
      if (!matches.length) {
        showError('No account found with this email. Contact management.');
        signInBtn.textContent = 'Sign In'; signInBtn.disabled = false; return;
      }
      const member = matches[0];
      if (!member.password) {
        showError('Your account has no password set. Contact management to get your password.');
        signInBtn.textContent = 'Sign In'; signInBtn.disabled = false; return;
      }
      if (member.password !== passVal.trim()) {
        showError('Incorrect password. Contact management if you forgot your password.');
        signInBtn.textContent = 'Sign In'; signInBtn.disabled = false; return;
      }
      if (member.accountStatus === 'inactive' || member.portalStatus === 'inactive' || member.status === 'inactive' || member.status === 'disabled') {
        showError('Your account has been deactivated. Please contact management on WhatsApp: +234 916 467 8560');
        signInBtn.textContent = 'Sign In'; signInBtn.disabled = false; return;
      }
      setSession(member);
      toast('Welcome back, ' + member.name.split(' ')[0] + '!');
      setTimeout(() => boot(), 400);
    } catch (e) {
      showError('Error: ' + e.message);
      signInBtn.textContent = 'Sign In'; signInBtn.disabled = false;
    }
  });

  [emailInp, passInp].forEach(i => i.addEventListener('keydown', e => { if (e.key === 'Enter') signInBtn.click(); }));

  card.appendChild(signInBtn);
  card.appendChild(div({ class: 'u-small u-muted', style: { textAlign: 'center', lineHeight: '1.8' } },
    'Forgot your password? Contact management on WhatsApp: +234 916 467 8560'));

  page.appendChild(card);
  return page;
}
