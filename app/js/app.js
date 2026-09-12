// App entry: boot/routing, and the logged-in portal shell (topbar, sidebar,
// mobile nav, room switching).
const appRoot = document.getElementById('app');
let roomCleanup = null;

function render(el) {
  if (roomCleanup) { roomCleanup(); roomCleanup = null; }
  mount(appRoot, el);
}

function visibleRooms(session) {
  const allowed = (PACKAGES[session.plan] || PACKAGES.standard).rooms;
  return ROOMS.filter(r => (!r.adminOnly || session.isAdmin) && allowed.includes(r.id));
}

const SIDEBAR_SECTIONS = [
  { label: 'My Space', ids: ['welcome', 'my-channel'] },
  { label: 'Community', ids: ['general', 'qa', 'updates'] },
  { label: 'Your Room', ids: ['premium', 'standard', 'special', 'training'] },
  { label: 'Management', ids: ['admin'] }
];

function renderPortal(session) {
  const page = div({ class: 'app' });
  const pkg = PACKAGES[session.plan] || PACKAGES.standard;
  let curRoom = 'welcome';

  // Topbar
  const topbar = div({ class: 'topbar' });
  const logo = div({ class: 'brand-logo' });
  logo.appendChild(div({ class: 'brand-mark' }, 'RNA'));
  logo.appendChild(div({}, div({ class: 'brand-text-lg' }, 'RichNation Academy'), div({ class: 'brand-text-sm' }, 'Community Portal')));
  topbar.appendChild(logo);
  topbar.appendChild(div({ class: 'topbar-spacer' }));
  topbar.appendChild(div({ class: 'u-flex u-center u-gap-xs u-small u-muted' }, span({ class: 'dot-live' }), 'Live'));
  const signOutBtn = button('Sign Out', 'ghost', () => {
    clearSession();
    render(renderLogin());
  }, 'btn-sm');
  signOutBtn.style.marginLeft = '12px';
  topbar.appendChild(signOutBtn);
  page.appendChild(topbar);

  // Body split
  const body = div({ class: 'app-body' });
  const sidebar = div({ class: 'sidebar' });
  const main = div({ class: 'main' });
  body.appendChild(sidebar);
  body.appendChild(main);
  page.appendChild(body);

  // Sidebar head
  const sidHead = div({ class: 'sidebar-head' });
  sidHead.appendChild(badge(pkg.label, pkg.badge));
  sidHead.appendChild(div({ class: 'h-display', style: { fontSize: 14, margin: '8px 0 2px' } }, session.name));
  sidHead.appendChild(div({ class: 'u-small u-muted' }, 'Joined ' + (session.joinDate || '—')));
  sidebar.appendChild(sidHead);

  const sidRooms = div({ class: 'sidebar-rooms' });
  sidebar.appendChild(sidRooms);
  const roomBtnRefs = {};
  SIDEBAR_SECTIONS.forEach(sec => {
    const rooms = visibleRooms(session).filter(r => sec.ids.includes(r.id));
    if (!rooms.length) return;
    sidRooms.appendChild(div({ class: 'sidebar-section-label' }, sec.label));
    rooms.forEach(r => {
      const b = button('', null, () => switchRoom(r.id));
      b.className = 'room-btn';
      b.appendChild(span({ class: 'room-icon' }, r.icon || ''));
      b.appendChild(span({}, r.label));
      roomBtnRefs[r.id] = b;
      sidRooms.appendChild(b);
    });
  });

  const sidFooter = div({ class: 'sidebar-footer' });
  sidFooter.appendChild(div({ class: 'u-small', style: { color: 'var(--brand)', fontWeight: 700 } }, 'RichNation Academy'));
  sidFooter.appendChild(div({ class: 'u-small u-muted' }, 'richnationwbpt.com'));
  sidebar.appendChild(sidFooter);

  // Mobile bottom nav
  const mobNav = div({ class: 'mobile-nav' });
  const mobItems = div({ class: 'mobile-nav-items' });
  mobNav.appendChild(mobItems);
  const mobBtnRefs = {};
  visibleRooms(session).forEach(r => {
    const b = div({ class: 'mobile-nav-btn' });
    b.appendChild(div({ class: 'mobile-nav-icon' }, r.icon || ''));
    b.appendChild(div({}, r.label.split(' ')[0]));
    b.addEventListener('click', () => switchRoom(r.id));
    mobBtnRefs[r.id] = b;
    mobItems.appendChild(b);
  });
  page.appendChild(mobNav);

  function setActiveNav(id) {
    Object.entries(roomBtnRefs).forEach(([rid, el]) => el.classList.toggle('is-active', rid === id));
    Object.entries(mobBtnRefs).forEach(([rid, el]) => el.classList.toggle('is-active', rid === id));
  }

  function switchRoom(id) {
    curRoom = id;
    setActiveNav(id);
    if (roomCleanup) { roomCleanup(); roomCleanup = null; }
    clear(main);
    main.style.cssText = '';
    if (id === 'admin' && session.isAdmin) roomCleanup = buildAdmin(main, session) || null;
    else if (id === 'welcome') buildWelcome(main, session);
    else if (id === 'updates') roomCleanup = buildUpdates(main) || null;
    else if (id === 'my-channel') roomCleanup = buildMyChannel(main, session) || null;
    else roomCleanup = buildChatRoom(main, session, id) || null;
  }

  switchRoom('welcome');
  return page;
}

function boot() {
  const session = getSession();
  render(session ? renderPortal(session) : renderLogin());
}

window.addEventListener('load', () => {
  const params = new URLSearchParams(window.location.search);
  const pkgParam = params.get('pkg');
  const joinParam = params.get('join');
  const emailParam = params.get('email');
  const passParam = params.get('password') || params.get('pass');
  const nameParam = params.get('name');
  const refParam = params.get('ref');

  if (joinParam === '1' || pkgParam) {
    clearSession();
    render(renderOnboarding(pkgParam, nameParam, emailParam, refParam));
    return;
  }

  if (emailParam && passParam) {
    const loading = div({ class: 'loading-page' }, div({ class: 'spinner' }), div({ class: 'u-muted' }, 'Signing you in...'));
    mount(appRoot, loading);
    setTimeout(async () => {
      try {
        const snap = await db.ref('rna_members').once();
        const all = snap.val() || {};
        const match = Object.values(all).find(m => m.email && m.email.toLowerCase() === emailParam.toLowerCase() && m.password === passParam);
        if (match) { setSession(match); render(renderPortal(match)); }
        else render(renderLogin(emailParam));
      } catch { render(renderLogin(emailParam)); }
    }, 600);
    return;
  }

  boot();
});
