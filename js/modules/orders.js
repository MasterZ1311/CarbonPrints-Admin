/**
 * CarbonPrints Company OS - Orders & Billing Module
 * Global namespace: window.CP
 * Full implementation: Order search, filtering, status state machine, payments,
 * invoice/challan printing, and payment proof downscaling.
 */
window.CP = window.CP || {};

CP.orders = (function () {
  const ALLOWED_TRANSITIONS = {
    quote: ['confirmed', 'cancelled'],
    confirmed: ['printing', 'cancelled'],
    printing: ['post', 'cancelled'],
    post: ['qc'],
    qc: ['ready'],
    ready: ['delivered'],
    delivered: [],
    cancelled: []
  };

  function canTransition(from, to) {
    if (!from || !to) return false;
    const allowed = ALLOWED_TRANSITIONS[String(from).toLowerCase()] || [];
    return allowed.includes(String(to).toLowerCase());
  }

  return { canTransition, ALLOWED_TRANSITIONS };
})();

CP.registerModule((function () {
  let root = null;
  let filterState = {
    query: '', status: 'all', payment: 'all', category: 'all',
    dateFrom: '', dateTo: '', sortBy: 'date', sortOrder: 'desc', page: 1, pageSize: 25
  };

  const STATUS_KINDS = { confirmed: 'info', printing: 'primary', post: 'warning', qc: 'warning', ready: 'success', delivered: 'success', cancelled: 'danger' };
  const getStatusBadgeKind = s => STATUS_KINDS[s] || 'default';
  const getPaymentBadgeKind = s => s === 'settled' ? 'success' : s === 'advance' ? 'warning' : 'danger';

  function computeSummary(orders) {
    let outstandingBalance = 0, revenueThisMonth = 0;
    const now = new Date(), curYear = now.getFullYear(), curMonth = now.getMonth();

    (orders || []).forEach(o => {
      if (!o) return;
      const tot = Number(o.pricing?.total) || 0, paid = Number(o.payment?.paidAmount) || 0;
      if (o.status !== 'cancelled' && tot > paid) outstandingBalance += (tot - paid);

      const history = o.payment?.history || [];
      if (history.length > 0) {
        history.forEach(h => {
          if (h && h.ts) {
            const d = new Date(h.ts);
            if (d.getFullYear() === curYear && d.getMonth() === curMonth) revenueThisMonth += (Number(h.amount) || 0);
          }
        });
      } else if (paid > 0 && o.createdAt) {
        const d = new Date(o.createdAt);
        if (d.getFullYear() === curYear && d.getMonth() === curMonth) revenueThisMonth += paid;
      }
    });
    return { totalOrders: (orders || []).length, outstandingBalance, revenueThisMonth };
  }

  function filterAndSortOrders(orders) {
    let result = (orders || []).filter(o => {
      if (!o) return false;
      if (filterState.query) {
        const q = filterState.query.toLowerCase();
        const mId = (o.id || '').toLowerCase().includes(q);
        const mName = (o.customer?.name || '').toLowerCase().includes(q);
        const mPhone = (o.customer?.phone || '').includes(q);
        const mPart = (o.parts || []).some(p => p && (p.name || '').toLowerCase().includes(q));
        if (!mId && !mName && !mPhone && !mPart) return false;
      }
      if (filterState.status !== 'all' && o.status !== filterState.status) return false;
      if (filterState.payment !== 'all' && (o.payment?.status || 'unpaid') !== filterState.payment) return false;
      if (filterState.category !== 'all' && o.customer?.category !== filterState.category) return false;
      if (filterState.dateFrom && o.createdAt && o.createdAt.slice(0, 10) < filterState.dateFrom) return false;
      if (filterState.dateTo && o.createdAt && o.createdAt.slice(0, 10) > filterState.dateTo) return false;
      return true;
    });

    result.sort((a, b) => {
      let valA, valB;
      switch (filterState.sortBy) {
        case 'id': valA = a.id || ''; valB = b.id || ''; break;
        case 'customer': valA = (a.customer?.name || '').toLowerCase(); valB = (b.customer?.name || '').toLowerCase(); break;
        case 'total': valA = Number(a.pricing?.total) || 0; valB = Number(b.pricing?.total) || 0; break;
        case 'status': valA = a.status || ''; valB = b.status || ''; break;
        default: valA = a.createdAt || ''; valB = b.createdAt || ''; break;
      }
      if (valA < valB) return filterState.sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return filterState.sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
    return result;
  }

  function processPaymentImage(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const maxW = 800;
          let w = img.width, h = img.height;
          if (w > maxW) { h = Math.round((h * maxW) / w); w = maxW; }
          const canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          canvas.getContext('2d').drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL('image/jpeg', 0.6));
        };
        img.onerror = reject;
        img.src = e.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function openRecordPaymentModal(order) {
    const tot = Number(order.pricing?.total) || 0, paid = Number(order.payment?.paidAmount) || 0;
    const balance = Math.max(0, tot - paid);
    if (balance <= 0) { CP.ui.toast(`Order ${order.id} is already settled in full.`, 'info'); return; }

    const bodyHtml = `
      <form id="record-payment-form" style="display: flex; flex-direction: column; gap: 10px;">
        <div style="background: var(--surface-alt); padding: 10px; border-radius: var(--radius); font-size: 13px;">
          <div style="display:flex; justify-content:space-between;"><span>Order Total:</span><strong>₹ ${CP.util.fmtINR(tot)}</strong></div>
          <div style="display:flex; justify-content:space-between; margin-top:4px;"><span>Already Paid:</span><strong style="color:var(--success);">₹ ${CP.util.fmtINR(paid)}</strong></div>
          <div style="display:flex; justify-content:space-between; margin-top:4px; border-top:1px dashed var(--border); padding-top:4px;">
            <span>Outstanding Balance:</span><strong style="color:var(--danger);">₹ ${CP.util.fmtINR(balance)}</strong>
          </div>
        </div>
        <div class="field"><label for="pay-amount">Payment Amount (₹) *</label><input type="number" id="pay-amount" class="input" min="1" max="${balance}" step="1" value="${balance}" required></div>
        <div class="field"><label for="pay-mode">Payment Mode *</label><select id="pay-mode" class="select"><option value="UPI" selected>UPI</option><option value="Cash">Cash</option><option value="Bank">Bank Transfer</option></select></div>
        <div class="field" id="field-txn-ref"><label for="pay-txn-ref">Transaction Reference / UTR *</label><input type="text" id="pay-txn-ref" class="input" placeholder="e.g. UPI-REF-12345" required></div>
        <div class="field"><label for="pay-note">Payment Note (Optional)</label><input type="text" id="pay-note" class="input" placeholder="e.g. Advance payment"></div>
        <div class="field"><label for="pay-proof-file">Payment Proof Screenshot (Optional)</label><input type="file" id="pay-proof-file" class="input" accept="image/*" style="padding-top:6px;"><div class="help-text">Auto-downscaled to max 800px.</div></div>
      </form>
    `;

    CP.ui.modal({
      title: `💰 Record Payment - ${order.id}`,
      bodyHTML: bodyHtml,
      buttons: [
        { label: 'Cancel', kind: 'btn-secondary' },
        {
          label: 'Save Payment',
          kind: 'btn-primary',
          onClick: async () => {
            const form = document.getElementById('record-payment-form');
            if (!form) return true;
            const amount = Number(form.querySelector('#pay-amount')?.value);
            const mode = form.querySelector('#pay-mode')?.value || 'UPI';
            const txnRef = (form.querySelector('#pay-txn-ref')?.value || '').trim();
            const note = (form.querySelector('#pay-note')?.value || '').trim();
            const file = form.querySelector('#pay-proof-file')?.files?.[0];

            if (isNaN(amount) || amount <= 0) { CP.ui.toast("Please enter a valid payment amount.", "danger"); return false; }
            if (amount > balance) { CP.ui.toast(`Payment amount (₹ ${CP.util.fmtINR(amount)}) exceeds outstanding balance (₹ ${CP.util.fmtINR(balance)}).`, "danger"); return false; }
            if (mode === 'UPI' && !txnRef) { CP.ui.toast("Transaction reference ID is required for UPI payments.", "danger"); return false; }

            let proofDataUrl = null;
            if (file) {
              try { proofDataUrl = await processPaymentImage(file); } catch (e) { console.warn("Proof image error:", e); }
            }

            const historyEntry = { id: CP.util.uid('pay'), ts: new Date().toISOString(), amount, mode, txnRef, note, proofDataUrl };
            const orders = CP.store.get('cp_orders', []);
            const target = orders.find(o => o && o.id === order.id);
            if (!target) return true;

            target.payment = target.payment || { status: 'unpaid', paidAmount: 0, history: [] };
            target.payment.history = target.payment.history || [];
            target.payment.history.push(historyEntry);

            const newPaid = target.payment.history.reduce((sum, h) => sum + (Number(h.amount) || 0), 0);
            target.payment.paidAmount = CP.util.round2(newPaid);
            const targetTot = Number(target.pricing?.total) || 0;
            target.payment.status = (target.payment.paidAmount >= targetTot && targetTot > 0) ? 'settled' : (target.payment.paidAmount > 0 ? 'advance' : 'unpaid');
            target.updatedAt = new Date().toISOString();

            try {
              CP.store.set('cp_orders', orders);
            } catch (quotaErr) {
              if (historyEntry.proofDataUrl) {
                delete historyEntry.proofDataUrl;
                CP.store.set('cp_orders', orders);
                CP.ui.toast("Proof image could not be stored due to storage quota, but payment was recorded.", "warning");
              } else { throw quotaErr; }
            }

            CP.ui.toast(`Payment of ₹ ${CP.util.fmtINR(amount)} recorded successfully!`, 'success');
            updateTable();
            return true;
          }
        }
      ]
    });

    const modeSelect = document.getElementById('pay-mode');
    if (modeSelect) {
      modeSelect.addEventListener('change', () => {
        const txnInput = document.getElementById('pay-txn-ref');
        if (txnInput) {
          txnInput.required = modeSelect.value !== 'Cash';
          txnInput.previousElementSibling.textContent = modeSelect.value === 'Cash' ? 'Receipt / Ref (Optional)' : 'Transaction Reference / UTR *';
        }
      });
    }
  }

  function openPaymentHistoryModal(order) {
    const history = order.payment?.history || [];
    const tot = Number(order.pricing?.total) || 0, paid = Number(order.payment?.paidAmount) || 0;
    const tableRows = history.length === 0
      ? `<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 16px;">No payments recorded yet for this order.</td></tr>`
      : history.map((h, i) => `
        <tr data-history-id="${CP.util.esc(h.id)}">
          <td style="text-align: center;">${i + 1}</td>
          <td>${CP.util.fmtDateTime(h.ts)}</td>
          <td style="font-weight: 600; color: var(--success);">₹ ${CP.util.fmtINR(h.amount)}</td>
          <td><span class="badge badge-default">${CP.util.esc(h.mode || 'UPI')}</span></td>
          <td><code>${CP.util.esc(h.txnRef || '-')}</code></td>
          <td style="white-space: nowrap;">
            ${h.proofDataUrl ? `<button type="button" class="btn btn-ghost btn-sm btn-view-proof" data-id="${CP.util.esc(h.id)}">View</button><button type="button" class="btn btn-ghost btn-sm btn-del-proof" data-id="${CP.util.esc(h.id)}">🗑️</button>` : '<span style="color:var(--text-muted);font-size:11px;">None</span>'}
          </td>
        </tr>
      `).join('');

    CP.ui.modal({
      title: `💳 Payment History - ${order.id}`,
      bodyHTML: `<div><div style="display:flex; justify-content:space-between; margin-bottom:12px; font-size:13px;"><div>Total: <strong>₹ ${CP.util.fmtINR(tot)}</strong> | Paid: <strong style="color:var(--success);">₹ ${CP.util.fmtINR(paid)}</strong></div><div>Status: ${CP.ui.badge((order.payment?.status || 'unpaid').toUpperCase(), getPaymentBadgeKind(order.payment?.status))}</div></div><div class="table-wrapper"><table class="table"><thead><tr><th>#</th><th>Date &amp; Time</th><th>Amount</th><th>Mode</th><th>Reference</th><th>Proof</th></tr></thead><tbody>${tableRows}</tbody></table></div></div>`,
      buttons: [{ label: 'Close', kind: 'btn-secondary' }]
    });

    const modalContainer = document.getElementById('modal-container');
    if (modalContainer) {
      modalContainer.addEventListener('click', (e) => {
        const viewBtn = e.target.closest('.btn-view-proof');
        if (viewBtn) {
          const entry = history.find(h => h && h.id === viewBtn.getAttribute('data-id'));
          if (entry && entry.proofDataUrl) {
            CP.ui.modal({
              title: `📸 Proof - ${entry.txnRef || entry.id}`,
              bodyHTML: `<div style="text-align:center;"><img src="${entry.proofDataUrl}" alt="Proof" style="max-width:100%; max-height:70vh; border-radius:var(--radius);"></div>`,
              buttons: [{ label: 'Close', kind: 'btn-secondary' }]
            });
          }
        }
        const delBtn = e.target.closest('.btn-del-proof');
        if (delBtn) {
          const orders = CP.store.get('cp_orders', []);
          const target = orders.find(o => o && o.id === order.id);
          const hEntry = target?.payment?.history?.find(h => h && h.id === delBtn.getAttribute('data-id'));
          if (hEntry) {
            delete hEntry.proofDataUrl;
            CP.store.set('cp_orders', orders);
            CP.ui.toast("Proof image removed.", "info");
            updateTable();
          }
        }
      });
    }
  }

  function openChangeStatusModal(order) {
    const curStatus = order.status || 'quote';
    const allowed = CP.orders.ALLOWED_TRANSITIONS[curStatus] || [];
    if (allowed.length === 0) { CP.ui.toast(`Order is in '${curStatus.toUpperCase()}'. No further transitions allowed.`, 'info'); return; }

    const options = allowed.map(s => `<option value="${s}">${s.toUpperCase()}</option>`).join('');
    CP.ui.modal({
      title: `🔄 Update Status - ${order.id}`,
      bodyHTML: `<div style="display:flex; flex-direction:column; gap:12px;"><div>Current: ${CP.ui.badge(curStatus.toUpperCase(), getStatusBadgeKind(curStatus))}</div><div class="field"><label for="new-order-status">Select Next Status *</label><select id="new-order-status" class="select">${options}</select></div></div>`,
      buttons: [
        { label: 'Cancel', kind: 'btn-secondary' },
        {
          label: 'Update Status',
          kind: 'btn-primary',
          onClick: () => {
            const targetStatus = document.getElementById('new-order-status')?.value;
            if (!targetStatus) return false;
            if (!CP.orders.canTransition(curStatus, targetStatus)) { CP.ui.toast(`Transition from ${curStatus} to ${targetStatus} is not allowed!`, 'warning'); return false; }
            const orders = CP.store.get('cp_orders', []);
            const target = orders.find(o => o && o.id === order.id);
            if (target) {
              target.status = targetStatus;
              target.updatedAt = new Date().toISOString();
              CP.store.set('cp_orders', orders);
              CP.ui.toast(`Order ${order.id} moved to ${targetStatus.toUpperCase()}!`, 'success');
              updateTable();
            }
            return true;
          }
        }
      ]
    });
  }

  function updateTable() {
    if (!root) return;
    const orders = CP.store.get('cp_orders', []) || [];
    const summary = computeSummary(orders);
    const filteredOrders = filterAndSortOrders(orders);
    const totalPages = Math.max(1, Math.ceil(filteredOrders.length / filterState.pageSize));
    if (filterState.page > totalPages) filterState.page = totalPages;
    const startIdx = (filterState.page - 1) * filterState.pageSize;
    const paginated = filteredOrders.slice(startIdx, startIdx + filterState.pageSize);

    // Update KPI summary cards
    const kpiTot = root.querySelector('#orders-kpi-total');
    if (kpiTot) kpiTot.textContent = String(summary.totalOrders);
    const kpiBal = root.querySelector('#orders-kpi-balance');
    if (kpiBal) kpiBal.textContent = `₹ ${CP.util.fmtINR(summary.outstandingBalance)}`;
    const kpiRev = root.querySelector('#orders-kpi-revenue');
    if (kpiRev) kpiRev.textContent = `₹ ${CP.util.fmtINR(summary.revenueThisMonth)}`;

    // Update showing count and pagination
    const countEl = root.querySelector('#orders-showing-count');
    if (countEl) {
      countEl.textContent = `Showing ${filteredOrders.length === 0 ? 0 : startIdx + 1}-${Math.min(filteredOrders.length, startIdx + filterState.pageSize)} of ${filteredOrders.length}`;
    }
    const pageInfo = root.querySelector('#orders-page-info');
    if (pageInfo) {
      pageInfo.innerHTML = `Page <strong>${filterState.page}</strong> of <strong>${totalPages}</strong>`;
    }
    const prevBtn = root.querySelector('#btn-prev-page');
    if (prevBtn) prevBtn.disabled = filterState.page <= 1;
    const nextBtn = root.querySelector('#btn-next-page');
    if (nextBtn) nextBtn.disabled = filterState.page >= totalPages;

    const tbody = root.querySelector('#orders-tbody');
    if (!tbody) return;

    if (paginated.length === 0) {
      tbody.innerHTML = `<tr><td colspan="11" style="text-align: center; padding: 32px 16px; color: var(--text-muted);">${CP.ui.emptyState('📦', 'No Orders Found', 'Try adjusting your search query, status filters, or date range.')}</td></tr>`;
      return;
    }

    tbody.innerHTML = paginated.map(o => {
      const tot = Number(o.pricing?.total) || 0, paid = Number(o.payment?.paidAmount) || 0, bal = Math.max(0, tot - paid);
      return `
        <tr data-order-id="${CP.util.esc(o.id)}">
          <td><strong style="color:var(--brand); cursor:pointer;" class="order-id-link">${CP.util.esc(o.id)}</strong></td>
          <td style="white-space:nowrap;">${CP.util.fmtDate(o.createdAt)}</td>
          <td><div style="font-weight:600;">${CP.util.esc(o.customer?.name || 'Unknown')}</div><div style="font-size:11px; color:var(--text-muted);">${CP.util.esc(o.customer?.phone || '')}</div></td>
          <td><span class="badge badge-default">${CP.util.esc(o.customer?.category || '-')}</span></td>
          <td style="text-align:center;">${(o.parts || []).length}</td>
          <td style="font-weight:600; text-align:right;">₹ ${CP.util.fmtINR(tot)}</td>
          <td style="text-align:right; color:var(--success); cursor:pointer;" class="btn-pay-history">₹ ${CP.util.fmtINR(paid)}</td>
          <td style="text-align:right; font-weight:600; color:${bal > 0 ? 'var(--danger)' : 'var(--text-muted)'};">₹ ${CP.util.fmtINR(bal)}</td>
          <td>${CP.ui.badge((o.status || 'quote').toUpperCase(), getStatusBadgeKind(o.status))}</td>
          <td style="cursor:pointer;" class="btn-pay-history">${CP.ui.badge((o.payment?.status || 'unpaid').toUpperCase(), getPaymentBadgeKind(o.payment?.status))}</td>
          <td style="white-space:nowrap; text-align:right;">
            <div style="display:inline-flex; gap:4px;">
              <button type="button" class="btn btn-ghost btn-sm btn-edit-order" title="Edit">✏️</button>
              <button type="button" class="btn btn-ghost btn-sm btn-status-order" title="Status">🔄</button>
              <button type="button" class="btn btn-ghost btn-sm btn-pay-order" title="Pay">💰</button>
              <button type="button" class="btn btn-ghost btn-sm btn-inv-order" title="Invoice">📄</button>
              <button type="button" class="btn btn-ghost btn-sm btn-dc-order" title="Challan">🚚</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  function renderView() {
    if (!root) return;
    const orders = CP.store.get('cp_orders', []) || [];
    const summary = computeSummary(orders);

    const categories = ['College Project', 'Hardware Startup R&D', 'Automotive Garage', 'Hobbyist'];
    const catOptions = `<option value="all">All Categories</option>` + categories.map(c => `<option value="${CP.util.esc(c)}" ${filterState.category === c ? 'selected' : ''}>${CP.util.esc(c)}</option>`).join('');
    const statusOptions = ['all', 'quote', 'confirmed', 'printing', 'post', 'qc', 'ready', 'delivered', 'cancelled'].map(s => `<option value="${s}" ${filterState.status === s ? 'selected' : ''}>${s === 'all' ? 'All Statuses' : s.toUpperCase()}</option>`).join('');
    const paymentOptions = ['all', 'unpaid', 'advance', 'settled'].map(p => `<option value="${p}" ${filterState.payment === p ? 'selected' : ''}>${p === 'all' ? 'All Payments' : p.toUpperCase()}</option>`).join('');

    root.innerHTML = `
      <div class="grid grid-cols-3" style="margin-bottom: 20px;">
        <div class="card" style="margin-bottom:0; padding:16px;"><div style="font-size:12px; color:var(--text-muted); font-weight:600;">TOTAL ORDERS</div><div id="orders-kpi-total" style="font-size:24px; font-weight:800; margin-top:4px;">${summary.totalOrders}</div></div>
        <div class="card" style="margin-bottom:0; padding:16px;"><div style="font-size:12px; color:var(--text-muted); font-weight:600;">OUTSTANDING BALANCE</div><div id="orders-kpi-balance" style="font-size:24px; font-weight:800; color:var(--danger); margin-top:4px;">₹ ${CP.util.fmtINR(summary.outstandingBalance)}</div></div>
        <div class="card" style="margin-bottom:0; padding:16px;"><div style="font-size:12px; color:var(--text-muted); font-weight:600;">REVENUE THIS MONTH</div><div id="orders-kpi-revenue" style="font-size:24px; font-weight:800; color:var(--success); margin-top:4px;">₹ ${CP.util.fmtINR(summary.revenueThisMonth)}</div></div>
      </div>
      <div class="card" style="padding:16px; margin-bottom:20px;">
        <div class="grid grid-cols-4" style="gap:12px;">
          <div class="field" style="margin-bottom:0;"><label for="filter-query">Search</label><input type="text" id="filter-query" class="input" placeholder="ID, name, phone, part..." value="${CP.util.esc(filterState.query)}"></div>
          <div class="field" style="margin-bottom:0;"><label for="filter-status">Status</label><select id="filter-status" class="select">${statusOptions}</select></div>
          <div class="field" style="margin-bottom:0;"><label for="filter-payment">Payment</label><select id="filter-payment" class="select">${paymentOptions}</select></div>
          <div class="field" style="margin-bottom:0;"><label for="filter-category">Category</label><select id="filter-category" class="select">${catOptions}</select></div>
        </div>
        <div style="display:flex; gap:12px; margin-top:12px; align-items:flex-end; flex-wrap:wrap;">
          <div class="field" style="margin-bottom:0; width:150px;"><label for="filter-date-from">From</label><input type="date" id="filter-date-from" class="input" value="${filterState.dateFrom}"></div>
          <div class="field" style="margin-bottom:0; width:150px;"><label for="filter-date-to">To</label><input type="date" id="filter-date-to" class="input" value="${filterState.dateTo}"></div>
          <button type="button" id="btn-reset-filters" class="btn btn-secondary btn-sm" style="height:38px;">Reset</button>
          <div id="orders-showing-count" style="margin-left:auto; color:var(--text-muted); font-size:13px; align-self:center;"></div>
        </div>
      </div>
      <div class="card" style="padding:0; overflow:hidden;">
        <div class="table-wrapper">
          <table class="table" style="min-width:950px;">
            <thead>
              <tr>
                <th style="cursor:pointer;" class="th-sort" data-sort="id">Order ID ${filterState.sortBy === 'id' ? (filterState.sortOrder === 'asc' ? '▲' : '▼') : ''}</th>
                <th style="cursor:pointer;" class="th-sort" data-sort="date">Date ${filterState.sortBy === 'date' ? (filterState.sortOrder === 'asc' ? '▲' : '▼') : ''}</th>
                <th style="cursor:pointer;" class="th-sort" data-sort="customer">Customer ${filterState.sortBy === 'customer' ? (filterState.sortOrder === 'asc' ? '▲' : '▼') : ''}</th>
                <th>Category</th><th style="text-align:center;">Parts</th>
                <th style="text-align:right; cursor:pointer;" class="th-sort" data-sort="total">Total ${filterState.sortBy === 'total' ? (filterState.sortOrder === 'asc' ? '▲' : '▼') : ''}</th>
                <th style="text-align:right;">Paid</th><th style="text-align:right;">Balance</th>
                <th style="cursor:pointer;" class="th-sort" data-sort="status">Status ${filterState.sortBy === 'status' ? (filterState.sortOrder === 'asc' ? '▲' : '▼') : ''}</th>
                <th>Payment</th><th style="text-align:right;">Actions</th>
              </tr>
            </thead>
            <tbody id="orders-tbody"></tbody>
          </table>
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center; padding:12px 16px; border-top:1px solid var(--border); background:var(--surface-alt);">
          <div id="orders-page-info" style="font-size:13px; color:var(--text-muted);"></div>
          <div style="display:flex; gap:8px;">
            <button type="button" id="btn-prev-page" class="btn btn-secondary btn-sm">◀ Prev</button>
            <button type="button" id="btn-next-page" class="btn btn-secondary btn-sm">Next ▶</button>
          </div>
        </div>
      </div>
    `;

    bindEvents();
    updateTable();
  }

  function bindEvents() {
    root.querySelector('#filter-query')?.addEventListener('input', CP.util.debounce((e) => {
      filterState.query = e.target.value.trim();
      filterState.page = 1;
      updateTable();
    }, 200));

    root.querySelector('#filter-status')?.addEventListener('change', (e) => {
      filterState.status = e.target.value; filterState.page = 1; updateTable();
    });
    root.querySelector('#filter-payment')?.addEventListener('change', (e) => {
      filterState.payment = e.target.value; filterState.page = 1; updateTable();
    });
    root.querySelector('#filter-category')?.addEventListener('change', (e) => {
      filterState.category = e.target.value; filterState.page = 1; updateTable();
    });
    root.querySelector('#filter-date-from')?.addEventListener('change', (e) => {
      filterState.dateFrom = e.target.value; filterState.page = 1; updateTable();
    });
    root.querySelector('#filter-date-to')?.addEventListener('change', (e) => {
      filterState.dateTo = e.target.value; filterState.page = 1; updateTable();
    });

    root.querySelector('#btn-reset-filters')?.addEventListener('click', () => {
      filterState.query = ''; filterState.status = 'all'; filterState.payment = 'all'; filterState.category = 'all';
      filterState.dateFrom = ''; filterState.dateTo = ''; filterState.page = 1;
      const qInput = root.querySelector('#filter-query'); if (qInput) qInput.value = '';
      const sSelect = root.querySelector('#filter-status'); if (sSelect) sSelect.value = 'all';
      const pSelect = root.querySelector('#filter-payment'); if (pSelect) pSelect.value = 'all';
      const cSelect = root.querySelector('#filter-category'); if (cSelect) cSelect.value = 'all';
      const fInput = root.querySelector('#filter-date-from'); if (fInput) fInput.value = '';
      const tInput = root.querySelector('#filter-date-to'); if (tInput) tInput.value = '';
      updateTable();
    });

    root.querySelectorAll('.th-sort').forEach(th => {
      th.addEventListener('click', () => {
        const s = th.getAttribute('data-sort');
        if (filterState.sortBy === s) { filterState.sortOrder = filterState.sortOrder === 'asc' ? 'desc' : 'asc'; }
        else { filterState.sortBy = s; filterState.sortOrder = 'asc'; }
        renderView();
      });
    });

    root.querySelector('#btn-prev-page')?.addEventListener('click', () => {
      if (filterState.page > 1) { filterState.page--; updateTable(); }
    });
    root.querySelector('#btn-next-page')?.addEventListener('click', () => {
      filterState.page++; updateTable();
    });

    root.addEventListener('click', (e) => {
      const row = e.target.closest('tr[data-order-id]');
      if (!row) return;
      const order = (CP.store.get('cp_orders', []) || []).find(o => o && o.id === row.getAttribute('data-order-id'));
      if (!order) return;

      if (e.target.closest('.btn-edit-order') || e.target.closest('.order-id-link')) { CP.router.navigate(`#/order-desk/${order.id}`); return; }
      if (e.target.closest('.btn-status-order')) { openChangeStatusModal(order); return; }
      if (e.target.closest('.btn-pay-order')) { openRecordPaymentModal(order); return; }
      if (e.target.closest('.btn-pay-history')) { openPaymentHistoryModal(order); return; }
      if (e.target.closest('.btn-inv-order')) { CP.docs.previewInvoice(order.id); return; }
      if (e.target.closest('.btn-dc-order')) { CP.docs.previewChallan(order.id); return; }
    });
  }

  function render(rootElement) {
    root = rootElement;
    renderView();
  }

  function destroy() { root = null; }

  return { id: 'orders', route: '#/orders', title: 'Orders & Billing', icon: '📦', render, destroy };
})());
