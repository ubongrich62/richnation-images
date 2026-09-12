// Admin panel shell: header, notifications bell/popup, and tab dispatch.
// Each tab module exposes a global render function: renderMembersTab(el,session),
// renderMessagesTab, renderSubmissionsTab, renderAgreementsTab, renderCouponsTab,
// renderUpdatesTab, renderRoomsTab, renderAiTab.
const ADMIN_TABS = [
  { id: 'members', label: 'Members', render: (el, s) => renderMembersTab(el, s) },
  { id: 'messages', label: 'Messages', render: (el, s) => renderMessagesTab(el, s) },
  { id: 'submissions', label: 'Submissions', render: (el, s) => renderSubmissionsTab(el, s) },
  { id: 'agreements', label: 'Agreements', render: (el, s) => renderAgreementsTab(el, s) },
  { id: 'coupons', label: 'Coupons', render: (el, s) => renderCouponsTab(el, s) },
  { id: 'updates', label: 'Updates', render: (el, s) => renderUpdatesTab(el, s) },
  { id: 'rooms', label: 'Rooms', render: (el, s) => renderRoomsTab(el, s) },
  { id: 'ai', label: 'AI', render: (el, s) => renderAiTab(el, s) }
];

function buildAdmin(main, session) {
  let activeTab = 'members';
  let notifPopupOpen = false;
  let lastNotifCount = Number(sessionStorage.getItem('rna_last_notif') || 0);

  const wrap = div({ class: 'content-pad' });
  main.appendChild(wrap);

  const header = div({ class: 'admin-header' });
  header.appendChild(div({ class: 'admin-title' }, 'Admin Panel'));

  const bellWrap = div({ class: 'notif-bell-wrap' });
  const bell = button('🔔', 'dark', () => toggleNotifPopup(), 'btn-icon notif-bell');
  const countPill = span({ class: 'notif-count', style: { display: 'none' } }, '0');
  bell.appendChild(countPill);
  bellWrap.appendChild(bell);
  header.appendChild(bellWrap);
  wrap.appendChild(header);

  const tabBar = div({ class: 'tab-bar' });
  wrap.appendChild(tabBar);
  const tabContent = div({});
  wrap.appendChild(tabContent);

  function renderTabBar() {
    clear(tabBar);
    ADMIN_TABS.forEach(t => {
      const b = button(t.label, null, () => { activeTab = t.id; renderTabBar(); renderActiveTab(); }, 'tab-btn' + (t.id === activeTab ? ' is-active' : ''));
      b.className = 'tab-btn' + (t.id === activeTab ? ' is-active' : '');
      tabBar.appendChild(b);
    });
  }
  function renderActiveTab() {
    clear(tabContent);
    ADMIN_TABS.find(t => t.id === activeTab).render(tabContent, session);
  }

  let notifPopup = null;
  function closeNotifPopup() { if (notifPopup) { notifPopup.remove(); notifPopup = null; notifPopupOpen = false; } }
  async function toggleNotifPopup() {
    if (notifPopupOpen) { closeNotifPopup(); return; }
    notifPopupOpen = true;
    await openNotifPopup();
  }
  async function openNotifPopup(auto) {
    closeNotifPopup();
    notifPopupOpen = true;
    notifPopup = div({ class: 'notif-popup' });
    const head = div({ class: 'notif-popup-head' });
    head.appendChild(div({ style: { fontWeight: 700, fontSize: 13 } }, 'Notifications'));
    const clearBtn = button('Clear All', 'ghost', async (e) => {
      e.stopPropagation();
      await db.ref('rna_notifications').set(null);
      closeNotifPopup();
      countPill.style.display = 'none';
    }, 'btn-sm');
    head.appendChild(clearBtn);
    notifPopup.appendChild(head);
    notifPopup.addEventListener('click', e => e.stopPropagation());

    const snap = await db.ref('rna_notifications').once();
    const val = snap.val() || {};
    const list = Object.entries(val).map(([k, v]) => ({ ...v, _key: k })).sort((a, b) => b._key.localeCompare(a._key));
    if (!list.length) notifPopup.appendChild(div({ class: 'empty-state' }, 'No notifications.'));
    list.slice(0, 30).forEach(n => {
      const row = div({ class: 'notif-row' + (n.read === false ? ' is-unread' : '') });
      row.appendChild(div({ class: 'notif-row-name' }, n.name || 'Unknown'));
      row.appendChild(div({ class: 'notif-row-meta' }, `${n.formType || n.type || ''} · ${n.date || ''}${n.read === false ? ' · NEW' : ''}`));
      notifPopup.appendChild(row);
    });
    document.body.appendChild(notifPopup);

    if (!auto) {
      const unreadKeys = list.filter(n => n.read === false).map(n => n._key);
      if (unreadKeys.length) {
        const patch = {}; unreadKeys.forEach(k => patch[k + '/read'] = true);
        await db.ref('rna_notifications').update(patch);
        countPill.style.display = 'none';
        sessionStorage.setItem('rna_last_notif', '0');
        lastNotifCount = 0;
      }
    }
  }
  document.addEventListener('click', closeNotifPopup);

  async function pollNotifications() {
    try {
      const snap = await db.ref('rna_notifications').once();
      const val = snap.val() || {};
      const unread = Object.values(val).filter(n => n.read === false).length;
      if (unread > 0) { countPill.textContent = String(unread); countPill.style.display = 'block'; }
      else countPill.style.display = 'none';
      if (unread > lastNotifCount) {
        bell.classList.add('is-flash');
        setTimeout(() => bell.classList.remove('is-flash'), 3000);
        if (!notifPopupOpen) {
          await openNotifPopup(true);
          setTimeout(() => { if (notifPopupOpen) closeNotifPopup(); }, 4000);
        }
      }
      lastNotifCount = unread;
      sessionStorage.setItem('rna_last_notif', String(unread));
    } catch { /* ignore transient poll failures */ }
  }

  renderTabBar();
  renderActiveTab();
  pollNotifications();
  const interval = setInterval(pollNotifications, 4000);
  return () => { clearInterval(interval); document.removeEventListener('click', closeNotifPopup); closeNotifPopup(); };
}
