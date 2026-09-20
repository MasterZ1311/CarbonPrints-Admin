/**
 * CarbonPrints Company OS - Order Desk Module
 * Global namespace: window.CP
 * Full implementation: Quoting, live pricing, slicing estimates, WhatsApp dispatch, draft autosave.
 */
window.CP = window.CP || {};

CP.registerModule((function () {
  let root = null;
  let activeOrder = null;
  let isEditingExisting = false;
  let debounceSaveTimer = null;
  let manualDiscountOverride = false;

  function getSettings() {
    return CP.store.get('cp_settings', CP.defaults ? CP.defaults.settings : {});
  }

  function createBlankPart() {
    return {
      id: CP.util.uid('pt'),
      name: '',
      material: 'PLA',
      layer: '0.20',
      infillPct: 20,
      weightG: '',
      qty: 1,
      printHoursOverride: '',
      status: 'pending',
      assignedPrinterId: null,
      spoolId: null,
      notes: ''
    };
  }

  function createBlankOrder() {
    const settings = getSettings();
    const catDiscounts = settings.pricing?.categoryDiscountPct || {};
    const defaultCat = 'College Project';
    const discPct = catDiscounts[defaultCat] || 0;

    return {
      id: null,
      createdAt: null,
      updatedAt: null,
      customer: { name: '', phone: '', email: '', category: defaultCat },
      dueDate: '',
      notes: '',
      parts: [createBlankPart()],
      pricing: { subtotal: 0, discountPct: discPct, discountAmt: 0, gstPct: 18, gstAmt: 0, total: 0, advance: 0 },
      payment: { status: 'unpaid', paidAmount: 0, history: [] },
      status: 'quote',
      invoiceNo: null,
      challanNo: null
    };
  }

  function readFormData() {
    if (!root) return activeOrder;
    const name = (root.querySelector('#cust-name')?.value || '').trim();
    const phone = (root.querySelector('#cust-phone')?.value || '').trim();
    const email = (root.querySelector('#cust-email')?.value || '').trim();
    const category = root.querySelector('#cust-category')?.value || 'College Project';
    const dueDate = root.querySelector('#cust-due-date')?.value || '';
    const notes = (root.querySelector('#cust-notes')?.value || '').trim();
    const discountPct = Number(root.querySelector('#sum-discount-pct')?.value) || 0;
    const advance = Number(root.querySelector('#sum-advance')?.value) || 0;

    const parts = [];
    const rows = root.querySelectorAll('.part-row');
    rows.forEach(row => {
      const partId = row.getAttribute('data-part-id');
      const pName = (row.querySelector('.part-name')?.value || '').trim();
      const pMaterial = row.querySelector('.part-material')?.value || 'PLA';
      const pLayer = row.querySelector('.part-layer')?.value || '0.20';
      const pInfill = Number(row.querySelector('.part-infill')?.value) || 0;
      const pWeight = Number(row.querySelector('.part-weight')?.value) || 0;
      const pQty = Number(row.querySelector('.part-qty')?.value) || 1;
      const pOverrideRaw = row.querySelector('.part-override')?.value;
      const pOverride = (pOverrideRaw !== '' && pOverrideRaw !== undefined && !isNaN(Number(pOverrideRaw)))
        ? Number(pOverrideRaw) : null;

      const existingPart = (activeOrder.parts || []).find(p => p.id === partId) || {};
      parts.push({
        id: partId || CP.util.uid('pt'),
        name: pName,
        material: pMaterial,
        layer: pLayer,
        infillPct: pInfill,
        weightG: pWeight,
        qty: pQty,
        printHoursOverride: pOverride,
        status: existingPart.status || 'pending',
        assignedPrinterId: existingPart.assignedPrinterId || null,
        spoolId: existingPart.spoolId || null,
        notes: existingPart.notes || ''
      });
    });

    activeOrder.customer = { name, phone, email, category };
    activeOrder.dueDate = dueDate;
    activeOrder.notes = notes;
    activeOrder.parts = parts;
    activeOrder.pricing.discountPct = discountPct;
    activeOrder.pricing.advance = advance;
    return activeOrder;
  }

  function updateSummary() {
    if (!root) return;
    const settings = getSettings();
    const orderData = readFormData();
    const calc = CP.pricing.calcOrder(orderData, settings);

    const subtotalEl = root.querySelector('#sum-subtotal');
    if (subtotalEl) subtotalEl.textContent = `₹ ${CP.util.fmtNum(calc.subtotal.toFixed(2))}`;
    const discAmtEl = root.querySelector('#sum-discount-amt');
    if (discAmtEl) discAmtEl.textContent = `-₹ ${CP.util.fmtNum(calc.discountAmt.toFixed(2))}`;
    const taxableEl = root.querySelector('#sum-taxable');
    if (taxableEl) taxableEl.textContent = `₹ ${CP.util.fmtNum(calc.taxable.toFixed(2))}`;

    const gstSection = root.querySelector('#sum-gst-section');
    if (gstSection) {
      if (!settings.pricing?.gstEnabled) {
        gstSection.style.display = 'none';
      } else {
        gstSection.style.display = 'block';
        if (settings.pricing.interState) {
          gstSection.innerHTML = `<div class="summary-row"><span style="color: var(--text-muted);">IGST (${calc.gstPct}%):</span><span>₹ ${CP.util.fmtNum(calc.igst.toFixed(2))}</span></div>`;
        } else {
          const half = (calc.gstPct / 2).toFixed(1);
          gstSection.innerHTML = `<div class="summary-row"><span style="color: var(--text-muted);">CGST (${half}%):</span><span>₹ ${CP.util.fmtNum(calc.cgst.toFixed(2))}</span></div><div class="summary-row"><span style="color: var(--text-muted);">SGST (${half}%):</span><span>₹ ${CP.util.fmtNum(calc.sgst.toFixed(2))}</span></div>`;
        }
      }
    }

    const totalEl = root.querySelector('#sum-total');
    if (totalEl) totalEl.textContent = `₹ ${CP.util.fmtNum(calc.total.toFixed(2))}`;
    const balanceEl = root.querySelector('#sum-balance');
    if (balanceEl) balanceEl.textContent = `₹ ${CP.util.fmtNum(calc.balance.toFixed(2))}`;
    const hoursEl = root.querySelector('#sum-print-hours');
    if (hoursEl) hoursEl.textContent = `${calc.totalPrintHours} hrs`;
    const longestEl = root.querySelector('#sum-longest-part');
    if (longestEl) longestEl.textContent = `${calc.longestPartHours} hrs`;
    const turnaroundEl = root.querySelector('#sum-turnaround');
    if (turnaroundEl) turnaroundEl.textContent = `${calc.turnaroundDays} day(s)`;
    const estDeliveryEl = root.querySelector('#sum-est-delivery');
    if (estDeliveryEl) {
      estDeliveryEl.textContent = CP.util.fmtDate(CP.util.addDays(CP.util.todayISO(), calc.turnaroundDays));
    }

    if (!isEditingExisting) {
      clearTimeout(debounceSaveTimer);
      debounceSaveTimer = setTimeout(() => { CP.store.set('cp_draft_order', orderData); }, 400);
    }
  }

  function renderPartRow(part, index, totalParts, settings, isOrderLocked) {
    const materials = settings.materials || ['PLA', 'ABS', 'TPU'];
    const rowPrice = CP.pricing.partPrice(part, settings);
    const isPartLocked = isOrderLocked && (part.status === 'printing' || part.status === 'done');
    const matOptions = materials.map(m => `<option value="${CP.util.esc(m)}" ${part.material === m ? 'selected' : ''}>${CP.util.esc(m)}</option>`).join('');

    return `
      <tr class="part-row" data-part-id="${CP.util.esc(part.id)}">
        <td style="text-align: center; color: var(--text-muted); font-weight: 500;">${index + 1}</td>
        <td><input type="text" class="input parts-table-input part-name" placeholder="Part name" value="${CP.util.esc(part.name)}" ${isPartLocked ? 'disabled' : ''}></td>
        <td><select class="select parts-table-input part-material" ${isPartLocked ? 'disabled' : ''}>${matOptions}</select></td>
        <td><select class="select parts-table-input part-layer" ${isPartLocked ? 'disabled' : ''}><option value="0.28" ${String(part.layer) === '0.28' ? 'selected' : ''}>0.28 mm</option><option value="0.20" ${String(part.layer) === '0.20' || !part.layer ? 'selected' : ''}>0.20 mm</option><option value="0.12" ${String(part.layer) === '0.12' ? 'selected' : ''}>0.12 mm</option></select></td>
        <td><input type="number" min="0" max="100" step="5" class="input parts-table-input part-infill" value="${part.infillPct !== undefined ? part.infillPct : 20}" ${isPartLocked ? 'disabled' : ''}></td>
        <td><input type="number" min="0" step="0.5" class="input parts-table-input part-weight" placeholder="0" value="${part.weightG !== undefined ? part.weightG : ''}" ${isPartLocked ? 'disabled' : ''}></td>
        <td><input type="number" min="1" step="1" class="input parts-table-input part-qty" value="${part.qty || 1}" ${isPartLocked ? 'disabled' : ''}></td>
        <td><input type="number" min="0" step="0.1" class="input parts-table-input part-override" placeholder="Auto" value="${part.printHoursOverride || ''}"></td>
        <td class="row-price-cell" style="font-weight: 600; text-align: right; white-space: nowrap;">₹ ${CP.util.fmtNum(rowPrice.toFixed(2))}</td>
        <td style="text-align: center; white-space: nowrap;">
          <button type="button" class="btn btn-ghost btn-sm btn-dup-part" title="Duplicate part">📑</button>
          <button type="button" class="btn btn-ghost btn-sm btn-del-part" title="Remove part" ${totalParts <= 1 || isPartLocked ? 'disabled' : ''}>🗑️</button>
        </td>
      </tr>
    `;
  }

  function validateOrder(orderData) {
    const errors = [];
    if (!orderData.customer.name) errors.push('Customer Name is required.');
    if (!orderData.customer.phone) {
      errors.push('Customer Phone is required.');
    } else if (!CP.wa.isValidIndianMobile(orderData.customer.phone)) {
      errors.push('Please enter a valid 10-digit Indian mobile number.');
    }
    if (!orderData.parts || orderData.parts.length === 0) {
      errors.push('At least one part is required.');
    } else {
      orderData.parts.forEach((p, idx) => {
        if (!p.name) errors.push(`Part #${idx + 1}: Name is required.`);
        if (Number(p.weightG) <= 0) errors.push(`Part #${idx + 1}: Weight must be greater than 0g.`);
        if (Number(p.qty) <= 0) errors.push(`Part #${idx + 1}: Qty must be at least 1.`);
      });
    }
    return errors;
  }

  function saveOrder(statusToSet) {
    const settings = getSettings();
    const orderData = readFormData();
    const errors = validateOrder(orderData);
    if (errors.length > 0) { CP.ui.toast(errors[0], 'danger'); return; }

    const calc = CP.pricing.calcOrder(orderData, settings);
    const orderId = activeOrder.id || CP.util.nextId('order');
    const nowISO = new Date().toISOString();

    const finalizedOrder = {
      id: orderId,
      createdAt: activeOrder.createdAt || nowISO,
      updatedAt: nowISO,
      customer: Object.assign({}, orderData.customer),
      dueDate: orderData.dueDate || null,
      notes: orderData.notes || '',
      parts: orderData.parts.map(p => ({
        id: p.id || CP.util.uid('pt'),
        name: p.name,
        material: p.material,
        layer: p.layer,
        infillPct: Number(p.infillPct) || 20,
        weightG: Number(p.weightG) || 0,
        qty: Number(p.qty) || 1,
        printHoursOverride: (p.printHoursOverride !== null && p.printHoursOverride !== '') ? Number(p.printHoursOverride) : null,
        status: p.status || 'pending',
        assignedPrinterId: p.assignedPrinterId || null,
        spoolId: p.spoolId || null,
        notes: p.notes || ''
      })),
      pricing: {
        subtotal: calc.subtotal,
        discountPct: calc.discountPct,
        discountAmt: calc.discountAmt,
        gstPct: calc.gstPct,
        gstAmt: calc.gstAmt,
        total: calc.total,
        advance: calc.advance
      },
      payment: activeOrder.payment || { status: 'unpaid', paidAmount: 0, history: [] },
      status: statusToSet,
      invoiceNo: activeOrder.invoiceNo || null,
      challanNo: activeOrder.challanNo || null
    };

    const orders = CP.store.get('cp_orders', []);
    const existingIdx = orders.findIndex(o => o.id === orderId);
    if (existingIdx >= 0) { orders[existingIdx] = finalizedOrder; }
    else { orders.push(finalizedOrder); }

    CP.store.set('cp_orders', orders);
    CP.store.remove('cp_draft_order');
    activeOrder = finalizedOrder;
    isEditingExisting = true;

    const label = statusToSet === 'confirmed' ? 'Order confirmed' : 'Quote saved';
    CP.ui.toast(`${label} successfully (${orderId})!`, 'success');
    render(root, { id: orderId });
  }

  function bindEvents(settings, isOrderLocked) {
    root.addEventListener('input', (e) => {
      const target = e.target;
      if (target.matches('#cust-phone')) {
        const phoneErr = root.querySelector('#cust-phone-err');
        const isValid = CP.wa.isValidIndianMobile(target.value.trim());
        if (target.value.trim() && !isValid) {
          if (phoneErr) phoneErr.textContent = 'Invalid Indian mobile (10 digits starting 6-9)';
        } else if (phoneErr) { phoneErr.textContent = ''; }
      }
      if (target.matches('#sum-discount-pct')) { manualDiscountOverride = true; }

      const row = target.closest('.part-row');
      if (row) {
        const pWeight = Number(row.querySelector('.part-weight')?.value) || 0;
        const pQty = Number(row.querySelector('.part-qty')?.value) || 1;
        const pMat = row.querySelector('.part-material')?.value || 'PLA';
        const pLayer = row.querySelector('.part-layer')?.value || '0.20';
        const pPrice = CP.pricing.partPrice({ weightG: pWeight, qty: pQty, material: pMat, layer: pLayer }, settings);
        const cell = row.querySelector('.row-price-cell');
        if (cell) cell.textContent = `₹ ${CP.util.fmtNum(pPrice.toFixed(2))}`;
      }
      updateSummary();
    });

    const catSelect = root.querySelector('#cust-category');
    if (catSelect) {
      catSelect.addEventListener('change', () => {
        if (!manualDiscountOverride) {
          const cat = catSelect.value;
          const catDiscounts = settings.pricing?.categoryDiscountPct || {};
          const disc = catDiscounts[cat] !== undefined ? catDiscounts[cat] : 0;
          const discInput = root.querySelector('#sum-discount-pct');
          if (discInput) discInput.value = disc;
        }
        updateSummary();
      });
    }

    root.addEventListener('change', (e) => {
      const row = e.target.closest('.part-row');
      if (row && (e.target.matches('.part-material') || e.target.matches('.part-layer'))) {
        const pWeight = Number(row.querySelector('.part-weight')?.value) || 0;
        const pQty = Number(row.querySelector('.part-qty')?.value) || 1;
        const pMat = row.querySelector('.part-material')?.value || 'PLA';
        const pLayer = row.querySelector('.part-layer')?.value || '0.20';
        const pPrice = CP.pricing.partPrice({ weightG: pWeight, qty: pQty, material: pMat, layer: pLayer }, settings);
        const cell = row.querySelector('.row-price-cell');
        if (cell) cell.textContent = `₹ ${CP.util.fmtNum(pPrice.toFixed(2))}`;
        updateSummary();
      }
    });

    const addPartBtn = root.querySelector('#btn-add-part');
    if (addPartBtn) {
      addPartBtn.addEventListener('click', () => {
        readFormData();
        activeOrder.parts.push(createBlankPart());
        rebuildPartsTable(settings, isOrderLocked);
        updateSummary();
      });
    }

    root.addEventListener('click', (e) => {
      const dupBtn = e.target.closest('.btn-dup-part');
      if (dupBtn) {
        const row = dupBtn.closest('.part-row');
        const partId = row.getAttribute('data-part-id');
        readFormData();
        const partToDup = activeOrder.parts.find(p => p.id === partId);
        if (partToDup) {
          activeOrder.parts.push(Object.assign({}, partToDup, { id: CP.util.uid('pt'), name: `${partToDup.name} (Copy)` }));
          rebuildPartsTable(settings, isOrderLocked);
          updateSummary();
        }
      }
      const delBtn = e.target.closest('.btn-del-part');
      if (delBtn) {
        const row = delBtn.closest('.part-row');
        const partId = row.getAttribute('data-part-id');
        readFormData();
        if (activeOrder.parts.length <= 1) { CP.ui.toast('At least one part is required.', 'warning'); return; }
        activeOrder.parts = activeOrder.parts.filter(p => p.id !== partId);
        rebuildPartsTable(settings, isOrderLocked);
        updateSummary();
      }
    });

    const saveQuoteBtn = root.querySelector('#btn-save-quote');
    if (saveQuoteBtn) saveQuoteBtn.addEventListener('click', () => saveOrder('quote'));

    const confirmOrderBtn = root.querySelector('#btn-confirm-order');
    if (confirmOrderBtn) confirmOrderBtn.addEventListener('click', () => saveOrder('confirmed'));

    const copyWaBtn = root.querySelector('#btn-copy-wa');
    if (copyWaBtn) {
      copyWaBtn.addEventListener('click', () => {
        const orderData = readFormData();
        const errors = validateOrder(orderData);
        if (errors.length > 0) { CP.ui.toast(errors[0], 'danger'); return; }
        const msg = CP.wa.buildQuoteMessage(orderData, settings);
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(msg).then(() => CP.ui.toast('WhatsApp quote copied!', 'success')).catch(() => fallbackCopy(msg));
        } else { fallbackCopy(msg); }
      });
    }

    const openWaBtn = root.querySelector('#btn-open-wa');
    if (openWaBtn) {
      openWaBtn.addEventListener('click', () => {
        const orderData = readFormData();
        const phone = orderData.customer.phone;
        if (!CP.wa.isValidIndianMobile(phone)) {
          const phoneErr = root.querySelector('#cust-phone-err');
          if (phoneErr) phoneErr.textContent = 'Please enter a valid 10-digit Indian mobile number';
          CP.ui.toast('Please enter a valid 10-digit Indian mobile number', 'danger');
          root.querySelector('#cust-phone')?.focus();
          return;
        }
        const msg = CP.wa.buildQuoteMessage(orderData, settings);
        window.open(CP.wa.waLink(phone, msg), '_blank');
      });
    }

    const clearBtn = root.querySelector('#btn-clear-form');
    if (clearBtn) {
      clearBtn.addEventListener('click', async () => {
        const confirmed = await CP.ui.confirm('Clear form and discard any unsaved quote/draft?');
        if (!confirmed) return;
        CP.store.remove('cp_draft_order');
        activeOrder = createBlankOrder();
        isEditingExisting = false;
        manualDiscountOverride = false;
        render(root, {});
        CP.ui.toast('Form cleared.', 'info');
      });
    }

    const discardDraftBtn = root.querySelector('#btn-discard-draft');
    if (discardDraftBtn) {
      discardDraftBtn.addEventListener('click', () => {
        CP.store.remove('cp_draft_order');
        activeOrder = createBlankOrder();
        render(root, {});
        CP.ui.toast('Restored draft discarded.', 'info');
      });
    }
  }

  function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    try {
      document.execCommand('copy');
      CP.ui.toast('WhatsApp quote copied!', 'success');
    } catch (err) {
      CP.ui.toast('Failed to copy text automatically.', 'danger');
    }
    document.body.removeChild(ta);
  }

  function rebuildPartsTable(settings, isOrderLocked) {
    const tbody = root.querySelector('#parts-table-body');
    if (!tbody) return;
    const parts = activeOrder.parts || [];
    tbody.innerHTML = parts.map((p, idx) => renderPartRow(p, idx, parts.length, settings, isOrderLocked)).join('');
  }

  function render(rootElement, params) {
    root = rootElement;
    const settings = getSettings();
    manualDiscountOverride = false;
    let isDraftRestored = false;
    let isOrderLocked = false;

    if (params && params.id) {
      const orders = CP.store.get('cp_orders', []);
      const found = orders.find(o => o.id === params.id);
      if (found) {
        activeOrder = JSON.parse(JSON.stringify(found));
        isEditingExisting = true;
        if (activeOrder.status === 'confirmed' || activeOrder.status === 'printing') {
          const hasLocked = activeOrder.parts.some(p => p.status === 'printing' || p.status === 'done');
          if (hasLocked) isOrderLocked = true;
        }
      } else {
        CP.ui.toast(`Order ${params.id} not found. Starting blank quote.`, 'warning');
        activeOrder = createBlankOrder();
        isEditingExisting = false;
      }
    } else {
      const draft = CP.store.get('cp_draft_order', null);
      if (draft && draft.customer && Array.isArray(draft.parts)) {
        activeOrder = draft;
        isDraftRestored = true;
        isEditingExisting = false;
      } else {
        activeOrder = createBlankOrder();
        isEditingExisting = false;
      }
    }

    const calc = CP.pricing.calcOrder(activeOrder, settings);
    const parts = activeOrder.parts || [];
    const categories = ['College Project', 'Hardware Startup R&D', 'Automotive Garage', 'Hobbyist'];
    const catOptions = categories.map(c => `<option value="${CP.util.esc(c)}" ${activeOrder.customer.category === c ? 'selected' : ''}>${CP.util.esc(c)}</option>`).join('');

    root.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 12px; margin-bottom: 20px;">
        <div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <h2 style="font-size: 20px; font-weight: 700; color: var(--text);">📝 Order Desk</h2>
            ${activeOrder.id ? `<span class="badge badge-primary">${CP.util.esc(activeOrder.id)}</span>` : '<span class="badge badge-default">New Quote</span>'}
            ${activeOrder.status ? `<span class="badge badge-${activeOrder.status === 'confirmed' ? 'success' : 'default'}">${CP.util.esc(activeOrder.status.toUpperCase())}</span>` : ''}
          </div>
          <div style="color: var(--text-muted); font-size: 13px;">Fast quoting, part slicing calculations, and WhatsApp quote dispatch</div>
        </div>
        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
          <button type="button" id="btn-clear-form" class="btn btn-ghost">Clear</button>
          <button type="button" id="btn-copy-wa" class="btn btn-secondary">Copy WA Quote</button>
          <button type="button" id="btn-open-wa" class="btn btn-secondary">Open in WhatsApp</button>
          <button type="button" id="btn-save-quote" class="btn btn-secondary">Save as Quote</button>
          <button type="button" id="btn-confirm-order" class="btn btn-primary">Confirm Order</button>
        </div>
      </div>
      ${isDraftRestored ? `<div class="banner banner-info" style="margin-bottom: 16px; display: flex; align-items: center; justify-content: space-between;"><span>Draft quote restored from previous session.</span><button type="button" id="btn-discard-draft" class="btn btn-sm btn-ghost">Discard Draft</button></div>` : ''}
      ${isOrderLocked ? `<div class="banner banner-warning" style="margin-bottom: 16px;"><span>⚠️ This order is in production. Parts currently printing or completed have locked specifications.</span></div>` : ''}
      <div class="orderdesk-layout">
        <div id="orderdesk-form">
          <div class="card">
            <div class="card-header"><h3 class="card-title">Customer Details</h3></div>
            <div class="grid grid-cols-3">
              <div class="field"><label for="cust-name">Customer Name *</label><input type="text" id="cust-name" class="input" placeholder="e.g. Rahul Sharma" value="${CP.util.esc(activeOrder.customer.name)}"></div>
              <div class="field"><label for="cust-phone">Phone / WhatsApp *</label><input type="text" id="cust-phone" class="input" placeholder="e.g. 98400 12345" value="${CP.util.esc(activeOrder.customer.phone)}"><div id="cust-phone-err" class="field-error"></div></div>
              <div class="field"><label for="cust-email">Email (Optional)</label><input type="email" id="cust-email" class="input" placeholder="rahul@example.com" value="${CP.util.esc(activeOrder.customer.email)}"></div>
              <div class="field"><label for="cust-category">Customer Category</label><select id="cust-category" class="select">${catOptions}</select></div>
              <div class="field"><label for="cust-due-date">Target Due Date</label><input type="date" id="cust-due-date" class="input" value="${CP.util.esc(activeOrder.dueDate || '')}"></div>
              <div class="field"><label for="cust-notes">Order Notes / Project Ref</label><input type="text" id="cust-notes" class="input" placeholder="e.g. Drone arm mount v2" value="${CP.util.esc(activeOrder.notes || '')}"></div>
            </div>
          </div>
          <div class="card">
            <div class="card-header"><div><h3 class="card-title">Parts &amp; Print Specs</h3><div class="card-subtitle">Calibrated in Settings</div></div><button type="button" id="btn-add-part" class="btn btn-secondary btn-sm" ${isOrderLocked ? 'disabled' : ''}>+ Add Part</button></div>
            <div class="table-wrapper"><table class="table" style="min-width: 800px;"><thead><tr><th style="width: 36px; text-align: center;">#</th><th>Part Name</th><th style="width: 110px;">Material</th><th style="width: 110px;">Layer</th><th style="width: 80px;">Infill %</th><th style="width: 90px;">Weight (g)</th><th style="width: 70px;">Qty</th><th style="width: 90px;">Hours (Opt)</th><th style="width: 100px; text-align: right;">Price</th><th style="width: 80px; text-align: center;">Actions</th></tr></thead><tbody id="parts-table-body">${parts.map((p, idx) => renderPartRow(p, idx, parts.length, settings, isOrderLocked)).join('')}</tbody></table></div>
          </div>
        </div>
        <div class="orderdesk-summary">
          <div class="card">
            <div class="card-header"><h3 class="card-title">Quote Summary</h3></div>
            <div class="summary-row"><span style="color: var(--text-muted);">Subtotal:</span><span id="sum-subtotal" style="font-weight: 600;">₹ ${CP.util.fmtNum(calc.subtotal.toFixed(2))}</span></div>
            <div class="summary-row"><span style="color: var(--text-muted);">Discount:</span><div style="display: flex; align-items: center; gap: 4px;"><input type="number" id="sum-discount-pct" min="0" max="100" step="1" class="input parts-table-input" style="width: 60px; text-align: right;" value="${calc.discountPct}"><span>%</span><span id="sum-discount-amt" style="font-weight: 500; min-width: 70px; text-align: right; color: var(--danger);">-₹ ${CP.util.fmtNum(calc.discountAmt.toFixed(2))}</span></div></div>
            <div class="summary-row"><span style="color: var(--text-muted);">Taxable Subtotal:</span><span id="sum-taxable">₹ ${CP.util.fmtNum(calc.taxable.toFixed(2))}</span></div>
            <div id="sum-gst-section" style="${settings.pricing?.gstEnabled ? 'display: block;' : 'display: none;'}">
              ${settings.pricing?.interState ? `<div class="summary-row"><span style="color: var(--text-muted);">IGST (${calc.gstPct}%):</span><span>₹ ${CP.util.fmtNum(calc.igst.toFixed(2))}</span></div>` : `<div class="summary-row"><span style="color: var(--text-muted);">CGST (${(calc.gstPct / 2).toFixed(1)}%):</span><span>₹ ${CP.util.fmtNum(calc.cgst.toFixed(2))}</span></div><div class="summary-row"><span style="color: var(--text-muted);">SGST (${(calc.gstPct / 2).toFixed(1)}%):</span><span>₹ ${CP.util.fmtNum(calc.sgst.toFixed(2))}</span></div>`}
            </div>
            <div class="summary-row total-row"><span>Total:</span><span id="sum-total">₹ ${CP.util.fmtNum(calc.total.toFixed(2))}</span></div>
            <div style="margin-top: 16px; padding-top: 12px; border-top: 1px dashed var(--border);">
              <div class="field"><label for="sum-advance" style="font-size: 12px; color: var(--text-muted);">Advance Requested (₹)</label><input type="number" id="sum-advance" min="0" step="50" class="input" placeholder="0" value="${calc.advance || ''}"></div>
              <div class="summary-row" style="margin-top: 4px;"><span style="color: var(--text-muted);">Balance Payable:</span><span id="sum-balance" style="font-weight: 600;">₹ ${CP.util.fmtNum(calc.balance.toFixed(2))}</span></div>
            </div>
            <div style="margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--border); font-size: 12px;">
              <div class="summary-row"><span style="color: var(--text-muted);">Total Print Hours:</span><span id="sum-print-hours" style="font-weight: 500;">${calc.totalPrintHours} hrs</span></div>
              <div class="summary-row"><span style="color: var(--text-muted);">Longest Part Job:</span><span id="sum-longest-part" style="font-weight: 500;">${calc.longestPartHours} hrs</span></div>
              <div class="summary-row"><span style="color: var(--text-muted);">Estimated Lead Time:</span><span id="sum-turnaround" style="font-weight: 600; color: var(--brand);">${calc.turnaroundDays} day(s)</span></div>
              <div class="summary-row"><span style="color: var(--text-muted);">Est. Completion:</span><span id="sum-est-delivery" style="font-weight: 500;">${CP.util.fmtDate(CP.util.addDays(CP.util.todayISO(), calc.turnaroundDays))}</span></div>
            </div>
          </div>
        </div>
      </div>
    `;
    bindEvents(settings, isOrderLocked);
  }

  function destroy() {
    clearTimeout(debounceSaveTimer);
    root = null;
    activeOrder = null;
  }

  return { id: 'orderdesk', route: '#/order-desk', title: 'Order Desk', icon: '📝', render, destroy };
})());

// Register sample order seeder in CP.dev
if (CP.dev && typeof CP.dev.registerSeeder === 'function') {
  CP.dev.registerSeeder(() => {
    const settings = CP.store.get('cp_settings', CP.defaults ? CP.defaults.settings : {});
    const existingOrders = CP.store.get('cp_orders', []);

    const sampleSeeds = [
      {
        customer: { name: 'Aravind Kumar', phone: '9840123456', email: 'aravind@aerovision.in', category: 'Hardware Startup R&D' },
        status: 'confirmed', dueDate: CP.util.addDays(CP.util.todayISO(), 3), notes: 'Enclosure prototyping v1.4', advance: 500,
        parts: [{ name: 'Sensor Enclosure Top', material: 'ABS', layer: '0.20', infillPct: 30, weightG: 45, qty: 2 }, { name: 'Sensor Enclosure Base', material: 'ABS', layer: '0.20', infillPct: 40, weightG: 55, qty: 2 }]
      },
      {
        customer: { name: 'Pooja Sundaram', phone: '9789012345', email: 'pooja.s@annauniv.edu', category: 'College Project' },
        status: 'quote', dueDate: CP.util.addDays(CP.util.todayISO(), 2), notes: 'Final year quadcopter arm', advance: 0,
        parts: [{ name: 'Quadcopter Arm Mount', material: 'PLA', layer: '0.28', infillPct: 25, weightG: 65, qty: 4 }]
      },
      {
        customer: { name: 'Apex Auto Dynamics', phone: '9444012345', email: 'service@apexauto.in', category: 'Automotive Garage' },
        status: 'confirmed', dueDate: CP.util.addDays(CP.util.todayISO(), 4), notes: 'Dashboard gauge mount and intake duct', advance: 1000,
        parts: [{ name: 'Gauge Pod Mount', material: 'ABS', layer: '0.12', infillPct: 50, weightG: 80, qty: 1 }, { name: 'Air Intake Snorkel Joint', material: 'TPU', layer: '0.20', infillPct: 100, weightG: 120, qty: 1 }]
      },
      {
        customer: { name: 'Vignesh R', phone: '9884012345', email: 'vignesh.r@gmail.com', category: 'Hobbyist' },
        status: 'quote', dueDate: CP.util.addDays(CP.util.todayISO(), 5), notes: 'Mechanical keyboard case', advance: 0,
        parts: [{ name: '60% Keyboard Top Case', material: 'PLA', layer: '0.20', infillPct: 20, weightG: 140, qty: 1 }]
      }
    ];

    const seededOrders = [...existingOrders];
    sampleSeeds.forEach(seed => {
      const orderId = CP.util.nextId('order');
      const nowISO = new Date().toISOString();
      const parts = seed.parts.map(p => ({
        id: CP.util.uid('pt'), name: p.name, material: p.material, layer: p.layer, infillPct: p.infillPct, weightG: p.weightG, qty: p.qty, printHoursOverride: null, status: 'pending', assignedPrinterId: null, spoolId: null, notes: ''
      }));
      const calc = CP.pricing.calcOrder({ customer: seed.customer, parts, pricing: { advance: seed.advance } }, settings);
      seededOrders.push({
        id: orderId, createdAt: nowISO, updatedAt: nowISO, customer: seed.customer, dueDate: seed.dueDate, notes: seed.notes, parts,
        pricing: { subtotal: calc.subtotal, discountPct: calc.discountPct, discountAmt: calc.discountAmt, gstPct: calc.gstPct, gstAmt: calc.gstAmt, total: calc.total, advance: seed.advance },
        payment: { status: seed.advance > 0 ? 'advance' : 'unpaid', paidAmount: seed.advance, history: seed.advance > 0 ? [{ id: CP.util.uid('pay'), ts: nowISO, amount: seed.advance, mode: 'UPI', txnRef: 'UPI-DEMO-SEED', note: 'Advance payment' }] : [] },
        status: seed.status, invoiceNo: null, challanNo: null
      });
    });

    CP.store.set('cp_orders', seededOrders);
  });
}
