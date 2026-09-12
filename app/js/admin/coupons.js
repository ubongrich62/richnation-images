// Admin → Coupons tab: generate and manage discount codes.
function renderCouponsTab(el) {
  const form = div({ class: 'card', style: { marginBottom: 14 } });
  const list = div({ class: 'card' });
  el.appendChild(form); el.appendChild(list);

  const state = { discount: '10', expires: '', label: '', multiUse: false };
  const discountOpts = [];
  for (let d = 5; d <= 100; d += 5) discountOpts.push([String(d), d === 100 ? '100% Free' : d + '%']);

  function drawForm(result) {
    clear(form);
    form.appendChild(div({ class: 'card-title' }, 'Generate Coupon Code'));
    form.appendChild(field('Discount', fieldSelect(state.discount, discountOpts, v => state.discount = v)));
    form.appendChild(field('Expiry Date (optional)', fieldInput(state.expires, v => state.expires = v, '', 'date')));
    form.appendChild(field('Label / Note (optional)', fieldInput(state.label, v => state.label = v, 'Promo')));
    const chk = div({ class: 'choice-item' });
    const inp = inputEl({ type: 'checkbox', checked: state.multiUse });
    inp.addEventListener('change', () => state.multiUse = inp.checked);
    chk.appendChild(inp); chk.appendChild(labelEl({ class: 'choice-label' }, 'Allow multiple uses'));
    form.appendChild(div({ class: 'field' }, chk));
    form.appendChild(button('Generate Coupon Code', 'primary', async () => {
      const code = 'RNA' + Math.random().toString(36).slice(2, 8).toUpperCase();
      await db.ref('rna_coupons/' + code).set({
        code, discount: Number(state.discount), label: state.label || 'Promo', multiUse: state.multiUse,
        used: false, useCount: 0, expires: state.expires || null, created: dateStr(), createdBy: 'admin'
      });
      toast('Coupon generated: ' + code);
      state.label = ''; state.expires = ''; state.multiUse = false;
      drawForm(code);
      loadList();
    }, 'btn-full'));
    if (result) {
      form.appendChild(div({ class: 'u-flex u-center u-between', style: { marginTop: 12, padding: '14px', background: 'var(--surf-0)', borderRadius: 'var(--radius-sm)' } },
        span({ class: 'mono', style: { fontSize: 17, color: 'var(--brand)' } }, result),
        button('Copy', 'dark', () => copyToClipboard(result), 'btn-sm')));
    }
  }

  async function loadList() {
    clear(list);
    list.appendChild(div({ class: 'card-title' }, 'Active Coupons'));
    try {
      const snap = await db.ref('rna_coupons').once();
      const all = Object.values(snap.val() || {}).sort((a, b) => String(b.created || '').localeCompare(String(a.created || '')));
      if (!all.length) { list.appendChild(div({ class: 'empty-state' }, 'No coupons yet.')); return; }
      all.forEach(c => {
        const row = div({ class: 'data-row' });
        row.appendChild(span({ class: 'mono', style: { color: 'var(--brand)', fontWeight: 700 } }, c.code));
        const metaParts = [`${c.discount}% off — ${c.label}`, c.multiUse ? 'Multi-use' : 'Single-use'];
        if (c.used && !c.multiUse) metaParts.push('USED');
        if (c.useCount) metaParts.push(`Used ${c.useCount}x`);
        if (c.expires) metaParts.push('Expires: ' + c.expires);
        row.appendChild(div({ style: { flex: 1 } }, div({}, metaParts[0]), div({ class: 'u-small u-muted' }, metaParts.slice(1).join(' — '))));
        row.appendChild(button('Copy', 'ghost', () => copyToClipboard(c.code), 'btn-sm'));
        row.appendChild(button('Delete', 'danger', async () => {
          if (!confirm('Delete coupon ' + c.code + '?')) return;
          await db.ref('rna_coupons/' + c.code).remove();
          row.remove();
        }, 'btn-sm'));
        list.appendChild(row);
      });
    } catch (e) {
      list.appendChild(div({ class: 'empty-state' }, 'Could not load coupons: ' + e.message));
    }
  }

  drawForm();
  loadList();
}
