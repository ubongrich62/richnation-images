// Static welcome/rules room — no Firebase reads, just session-aware copy.
function buildWelcome(main, session) {
  const pkg = PACKAGES[session.plan] || PACKAGES.standard;
  const firstName = (session.name || 'there').split(' ')[0];
  const wrap = div({ class: 'content-pad anim-fade-in' });

  // Hero banner
  const hero = div({ class: 'card card-hi', style: { background: 'linear-gradient(135deg,var(--brand-dim),transparent)', marginBottom: 14, position: 'relative', overflow: 'hidden' } });
  hero.appendChild(div({ class: 'u-small', style: { color: 'var(--brand)', fontWeight: 700, letterSpacing: '1.2px', textTransform: 'uppercase', marginBottom: 6 } }, 'Welcome to RichNation Academy'));
  hero.appendChild(div({ class: 'h-display', style: { fontSize: 20, marginBottom: 8 } }, `Hello, ${firstName}! Your Portal is Ready.`));
  hero.appendChild(pEl({ style: { fontSize: 13, color: 'var(--text-2)', lineHeight: 1.7, marginBottom: 12 } },
    'This is your private community space to stay connected with management, track your channel progress, and get support whenever you need it.'));
  hero.appendChild(div({ class: 'u-flex u-center u-gap-sm' }, badge(pkg.label, pkg.badge), div({ class: 'u-small u-muted' }, '— Active Member')));
  wrap.appendChild(hero);

  if (session.channelStatus === 'Monetized -- Earning' && !session.isAdmin) {
    const monoCard = div({ class: 'card card-hi', style: { marginBottom: 14 } });
    monoCard.appendChild(div({ class: 'card-title' }, '🎉 Your Channel Is Monetized!'));
    monoCard.appendChild(pEl({ class: 'u-small u-muted', style: { marginBottom: 12, lineHeight: 1.6 } },
      'Congratulations! Please complete your Post-Monetization Agreement so management knows how you would like to proceed.'));
    monoCard.appendChild(button('Complete Post-Monetization Agreement', 'primary', () => showMonoAgreementForm(session), 'btn-full'));
    wrap.appendChild(monoCard);
  }

  // About your portal
  const about = div({ class: 'card', style: { marginBottom: 14 } });
  about.appendChild(div({ class: 'card-title' }, 'About Your Portal'));
  [
    ['RNA', 'What This Is', 'A private members-only portal for RichNation Academy investors and students to track progress and communicate directly with management.'],
    ['MSG', 'Why It Exists', 'To keep every member informed, build trust through transparency, and give you a direct line to management at any time.'],
    ['HOW', 'How It Works', 'Use the rooms in the sidebar to read updates, ask questions, and message management privately in My Channel.']
  ].forEach(([tag, title, body]) => {
    const row = div({ class: 'u-flex u-gap-md', style: { marginBottom: 14 } });
    row.appendChild(div({ class: 'avatar avatar-sm' }, tag));
    row.appendChild(div({}, div({ style: { fontWeight: 700, fontSize: 13, marginBottom: 3 } }, title), div({ class: 'u-small u-muted', style: { lineHeight: 1.6 } }, body)));
    about.appendChild(row);
  });
  wrap.appendChild(about);

  // How to use
  const how = div({ class: 'card', style: { marginBottom: 14 } });
  how.appendChild(div({ class: 'card-title' }, 'How to Use Your Portal'));
  const steps = [
    ['Log In Anytime', 'Come back whenever you like using the email and password management sent you.'],
    ['Check Your Rooms', 'Your sidebar shows only the rooms available to your package — explore them.'],
    ['Talk to Management in My Channel', 'Use My Channel for any private question or concern about your investment or channel.'],
    ['Check Channel Updates', 'Management posts progress and milestones for your channel in the Updates room.'],
    ['Ask Questions in Q&A', 'General questions about the program go in the Q&A room — management checks it regularly.'],
    ['Be Active and Patient', 'Growth takes time — stay engaged and patient as your channel progresses through each stage.']
  ];
  steps.forEach((s, i) => {
    const row = div({ class: 'u-flex u-gap-md', style: { marginBottom: 12 } });
    row.appendChild(div({ class: 'avatar avatar-sm', style: { borderRadius: '50%' } }, String(i + 1)));
    row.appendChild(div({}, div({ style: { fontWeight: 700, fontSize: 13 } }, s[0]), div({ class: 'u-small u-muted' }, s[1])));
    how.appendChild(row);
  });
  wrap.appendChild(how);

  // Community rules
  const rules = div({ class: 'card', style: { marginBottom: 14 } });
  rules.appendChild(div({ class: 'card-title' }, 'Community Rules'));
  [
    'Be respectful and professional in all messages to management and fellow members',
    'Do not send the same message more than once — management will respond within 24 to 48 hours',
    'Do not share personal financial details such as bank account numbers in this chat',
    'Keep all discussions related to your channel, training, or investment',
    'Do not use offensive language or threatening words — your account may be suspended',
    'If you have a balance outstanding, contact management before the deadline — not after',
    'All conversations in this portal are monitored and recorded for accountability',
    'Treat every member with the respect you would want to receive'
  ].forEach((r, i) => {
    rules.appendChild(div({ class: 'u-flex u-gap-sm', style: { marginBottom: 10, alignItems: 'flex-start' } },
      div({ class: 'u-small', style: { color: 'var(--brand)', fontWeight: 700, flexShrink: 0 } }, (i + 1) + '.'),
      div({ class: 'u-small', style: { color: 'var(--text-2)', lineHeight: 1.6 } }, r)));
  });
  wrap.appendChild(rules);

  // Login details
  const login = div({ class: 'card', style: { marginBottom: 14 } });
  login.appendChild(div({ class: 'card-title' }, 'Your Login Details'));
  [
    ['Portal Link', 'https://richnation-academy-communitys.netlify.app'],
    ['Your Email', session.email || '—'],
    ['Your Password', 'The password sent to you by management via WhatsApp'],
    ['Tip', 'Bookmark this page so you can return to it anytime.']
  ].forEach(([l, v]) => login.appendChild(div({ class: 'detail-row' }, span({ class: 'detail-row-label' }, l), span({ class: 'detail-row-value' }, v))));
  wrap.appendChild(login);

  // Help / contact
  const help = div({ class: 'card', style: { marginBottom: 14 } });
  help.appendChild(div({ class: 'card-title' }, 'Need Help or Have Questions?'));
  [
    ['My Channel Room', 'Message management directly, privately.'],
    ['WhatsApp', '+234 916 467 8560'],
    ['Email', 'richnationacademy1@gmail.com']
  ].forEach(([l, v]) => help.appendChild(div({ class: 'detail-row' }, span({ class: 'detail-row-label' }, l), span({ class: 'detail-row-value' }, v))));
  const waBtn = h('a', { class: 'btn btn-primary btn-full btn-lg', href: 'https://wa.me/2349164678560', target: '_blank', style: { marginTop: 14 } }, 'Message Management on WhatsApp');
  help.appendChild(waBtn);
  wrap.appendChild(help);

  // Closing note
  const closing = div({ class: 'card' });
  closing.appendChild(div({ class: 'card-title' }, 'A Message from RichNation Academy'));
  closing.appendChild(pEl({ style: { fontSize: 13, color: 'var(--text-2)', lineHeight: 1.75, marginBottom: 10 } },
    'Thank you for trusting RichNation Academy with your investment and your channel. We are committed to transparency, consistent communication, and helping you succeed. Growth on YouTube takes time and patience — we appreciate yours.'));
  closing.appendChild(div({ class: 'u-small', style: { color: 'var(--text-3)', fontStyle: 'italic' } }, '— The RichNation Academy Team'));
  wrap.appendChild(closing);

  main.appendChild(wrap);
}
