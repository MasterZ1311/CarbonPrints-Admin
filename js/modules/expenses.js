/**
 * CarbonPrints Company OS - Expenses & Accounts Module
 * Route: #/expenses (strictly <= 600 lines)
 * Local expense tracking, categorization, monthly cash movement & CSV integration.
 */
window.CP = window.CP || {};

CP.expensesModule = (function () {
  let root = null, unsubscribers = [];
  let currentFilters = { search: '', category: '', mode: '', dateFrom: '', dateTo: '' };

  function getMonthRange(year, monthIdx) {
    const y = year, m = monthIdx;
    const start = `${y}-${String(m + 1).padStart(2, '0')}-01`;
    const lastDay = new Date(y, m + 1, 0).getDate();
    const end = `${y}-${String(m + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    return { start, end };
  }

  function renderView() {
    if (!root) return;
    const now = new Date();
    const curY = now.getFullYear(), curM = now.getMonth();
    const cashMov = CP.expenses ? CP.expenses.getCashMovement(curY, curM) : { paymentsReceived: 0, expensesRecorded: 0, cashMovement: 0 };
    const monthExpenses = CP.expenses ? CP.expenses.getMonthTotal(curY, curM) : 0;
    const categories = CP.expenses ? CP.expenses.getCategories() : [];

    const filterOpts = {
      q: currentFilters.search,
      category: currentFilters.category,
      paymentMode: currentFilters.mode,
      startDate: currentFilters.dateFrom,
      endDate: currentFilters.dateTo
    };
    const expensesList = CP.expenses ? CP.expenses.filter(filterOpts) : [];
    const summary = CP.expenses ? CP.expenses.computeSummary(expensesList) : { totalAmount: 0, count: 0, byCategory: {} };

    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const curMonthName = `${monthNames[curM]} ${curY}`;

    root.innerHTML = `
      <div class="expenses-module">
        <div class="dashboard-header-bar" style="margin-bottom: 20px;">
          <div>
            <h1 class="dashboard-title">💸 Expenses &amp; Accounts</h1>
            <div class="dashboard-subtitle">Operational expenditure, vendor payments &amp; monthly cash movement</div>
          </div>
          <div class="dashboard-quick-actions">
            <button type="button" class="btn btn-primary" id="btn-add-expense">➕ Record Expense</button>
            <button type="button" class="btn btn-secondary" id="btn-export-expenses-csv">📊 Export CSV</button>
            <button type="button" class="btn btn-secondary" id="btn-import-expenses-csv">📥 Import CSV</button>
            <input type="file" id="expenses-csv-file" accept=".csv,text/csv" style="display:none;">
          </div>
        </div>

        <div class="dashboard-kpi-grid">
          <div class="dash-kpi-card">
            <div class="dash-kpi-header"><span class="dash-kpi-label">Cash Received (${curMonthName})</span><span class="dash-kpi-icon">💰</span></div>
            <div class="dash-kpi-val font-mono" style="font-size: 19px; color: var(--brand);">${CP.util.fmtINR(cashMov.paymentsReceived)}</div>
            <div class="dash-kpi-sub">Customer payments collected</div>
          </div>

          <div class="dash-kpi-card">
            <div class="dash-kpi-header"><span class="dash-kpi-label">Expenses (${curMonthName})</span><span class="dash-kpi-icon">🧾</span></div>
            <div class="dash-kpi-val font-mono" style="font-size: 19px; color: var(--danger);">${CP.util.fmtINR(monthExpenses)}</div>
            <div class="dash-kpi-sub">Recorded operating outgoings</div>
          </div>

          <div class="dash-kpi-card">
            <div class="dash-kpi-header"><span class="dash-kpi-label">Cash Movement (${curMonthName})</span><span class="dash-kpi-icon">📈</span></div>
            <div class="dash-kpi-val font-mono" style="font-size: 19px; ${cashMov.cashMovement >= 0 ? 'color: var(--brand);' : 'color: var(--danger);'}">${CP.util.fmtINR(cashMov.cashMovement)}</div>
            <div class="dash-kpi-sub">Receipts - Expenses (not net profit)</div>
          </div>

          <div class="dash-kpi-card">
            <div class="dash-kpi-header"><span class="dash-kpi-label">Filtered Expenses</span><span class="dash-kpi-icon">🔍</span></div>
            <div class="dash-kpi-val font-mono" style="font-size: 19px;">${CP.util.fmtINR(summary.totalAmount)}</div>
            <div class="dash-kpi-sub">${summary.count} expense record(s)</div>
          </div>
        </div>

        <div class="card" style="margin-bottom: 20px;">
          <div style="padding: 12px 16px; display: flex; gap: 10px; flex-wrap: wrap; align-items: center; background: var(--surface-alt); border-radius: var(--radius);">
            <div style="flex: 2; min-width: 180px;">
              <input type="text" id="exp-filter-search" class="form-control" placeholder="Search payee, desc, ref..." value="${CP.util.esc(currentFilters.search)}">
            </div>
            <div style="flex: 1; min-width: 150px;">
              <select id="exp-filter-cat" class="form-control">
                <option value="">All Categories</option>
                ${categories.map(c => `<option value="${CP.util.esc(c)}" ${currentFilters.category === c ? 'selected' : ''}>${CP.util.esc(c)}</option>`).join('')}
              </select>
            </div>
            <div style="flex: 1; min-width: 130px;">
              <select id="exp-filter-mode" class="form-control">
                <option value="">All Modes</option>
                ${['UPI', 'Cash', 'Bank Transfer', 'Card', 'Cheque', 'Other'].map(m => `<option value="${m}" ${currentFilters.mode === m ? 'selected' : ''}>${m}</option>`).join('')}
              </select>
            </div>
            <div style="display: flex; align-items: center; gap: 4px;">
              <label style="font-size: 11px; color: var(--text-muted);">From:</label>
              <input type="date" id="exp-filter-from" class="form-control" style="width: auto; padding: 4px 6px;" value="${currentFilters.dateFrom}">
            </div>
            <div style="display: flex; align-items: center; gap: 4px;">
              <label style="font-size: 11px; color: var(--text-muted);">To:</label>
              <input type="date" id="exp-filter-to" class="form-control" style="width: auto; padding: 4px 6px;" value="${currentFilters.dateTo}">
            </div>
            <button type="button" class="btn btn-sm btn-outline" id="btn-exp-clear-filters">Reset</button>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <div>
              <h3 class="card-title">📋 Expense Records (${expensesList.length})</h3>
              <div class="card-subtitle">Operational expenses and payments made</div>
            </div>
          </div>
          ${renderTable(expensesList)}
        </div>
      </div>
    `;

    bindEvents();
  }

  function renderTable(list) {
    if (!list || list.length === 0) {
      return `<div style="padding: 24px;">${CP.ui.emptyState('💸', 'No Expenses Recorded', 'No expense records found matching current criteria. Click "Record Expense" to add one.')}</div>`;
    }

    const rows = list.map(item => {
      const dateStr = item.date ? item.date.slice(0, 10) : '';
      const orderBadge = item.linkedOrderId ? `<a href="#/orders" class="badge badge-info" style="margin-left: 4px;">Order: ${CP.util.esc(item.linkedOrderId)}</a>` : '';
      const printerBadge = item.linkedPrinterId ? `<span class="badge badge-default" style="margin-left: 4px;">P${String(item.linkedPrinterId).padStart(2, '0')}</span>` : '';
      const receiptBadge = item.receiptRef ? `<span class="badge badge-default" title="Receipt Ref: ${CP.util.esc(item.receiptRef)}" style="margin-left: 4px;">🧾 ${CP.util.esc(item.receiptRef)}</span>` : '';

      return `
        <tr>
          <td style="white-space: nowrap;">${CP.util.esc(dateStr)}</td>
          <td class="font-mono font-bold" style="color: var(--brand); white-space: nowrap;">${CP.util.esc(item.id)}</td>
          <td><span class="badge badge-info">${CP.util.esc(item.category || 'Other')}</span></td>
          <td><strong>${CP.util.esc(item.payee || '—')}</strong></td>
          <td>
            <div>${CP.util.esc(item.description || '—')}</div>
            <div style="font-size: 11px; color: var(--text-muted); display: flex; gap: 4px; flex-wrap: wrap; margin-top: 2px;">
              ${item.notes ? `<span>${CP.util.esc(item.notes)}</span>` : ''}
              ${orderBadge}${printerBadge}${receiptBadge}
            </div>
          </td>
          <td style="white-space: nowrap;">
            <div>${CP.util.esc(item.paymentMode || 'UPI')}</div>
            ${item.referenceNo ? `<div style="font-size: 11px; color: var(--text-muted); font-family: monospace;">${CP.util.esc(item.referenceNo)}</div>` : ''}
          </td>
          <td class="font-mono font-bold" style="text-align: right; white-space: nowrap;">${CP.util.fmtINR(item.amount)}</td>
          <td style="text-align: right; white-space: nowrap;">
            <button type="button" class="btn btn-sm btn-outline btn-edit-exp" data-id="${CP.util.esc(item.id)}" title="Edit Expense">✏️</button>
            <button type="button" class="btn btn-sm btn-danger btn-delete-exp" data-id="${CP.util.esc(item.id)}" title="Delete Expense" style="margin-left: 4px;">🗑️</button>
          </td>
        </tr>
      `;
    }).join('');

    return `
      <div class="table-wrapper">
        <table class="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>ID</th>
              <th>Category</th>
              <th>Payee / Vendor</th>
              <th>Description</th>
              <th>Payment Mode</th>
              <th style="text-align: right;">Amount</th>
              <th style="text-align: right;">Actions</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }

  function bindEvents() {
    if (!root) return;

    root.querySelector('#btn-add-expense')?.addEventListener('click', () => openExpenseModal(null));

    root.querySelector('#btn-export-expenses-csv')?.addEventListener('click', () => {
      const expensesList = CP.expenses ? CP.expenses.filter({
        q: currentFilters.search, category: currentFilters.category,
        paymentMode: currentFilters.mode, startDate: currentFilters.dateFrom, endDate: currentFilters.dateTo
      }) : [];
      CP.expenses.exportCSV(expensesList);
    });

    const fileInput = root.querySelector('#expenses-csv-file');
    root.querySelector('#btn-import-expenses-csv')?.addEventListener('click', () => fileInput?.click());
    fileInput?.addEventListener('change', e => {
      if (e.target.files && e.target.files[0]) handleCSVImport(e.target.files[0]);
    });

    const sIn = root.querySelector('#exp-filter-search');
    sIn?.addEventListener('input', CP.util.debounce(e => {
      currentFilters.search = e.target.value;
      renderView();
    }, 250));

    root.querySelector('#exp-filter-cat')?.addEventListener('change', e => {
      currentFilters.category = e.target.value;
      renderView();
    });

    root.querySelector('#exp-filter-mode')?.addEventListener('change', e => {
      currentFilters.mode = e.target.value;
      renderView();
    });

    root.querySelector('#exp-filter-from')?.addEventListener('change', e => {
      currentFilters.dateFrom = e.target.value;
      renderView();
    });

    root.querySelector('#exp-filter-to')?.addEventListener('change', e => {
      currentFilters.dateTo = e.target.value;
      renderView();
    });

    root.querySelector('#btn-exp-clear-filters')?.addEventListener('click', () => {
      currentFilters = { search: '', category: '', mode: '', dateFrom: '', dateTo: '' };
      renderView();
    });

    root.querySelectorAll('.btn-edit-exp').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const exp = CP.expenses ? CP.expenses.getById(id) : null;
        if (exp) openExpenseModal(exp);
      });
    });

    root.querySelectorAll('.btn-delete-exp').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        const confirmed = await CP.ui.confirm(`Are you sure you want to delete expense record ${id}? This cannot be undone.`);
        if (confirmed && CP.expenses) {
          try {
            CP.expenses.remove(id);
            if (CP.ui && typeof CP.ui.toast === 'function') CP.ui.toast(`Expense ${id} deleted.`, 'success');
            if (CP.bus) CP.bus.emit('expenses:changed', { id, action: 'delete' });
            renderView();
          } catch (err) {
            if (CP.ui && typeof CP.ui.toast === 'function') CP.ui.toast(err.message, 'danger');
          }
        }
      });
    });
  }

  function handleCSVImport(file) {
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const text = ev.target.result;
        const result = CP.expenses.validateAndImportCSV(text, 'merge');
        if (result.success) {
          if (CP.ui && typeof CP.ui.toast === 'function') CP.ui.toast(`Imported ${result.importedCount} expense records (${result.skippedCount} duplicates skipped).`, 'success');
          if (CP.bus) CP.bus.emit('expenses:changed', { action: 'import' });
          renderView();
        }
      } catch (err) {
        if (CP.ui && typeof CP.ui.toast === 'function') CP.ui.toast(`CSV Import Failed: ${err.message}`, 'danger');
        else alert(`CSV Import Failed: ${err.message}`);
      }
    };
    reader.readAsText(file);
  }

  function openExpenseModal(expense) {
    const isEdit = !!expense;
    const categories = CP.expenses ? CP.expenses.getCategories() : [];
    const today = CP.util.todayISO ? CP.util.todayISO() : new Date().toISOString().slice(0, 10);
    const orders = CP.store ? (CP.store.get('cp_orders', []) || []).slice(0, 30) : [];
    const printers = CP.store ? (CP.store.get('cp_printers', []) || []) : [];

    const wrapper = document.createElement('div');
    wrapper.innerHTML = `
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
        <div class="field">
          <label>Date *</label>
          <input type="date" class="input" id="exp-form-date" value="${isEdit ? (expense.date || '').slice(0, 10) : today}">
        </div>
        <div class="field">
          <label>Category *</label>
          <select class="select" id="exp-form-category">
            ${categories.map(c => `<option value="${CP.util.esc(c)}" ${(isEdit && expense.category === c) ? 'selected' : ''}>${CP.util.esc(c)}</option>`).join('')}
          </select>
        </div>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
        <div class="field">
          <label>Payee / Vendor *</label>
          <input type="text" class="input" id="exp-form-payee" placeholder="e.g. Numakers 3D / BESCOM / Shop Landlord" value="${isEdit ? CP.util.esc(expense.payee || '') : ''}">
        </div>
        <div class="field">
          <label>Amount (₹) *</label>
          <input type="number" class="input" id="exp-form-amount" min="0.01" step="0.01" placeholder="0.00" value="${isEdit ? (expense.amount || '') : ''}">
        </div>
      </div>

      <div class="field">
        <label>Description *</label>
        <input type="text" class="input" id="exp-form-desc" placeholder="e.g. 5kg PLA Spools for Farm / Workshop Electricity Bill" value="${isEdit ? CP.util.esc(expense.description || '') : ''}">
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
        <div class="field">
          <label>Payment Mode</label>
          <select class="select" id="exp-form-mode">
            ${['UPI', 'Cash', 'Bank Transfer', 'Card', 'Cheque', 'Other'].map(m => `<option value="${m}" ${(isEdit && expense.paymentMode === m) ? 'selected' : ''}>${m}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label>Txn / Reference #</label>
          <input type="text" class="input" id="exp-form-ref" placeholder="e.g. UPI Ref / Cheque No" value="${isEdit ? CP.util.esc(expense.referenceNo || '') : ''}">
        </div>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
        <div class="field">
          <label>Linked Order (Optional)</label>
          <select class="select" id="exp-form-order">
            <option value="">None / General Workshop</option>
            ${orders.map(o => `<option value="${CP.util.esc(o.id)}" ${(isEdit && expense.linkedOrderId === o.id) ? 'selected' : ''}>${CP.util.esc(o.id)} - ${CP.util.esc(o.customer?.name || '')}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label>Linked Machine (Optional)</label>
          <select class="select" id="exp-form-printer">
            <option value="">None</option>
            ${printers.map(p => `<option value="${p.id}" ${(isEdit && String(expense.linkedPrinterId) === String(p.id)) ? 'selected' : ''}>Printer ${String(p.id).padStart(2, '0')} (${CP.util.esc(p.name || '')})</option>`).join('')}
          </select>
        </div>
      </div>

      <div class="field">
        <label>Receipt Reference (Optional Text Only)</label>
        <input type="text" class="input" id="exp-form-receipt" placeholder="e.g. Invoice # / Bill # / Voucher code" value="${isEdit ? CP.util.esc(expense.receiptRef || '') : ''}">
        <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">Offline safety: Enter bill or voucher number. Image uploads are omitted to protect local browser storage quota.</div>
      </div>

      <div class="field">
        <label>Notes (Optional)</label>
        <textarea class="input" id="exp-form-notes" rows="2" placeholder="Additional details or remarks...">${isEdit ? CP.util.esc(expense.notes || '') : ''}</textarea>
      </div>
    `;

    CP.ui.modal({
      title: isEdit ? `✏️ Edit Expense (${expense.id})` : '➕ Record New Expense',
      bodyNode: wrapper,
      buttons: [
        { label: 'Cancel', kind: 'btn-secondary' },
        {
          label: isEdit ? 'Update Expense' : 'Save Expense',
          kind: 'btn-primary',
          onClick: () => {
            const date = wrapper.querySelector('#exp-form-date')?.value;
            const category = wrapper.querySelector('#exp-form-category')?.value;
            const payee = wrapper.querySelector('#exp-form-payee')?.value.trim();
            const amount = parseFloat(wrapper.querySelector('#exp-form-amount')?.value);
            const description = wrapper.querySelector('#exp-form-desc')?.value.trim();
            const paymentMode = wrapper.querySelector('#exp-form-mode')?.value;
            const referenceNo = wrapper.querySelector('#exp-form-ref')?.value.trim();
            const linkedOrderId = wrapper.querySelector('#exp-form-order')?.value || null;
            const prVal = wrapper.querySelector('#exp-form-printer')?.value;
            const linkedPrinterId = prVal ? Number(prVal) : null;
            const receiptRef = wrapper.querySelector('#exp-form-receipt')?.value.trim() || null;
            const notes = wrapper.querySelector('#exp-form-notes')?.value.trim();

            const expPayload = {
              ...(isEdit ? { id: expense.id, createdAt: expense.createdAt } : {}),
              date, category, payee, amount, description, paymentMode,
              referenceNo, linkedOrderId, linkedPrinterId, receiptRef, notes
            };

            try {
              const saved = CP.expenses.save(expPayload);
              if (CP.ui && typeof CP.ui.toast === 'function') {
                CP.ui.toast(isEdit ? `Expense ${saved.id} updated.` : `Expense ${saved.id} recorded.`, 'success');
              }
              if (CP.bus) CP.bus.emit('expenses:changed', { id: saved.id, action: isEdit ? 'update' : 'create' });
              renderView();
              return true;
            } catch (err) {
              if (CP.ui && typeof CP.ui.toast === 'function') CP.ui.toast(err.message, 'danger');
              else alert(err.message);
              return false;
            }
          }
        }
      ]
    });
  }

  function setupBusListeners() {
    teardownBusListeners();
    if (CP.bus && typeof CP.bus.on === 'function') {
      unsubscribers.push(CP.bus.on('expenses:changed', renderView));
      unsubscribers.push(CP.bus.on('orders:changed', renderView));
      unsubscribers.push(CP.bus.on('store:cp_expenses', renderView));
      unsubscribers.push(CP.bus.on('store:cp_orders', renderView));
    }
  }

  function teardownBusListeners() {
    unsubscribers.forEach(u => { if (typeof u === 'function') u(); });
    unsubscribers = [];
  }

  return {
    id: 'expenses',
    route: '#/expenses',
    title: 'Expenses & Accounts',
    icon: '💸',
    render(rootElement) {
      root = rootElement;
      setupBusListeners();
      renderView();
    },
    destroy() {
      teardownBusListeners();
      root = null;
    }
  };
})();

CP.registerModule(CP.expensesModule);
