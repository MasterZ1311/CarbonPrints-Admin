/**
 * CarbonPrints Company OS - Quality Control & Scrap Module
 * Global namespace: window.CP
 * 3-Tab interface: QC Inspection, Scrap Log, and Farm KPI Analytics.
 */
window.CP = window.CP || {};

CP.qc = (function () {
  let root = null, activeTab = 'inspection', scrapSearchQuery = '', kpiRange = '30d';

  function getSettings() {
    return CP.store.get('cp_settings', CP.defaults ? CP.defaults.settings : {});
  }

  function getTolerance() {
    return Number(getSettings().production?.toleranceMm) || 0.2;
  }

  function isDimensionOk(nominal, measured, tol) {
    const t = tol !== undefined ? tol : getTolerance();
    if (CP.util && typeof CP.util.isDimensionOk === 'function') {
      return CP.util.isDimensionOk(nominal, measured, t);
    }
    if (nominal === undefined || measured === undefined || isNaN(nominal) || isNaN(measured)) return false;
    return Math.abs(measured - nominal) <= (t + 0.00001);
  }

  function renderTabsHeader() {
    return `
      <div class="inventory-tabs" role="tablist" style="margin-bottom: 20px;">
        <button type="button" class="inventory-tab-btn ${activeTab === 'inspection' ? 'active' : ''}" data-tab="inspection">🔍 QC Inspection</button>
        <button type="button" class="inventory-tab-btn ${activeTab === 'scrap' ? 'active' : ''}" data-tab="scrap">🗑️ Scrap Log</button>
        <button type="button" class="inventory-tab-btn ${activeTab === 'kpi' ? 'active' : ''}" data-tab="kpi">📊 Farm KPI</button>
      </div>`;
  }

  // =========================================================================
  // TAB 1: QC INSPECTION
  // =========================================================================

  function renderInspectionTab() {
    const orders = CP.store.get('cp_orders', []), qcRecords = CP.store.get('cp_qc', []);
    const pendingQcOrders = orders.filter(o => o.status === 'post' || o.status === 'qc');

    if (pendingQcOrders.length === 0) {
      return `
        <div class="card">
          <div class="card-header"><div><h2 class="card-title">🔍 Dimensional QC &amp; Inspection</h2><div class="card-subtitle">Orders in "post" or "qc" stage</div></div></div>
          ${CP.ui.emptyState('✨', 'No Orders Awaiting QC', 'All completed orders have passed quality inspection or are currently in production.')}
        </div>`;
    }

    const cardsHtml = pendingQcOrders.map(order => {
      const partsRows = (order.parts || []).map(part => {
        const partQc = qcRecords.find(q => q.partId === part.id);
        const hasPassed = part.qcResult === 'pass' || (partQc && partQc.result === 'pass');
        const hasFailed = part.qcResult === 'fail' || (partQc && partQc.result === 'fail');
        const statusBadge = hasPassed ? '<span class="badge badge-success">✓ Passed</span>'
          : hasFailed ? '<span class="badge badge-danger">✗ Failed</span>'
          : '<span class="badge badge-warning">Awaiting QC</span>';

        return `
          <tr>
            <td><strong>${CP.util.esc(part.name)}</strong><div style="font-size: 11px; color: var(--text-muted);">${CP.util.esc(part.id)}</div></td>
            <td><span class="badge badge-default">${CP.util.esc(part.material)}</span></td>
            <td>${CP.util.esc(part.layer)}mm</td>
            <td>${part.weightG}g × ${part.qty || 1}</td>
            <td>${statusBadge}</td>
            <td style="text-align: right; white-space: nowrap;">
              <button type="button" class="btn btn-secondary btn-sm btn-inspect-part" data-order-id="${CP.util.esc(order.id)}" data-part-id="${CP.util.esc(part.id)}">
                ${hasPassed ? 'Re-inspect' : 'Inspect...'}
              </button>
              ${hasFailed ? `<button type="button" class="btn btn-danger btn-sm btn-reprint-part" data-order-id="${CP.util.esc(order.id)}" data-part-id="${CP.util.esc(part.id)}" style="margin-left: 4px;">Scrap &amp; Reprint</button>` : ''}
            </td>
          </tr>`;
      }).join('');

      return `
        <div class="card" style="margin-bottom: 20px;">
          <div class="card-header" style="background-color: var(--bg-subtle);">
            <div>
              <span class="badge badge-${order.status === 'post' ? 'warning' : 'info'}" style="margin-right: 8px;">${order.status.toUpperCase()}</span>
              <strong style="font-size: 15px;">${CP.util.esc(order.id)}</strong>
              <span style="color: var(--text-muted); margin-left: 8px;">• ${CP.util.esc(order.customer?.name || 'Customer')}</span>
            </div>
            <div style="font-size: 12px; color: var(--text-muted);">Due: ${order.dueDate ? CP.util.fmtDate(order.dueDate) : 'N/A'}</div>
          </div>
          <div class="table-container" style="border: none; border-radius: 0;">
            <table class="table">
              <thead><tr><th>Part Name</th><th>Material</th><th>Layer</th><th>Weight</th><th>QC Status</th><th style="text-align: right;">Action</th></tr></thead>
              <tbody>${partsRows}</tbody>
            </table>
          </div>
        </div>`;
    }).join('');

    return `
      <div style="margin-bottom: 16px;">
        <div class="banner banner-info" style="margin-bottom: 16px;">
          <strong>Calibrated Vernier Inspection:</strong> Verify XYZ against ±${getTolerance()}mm tolerance. Passing all parts advances order to Ready.
        </div>
        ${cardsHtml}
      </div>`;
  }

  function openInspectionModal(orderId, partId) {
    const orders = CP.store.get('cp_orders', []), order = orders.find(o => o.id === orderId);
    if (!order) return;
    const part = (order.parts || []).find(p => p.id === partId);
    if (!part) return;

    const tolerance = getTolerance(), lastInspector = localStorage.getItem('cp_last_inspector') || '';
    const qcRecords = CP.store.get('cp_qc', []), prevQc = qcRecords.find(q => q.partId === part.id);

    const nom = prevQc?.nominal || { x: 20, y: 20, z: 20 }, meas = prevQc?.measured || { x: 20, y: 20, z: 20 };
    const chk = prevQc?.checks || { surface: true, supports: true, packed: true, label: true };

    const wrapper = document.createElement('div');
    wrapper.innerHTML = `
      <div class="banner banner-info" style="margin-bottom: 12px;">
        <div><strong>${CP.util.esc(part.name)}</strong> (${CP.util.esc(order.id)})</div>
        <div style="font-size: 12px;">Material: ${CP.util.esc(part.material)} • Tolerance: ±${tolerance} mm</div>
      </div>
      <div class="field" style="margin-bottom: 12px;">
        <label><strong>Inspector Name:</strong> <span style="color: var(--status-error);">*</span></label>
        <input type="text" class="input" id="qc-inspector" value="${CP.util.esc(lastInspector)}" placeholder="e.g. Intern Name">
      </div>
      <div style="margin-bottom: 12px;">
        <label style="display: block; margin-bottom: 4px; font-weight: 700;">XYZ Caliper Measurements (mm):</label>
        <div style="display: grid; grid-template-columns: 36px 1fr 1fr 64px; gap: 6px; font-size: 11px; font-weight: 600; color: var(--text-muted); margin-bottom: 4px;">
          <div>Axis</div><div>Nominal</div><div>Measured</div><div style="text-align:center;">Status</div>
        </div>
        ${['x', 'y', 'z'].map(ax => `
          <div style="display: grid; grid-template-columns: 36px 1fr 1fr 64px; gap: 6px; align-items: center; margin-bottom: 6px;">
            <strong style="text-align: center; text-transform: uppercase;">${ax}</strong>
            <input type="number" step="0.01" class="input" id="qc-nom-${ax}" value="${nom[ax]}">
            <input type="number" step="0.01" class="input" id="qc-meas-${ax}" value="${meas[ax]}">
            <div style="text-align: center;" id="qc-badge-${ax}"></div>
          </div>`).join('')}
      </div>
      <div style="margin-bottom: 12px; background: var(--bg-subtle); padding: 8px 12px; border-radius: var(--radius-md);">
        <label style="display: block; margin-bottom: 6px; font-weight: 700;">Checklist:</label>
        <div style="display: flex; flex-direction: column; gap: 4px; font-size: 12px;">
          <label><input type="checkbox" id="qc-chk-surface" ${chk.surface ? 'checked' : ''}> Surface finish acceptable</label>
          <label><input type="checkbox" id="qc-chk-supports" ${chk.supports ? 'checked' : ''}> Supports cleanly removed</label>
          <label><input type="checkbox" id="qc-chk-packed" ${chk.packed ? 'checked' : ''}> Packed safely</label>
          <label><input type="checkbox" id="qc-chk-label" ${chk.label ? 'checked' : ''}> Label attached</label>
        </div>
      </div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px;">
        <div class="field">
          <label><strong>Final Decision:</strong></label>
          <select class="select" id="qc-result-select"><option value="pass">✓ PASS</option><option value="fail">✗ FAIL</option></select>
          <span class="help-text" id="qc-auto-suggest-hint"></span>
        </div>
        <div class="field">
          <label><strong>Notes / Override Reason:</strong></label>
          <input type="text" class="input" id="qc-notes" placeholder="Required if overriding result" value="${CP.util.esc(prevQc?.notes || '')}">
        </div>
      </div>`;

    function updateCalculations() {
      const tol = getTolerance();
      const nx = Number(wrapper.querySelector('#qc-nom-x')?.value), mx = Number(wrapper.querySelector('#qc-meas-x')?.value);
      const ny = Number(wrapper.querySelector('#qc-nom-y')?.value), my = Number(wrapper.querySelector('#qc-meas-y')?.value);
      const nz = Number(wrapper.querySelector('#qc-nom-z')?.value), mz = Number(wrapper.querySelector('#qc-meas-z')?.value);
      const okX = isDimensionOk(nx, mx, tol), okY = isDimensionOk(ny, my, tol), okZ = isDimensionOk(nz, mz, tol);

      const bX = wrapper.querySelector('#qc-badge-x'), bY = wrapper.querySelector('#qc-badge-y'), bZ = wrapper.querySelector('#qc-badge-z');
      if (bX) bX.innerHTML = okX ? '<span class="badge badge-success">OK</span>' : '<span class="badge badge-danger">OUT</span>';
      if (bY) bY.innerHTML = okY ? '<span class="badge badge-success">OK</span>' : '<span class="badge badge-danger">OUT</span>';
      if (bZ) bZ.innerHTML = okZ ? '<span class="badge badge-success">OK</span>' : '<span class="badge badge-danger">OUT</span>';

      const sOk = !!wrapper.querySelector('#qc-chk-surface')?.checked;
      const spOk = !!wrapper.querySelector('#qc-chk-supports')?.checked;
      const pOk = !!wrapper.querySelector('#qc-chk-packed')?.checked;
      const lOk = !!wrapper.querySelector('#qc-chk-label')?.checked;
      const autoPass = okX && okY && okZ && sOk && spOk && pOk && lOk;

      const select = wrapper.querySelector('#qc-result-select'), hint = wrapper.querySelector('#qc-auto-suggest-hint');
      if (hint) hint.innerHTML = autoPass ? '<span style="color: var(--status-idle); font-weight: 600;">Suggested: PASS</span>' : '<span style="color: var(--status-error); font-weight: 600;">Suggested: FAIL</span>';
      if (select && !select.dataset.userModified) select.value = autoPass ? 'pass' : 'fail';
      return { autoPass, okX, okY, okZ, sOk, spOk, pOk, lOk, nx, mx, ny, my, nz, mz };
    }

    wrapper.querySelectorAll('input').forEach(inp => {
      inp.addEventListener('input', updateCalculations);
      inp.addEventListener('change', updateCalculations);
    });
    wrapper.querySelector('#qc-result-select')?.addEventListener('change', (e) => { e.target.dataset.userModified = 'true'; });
    updateCalculations();

    CP.ui.modal({
      title: `QC Inspection: ${part.name}`,
      bodyNode: wrapper,
      buttons: [
        { label: 'Cancel', kind: 'btn-secondary' },
        {
          label: 'Save QC Record',
          kind: 'btn-primary',
          onClick: () => {
            const inspector = wrapper.querySelector('#qc-inspector')?.value.trim();
            if (!inspector) { CP.ui.toast('Please enter inspector name.', 'warning'); return false; }
            const calc = updateCalculations(), chosenResult = wrapper.querySelector('#qc-result-select')?.value || 'pass';
            const notes = wrapper.querySelector('#qc-notes')?.value.trim() || '';
            const isOverride = (chosenResult === 'pass' && !calc.autoPass) || (chosenResult === 'fail' && calc.autoPass);
            if (isOverride && !notes) { CP.ui.toast('Override reason is required.', 'warning'); return false; }

            localStorage.setItem('cp_last_inspector', inspector);
            const record = {
              id: CP.util.uid('qc'), ts: new Date().toISOString(), orderId: order.id, partId: part.id,
              partName: part.name, inspector, nominal: { x: calc.nx, y: calc.ny, z: calc.nz },
              measured: { x: calc.mx, y: calc.my, z: calc.mz }, checks: { surface: calc.sOk, supports: calc.spOk, packed: calc.pOk, label: calc.lOk },
              dimOk: { x: calc.okX, y: calc.okY, z: calc.okZ }, result: chosenResult, override: isOverride, notes
            };
            const qcList = CP.store.get('cp_qc', []);
            qcList.unshift(record);
            CP.store.set('cp_qc', qcList);

            const allOrders = CP.store.get('cp_orders', []), ord = allOrders.find(o => o.id === order.id);
            if (ord) {
              const pt = (ord.parts || []).find(p => p.id === part.id);
              if (pt) { pt.qcResult = chosenResult; pt.qcPassed = (chosenResult === 'pass'); }
              const allPassed = (ord.parts || []).every(p => p.qcResult === 'pass' || qcList.some(q => q.partId === p.id && q.result === 'pass'));
              if (allPassed) {
                if (ord.status === 'post') ord.status = 'qc';
                if (ord.status === 'qc') ord.status = 'ready';
                CP.ui.toast(`All parts passed QC! Order ${ord.id} is now Ready for delivery.`, 'success');
              } else {
                if (ord.status === 'post') ord.status = 'qc';
                CP.ui.toast(`Inspection saved for "${part.name}".`, chosenResult === 'pass' ? 'success' : 'warning');
              }
              ord.updatedAt = new Date().toISOString();
              CP.store.set('cp_orders', allOrders);
            }
            if (CP.bus) CP.bus.emit('qc:changed');
            renderView();
            if (chosenResult === 'fail') setTimeout(() => openReprintModal(order.id, part.id), 250);
            return true;
          }
        }
      ]
    });
  }

  function openReprintModal(orderId, partId) {
    const orders = CP.store.get('cp_orders', []), order = orders.find(o => o.id === orderId);
    if (!order) return;
    const part = (order.parts || []).find(p => p.id === partId);
    if (!part) return;

    const spools = CP.store.get('cp_spools', []).filter(s => s.status === 'active');
    const partWeight = Number(part.weightG) * (Number(part.qty) || 1);
    const reasons = CP.scrap ? CP.scrap.FAILURE_REASONS : ['Spaghetti', 'Warping', 'Layer shift', 'Nozzle clog', 'Bed adhesion', 'Power cut', 'Other'];
    const matchingSpools = spools.filter(s => s.material === part.material);

    const wrapper = document.createElement('div');
    wrapper.innerHTML = `
      <div class="banner banner-danger" style="margin-bottom: 12px;">
        <div><strong>Log Scrap &amp; Reprint: ${CP.util.esc(part.name)}</strong></div>
        <div style="font-size: 12px;">Deducts filament and returns part to Farm Board pending queue.</div>
      </div>
      <div class="field" style="margin-bottom: 10px;">
        <label>Failed Grams to Scrap (g):</label>
        <input type="number" class="input" id="rep-grams" min="1" step="1" value="${partWeight}">
      </div>
      <div class="field" style="margin-bottom: 10px;">
        <label>Failure Reason:</label>
        <select class="select" id="rep-reason">${reasons.map(r => `<option value="${r}">${r}</option>`).join('')}</select>
      </div>
      <div class="field" style="margin-bottom: 10px;">
        <label>Deduct Scrap from Spool:</label>
        <select class="select" id="rep-spool">
          ${matchingSpools.map(s => `<option value="${s.id}" ${s.id === part.spoolId ? 'selected' : ''}>${s.id} (${s.material} - ${s.color}, ${s.remainingG}g left)</option>`).join('') || '<option value="">No active spool</option>'}
        </select>
      </div>
      <div class="field"><label>Notes:</label><textarea class="textarea" id="rep-notes" placeholder="e.g. Layer shift at 20mm"></textarea></div>`;

    CP.ui.modal({
      title: `Log Scrap & Reprint Part`,
      bodyNode: wrapper,
      buttons: [
        { label: 'Cancel', kind: 'btn-secondary' },
        {
          label: 'Confirm Scrap & Queue Reprint',
          kind: 'btn-danger',
          onClick: () => {
            const failedG = Number(wrapper.querySelector('#rep-grams')?.value) || partWeight;
            const reason = wrapper.querySelector('#rep-reason')?.value || 'Other';
            const spoolId = wrapper.querySelector('#rep-spool')?.value || part.spoolId || null;
            const notes = wrapper.querySelector('#rep-notes')?.value.trim() || '';

            if (CP.scrap && typeof CP.scrap.add === 'function') {
              CP.scrap.add({ printerId: part.assignedPrinterId || null, orderId: order.id, partId: part.id, material: part.material, grams: failedG, reason, notes, source: 'qc' });
            }
            if (spoolId && CP.inventory && typeof CP.inventory.consume === 'function') {
              CP.inventory.consume(spoolId, failedG, { reason: 'scrap', orderId: order.id, printerId: part.assignedPrinterId || null, note: `QC rejection scrap (${reason})` });
            }

            const allOrders = CP.store.get('cp_orders', []), ord = allOrders.find(o => o.id === order.id);
            if (ord) {
              const pt = (ord.parts || []).find(p => p.id === part.id);
              if (pt) { pt.status = 'pending'; pt.assignedPrinterId = null; pt.spoolId = null; pt.qcResult = null; pt.qcPassed = false; }
              if (ord.status === 'post' || ord.status === 'qc') ord.status = 'printing';
              ord.updatedAt = new Date().toISOString();
              CP.store.set('cp_orders', allOrders);
            }
            if (CP.bus) { CP.bus.emit('orders:changed'); CP.bus.emit('farm:changed'); }
            CP.ui.toast(`Part "${part.name}" returned to Farm Board queue. Scrap logged.`, 'warning');
            renderView();
            return true;
          }
        }
      ]
    });
  }

  // =========================================================================
  // TAB 2: SCRAP LOG
  // =========================================================================

  function renderScrapTab() {
    const settings = getSettings(), materials = settings.materials || ['PLA', 'ABS', 'TPU'];
    const printers = CP.store.get('cp_printers', []), orders = CP.store.get('cp_orders', []);
    const spools = CP.store.get('cp_spools', []).filter(s => s.status === 'active'), allScrap = CP.store.get('cp_scrap', []);
    const reasons = CP.scrap ? CP.scrap.FAILURE_REASONS : ['Spaghetti', 'Warping', 'Layer shift', 'Nozzle clog', 'Bed adhesion', 'Power cut', 'Other'];

    const q = scrapSearchQuery.toLowerCase().trim();
    const filteredScrap = allScrap.filter(s => {
      if (!q) return true;
      const mPr = s.printerId ? `printer ${s.printerId}`.includes(q) : false;
      return mPr || (s.orderId || '').toLowerCase().includes(q) || (s.material || '').toLowerCase().includes(q) || (s.reason || '').toLowerCase().includes(q) || (s.notes || '').toLowerCase().includes(q);
    });

    const rowsHtml = filteredScrap.length === 0
      ? `<tr><td colspan="7" style="text-align:center; color:var(--text-muted); padding:20px;">No scrap records found.</td></tr>`
      : filteredScrap.map(s => `
        <tr>
          <td style="white-space:nowrap;">${CP.util.fmtDate(s.ts)}</td>
          <td><strong>${s.printerId ? `Printer ${String(s.printerId).padStart(2, '0')}` : 'Manual'}</strong></td>
          <td>${s.orderId ? `<span class="badge badge-default">${CP.util.esc(s.orderId)}</span>` : '—'}</td>
          <td><span class="badge badge-default">${CP.util.esc(s.material)}</span></td>
          <td><strong style="color:var(--status-error);">${CP.util.fmtNum(s.grams)}g</strong></td>
          <td><span class="badge badge-danger">${CP.util.esc(s.reason)}</span></td>
          <td style="font-size:12px; color:var(--text-muted); max-width:180px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${CP.util.esc(s.notes || '—')}</td>
        </tr>`).join('');

    return `
      <div style="display: grid; grid-template-columns: 320px 1fr; gap: 20px; align-items: start;">
        <div class="card">
          <div class="card-header"><div><h3 class="card-title">📝 Log Manual Scrap</h3><div class="card-subtitle">Purge waste, bench tests, or discards</div></div></div>
          <form id="form-manual-scrap">
            <div class="field" style="margin-bottom:8px;"><label>Printer (Optional):</label><select class="select" id="scrap-printer"><option value="">None / Off-machine</option>${printers.map(p => `<option value="${p.id}">${CP.util.esc(p.name)}</option>`).join('')}</select></div>
            <div class="field" style="margin-bottom:8px;"><label>Order (Optional):</label><select class="select" id="scrap-order"><option value="">None / Farm scrap</option>${orders.slice(0, 15).map(o => `<option value="${CP.util.esc(o.id)}">${CP.util.esc(o.id)} - ${CP.util.esc(o.customer?.name || '')}</option>`).join('')}</select></div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:8px;">
              <div class="field"><label>Material:</label><select class="select" id="scrap-material">${materials.map(m => `<option value="${m}">${m}</option>`).join('')}</select></div>
              <div class="field"><label>Grams (g):</label><input type="number" class="input" id="scrap-grams" min="1" step="1" required></div>
            </div>
            <div class="field" style="margin-bottom:8px;"><label>Reason:</label><select class="select" id="scrap-reason">${reasons.map(r => `<option value="${r}">${r}</option>`).join('')}</select></div>
            <div class="field" style="margin-bottom:8px;"><label>Notes:</label><input type="text" class="input" id="scrap-notes" placeholder="e.g. Purge block & nozzle leak"></div>
            <div style="margin-bottom:12px; background:var(--bg-subtle); padding:8px 10px; border-radius:var(--radius-md);">
              <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-size:12px; font-weight:600;"><input type="checkbox" id="scrap-deduct-chk"> Deduct from a spool</label>
              <div id="scrap-spool-container" style="display:none; margin-top:6px;"><select class="select" id="scrap-spool"><option value="">Select spool...</option>${spools.map(s => `<option value="${s.id}">${s.id} (${s.material} - ${s.color}, ${s.remainingG}g)</option>`).join('')}</select></div>
            </div>
            <button type="submit" class="btn btn-danger" style="width:100%;">🗑️ Record Scrap Entry</button>
          </form>
        </div>
        <div class="card">
          <div class="card-header" style="flex-wrap:wrap; gap:10px;">
            <div><h3 class="card-title">📜 Scrap Register (${allScrap.length})</h3><div class="card-subtitle">All failure incidents and purge losses</div></div>
            <div style="width:200px;"><input type="search" class="input input-sm" id="scrap-search-input" placeholder="Search scrap logs..." value="${CP.util.esc(scrapSearchQuery)}"></div>
          </div>
          <div class="table-container" style="max-height:500px; overflow-y:auto;">
            <table class="table"><thead><tr><th>Date</th><th>Printer</th><th>Order</th><th>Material</th><th>Grams</th><th>Reason</th><th>Notes</th></tr></thead><tbody>${rowsHtml}</tbody></table>
          </div>
        </div>
      </div>`;
  }

  // =========================================================================
  // TAB 3: FARM KPI
  // =========================================================================

  function renderKpiTab() {
    const settings = getSettings(), targetPct = Number(settings.production?.scrapTargetPct) || 5;
    const totals = CP.scrap ? CP.scrap.totals(kpiRange) : { scrapG: 0, consumedG: 0, scrapPct: 0 };
    const status = CP.scrap ? CP.scrap.scrapStatus(totals.scrapPct) : 'good';
    const reasons = CP.scrap ? CP.scrap.byReason(kpiRange) : [], printers = CP.scrap ? CP.scrap.byPrinter(kpiRange) : [];
    const maxReasonG = reasons.reduce((m, r) => Math.max(m, r.grams), 0) || 1;

    const reasonBarsHtml = reasons.length === 0 ? '<div style="padding:20px; text-align:center; color:var(--text-muted);">No scrap recorded.</div>' : reasons.map(r => {
      const fillPct = Math.min(100, Math.round((r.grams / maxReasonG) * 100));
      return `
        <div style="margin-bottom:10px;">
          <div style="display:flex; justify-content:space-between; font-size:12px; font-weight:600; margin-bottom:3px;">
            <span>${CP.util.esc(r.reason)} (${r.count})</span>
            <span><strong>${CP.util.fmtNum(r.grams)}g</strong> <span style="color:var(--text-muted); font-size:11px;">(${r.pct}%)</span></span>
          </div>
          <div style="height:8px; background:#f1f5f9; border-radius:4px; overflow:hidden;">
            <div style="height:100%; width:${fillPct}%; background:var(--status-error); border-radius:4px; transition:width 0.3s ease;"></div>
          </div>
        </div>`;
    }).join('');

    const printerRowsHtml = printers.length === 0 ? '<tr><td colspan="5" style="text-align:center; color:var(--text-muted);">No records.</td></tr>' : printers.map((p, idx) => `
      <tr>
        <td><strong>#${idx + 1}</strong></td>
        <td><strong>${CP.util.esc(p.printerName)}</strong></td>
        <td><strong style="color:${p.grams > 0 ? 'var(--status-error)' : 'inherit'};">${CP.util.fmtNum(p.grams)}g</strong></td>
        <td>${p.count}</td>
        <td>${p.pct}%</td>
      </tr>`).join('');

    return `
      <div>
        <div style="display:flex; justify-content:flex-end; gap:8px; margin-bottom:14px;">
          <button type="button" class="btn btn-sm ${kpiRange === '30d' ? 'btn-primary' : 'btn-secondary'} btn-kpi-range" data-range="30d">Last 30 Days</button>
          <button type="button" class="btn btn-sm ${kpiRange === 'month' ? 'btn-primary' : 'btn-secondary'} btn-kpi-range" data-range="month">This Month</button>
          <button type="button" class="btn btn-sm ${kpiRange === 'all' ? 'btn-primary' : 'btn-secondary'} btn-kpi-range" data-range="all">All Time</button>
        </div>
        <div class="card" style="margin-bottom:20px; text-align:center; padding:24px;">
          <div style="font-size:12px; font-weight:700; text-transform:uppercase; color:var(--text-muted); margin-bottom:6px;">Farm Scrap Rate (${kpiRange === '30d' ? '30 Days' : kpiRange === 'month' ? 'This Month' : 'All Time'})</div>
          <div class="kpi-value kpi-${status}" data-status="${status}" style="font-size:52px; font-weight:800; font-family:monospace; line-height:1; margin-bottom:8px;">${totals.scrapPct.toFixed(1)}%</div>
          <div style="font-size:13px; font-weight:600; margin-bottom:12px;">
            ${status === 'good' ? '<span class="badge badge-success">✓ Target Met</span>' : status === 'warn' ? '<span class="badge badge-warning">▲ Warning State</span>' : '<span class="badge badge-danger">✗ Over Target</span>'}
            <span style="color:var(--text-muted); margin-left:8px;">Target: under ${targetPct}%</span>
          </div>
          <div style="font-size:12px; color:var(--text-muted); border-top:1px solid var(--border-color); padding-top:10px; display:inline-block;">
            Total Consumed: <strong>${CP.util.fmtNum(totals.consumedG)}g</strong> &bull; Total Scrapped: <strong style="color:var(--status-error);">${CP.util.fmtNum(totals.scrapG)}g</strong>
          </div>
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:20px;">
          <div class="card">
            <div class="card-header"><div><h3 class="card-title">📊 Scrap by Reason</h3><div class="card-subtitle">Grams lost by defect category</div></div></div>
            <div style="padding:14px;">${reasonBarsHtml}</div>
          </div>
          <div class="card">
            <div class="card-header"><div><h3 class="card-title">🖨️ Scrap by Machine (Worst First)</h3><div class="card-subtitle">Sorted by total scrap weight</div></div></div>
            <div class="table-container" style="max-height:360px; overflow-y:auto;">
              <table class="table"><thead><tr><th>#</th><th>Printer</th><th>Scrap</th><th>Incidents</th><th>Share</th></tr></thead><tbody>${printerRowsHtml}</tbody></table>
            </div>
          </div>
        </div>
      </div>`;
  }

  function renderView() {
    if (!root) return;
    let contentHtml = activeTab === 'inspection' ? renderInspectionTab() : activeTab === 'scrap' ? renderScrapTab() : renderKpiTab();
    root.innerHTML = `
      <div class="qc-container">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
          <div><h1 class="page-title" style="margin:0;">🔍 Quality Control &amp; Scrap</h1><div class="page-subtitle" style="margin:2px 0 0 0;">Part dimensional inspection, scrap register, and farm KPI metrics</div></div>
          <div><button type="button" class="btn btn-secondary btn-sm" id="btn-seed-qc-quick">⚡ Seed QC Demo</button></div>
        </div>
        ${renderTabsHeader()}
        ${contentHtml}
      </div>`;
    bindEvents();
  }

  function bindEvents() {
    if (!root) return;
    root.querySelectorAll('.inventory-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => { activeTab = btn.getAttribute('data-tab') || 'inspection'; renderView(); });
    });
    root.querySelector('#btn-seed-qc-quick')?.addEventListener('click', () => {
      if (CP.scrap && typeof CP.scrap.seedScrapData === 'function') {
        CP.scrap.seedScrapData();
        CP.ui.toast('QC and scrap demo data seeded!', 'success');
        renderView();
      }
    });
    root.querySelectorAll('.btn-inspect-part').forEach(btn => {
      btn.addEventListener('click', () => openInspectionModal(btn.getAttribute('data-order-id'), btn.getAttribute('data-part-id')));
    });
    root.querySelectorAll('.btn-reprint-part').forEach(btn => {
      btn.addEventListener('click', () => openReprintModal(btn.getAttribute('data-order-id'), btn.getAttribute('data-part-id')));
    });
    const deductChk = root.querySelector('#scrap-deduct-chk'), spoolContainer = root.querySelector('#scrap-spool-container');
    if (deductChk && spoolContainer) {
      deductChk.addEventListener('change', () => { spoolContainer.style.display = deductChk.checked ? 'block' : 'none'; });
    }
    root.querySelector('#form-manual-scrap')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const printerId = root.querySelector('#scrap-printer')?.value || null;
      const orderId = root.querySelector('#scrap-order')?.value || null;
      const material = root.querySelector('#scrap-material')?.value || 'PLA';
      const grams = Number(root.querySelector('#scrap-grams')?.value) || 0;
      const reason = root.querySelector('#scrap-reason')?.value || 'Other';
      const notes = root.querySelector('#scrap-notes')?.value.trim() || '';
      const shouldDeduct = root.querySelector('#scrap-deduct-chk')?.checked || false;
      const spoolId = root.querySelector('#scrap-spool')?.value || null;
      if (grams <= 0) { CP.ui.toast('Please enter valid scrap grams.', 'warning'); return; }
      if (shouldDeduct && !spoolId) { CP.ui.toast('Please select a spool to deduct scrap from.', 'warning'); return; }

      if (CP.scrap && typeof CP.scrap.add === 'function') {
        CP.scrap.add({ printerId, orderId, material, grams, reason, notes, source: 'manual' });
      }
      if (shouldDeduct && spoolId && CP.inventory && typeof CP.inventory.consume === 'function') {
        CP.inventory.consume(spoolId, grams, { reason: 'scrap', orderId, printerId, note: `Manual scrap deduction (${reason})` });
      }
      CP.ui.toast(`Scrap of ${grams}g recorded successfully.`, 'success');
      renderView();
    });
    const searchInp = root.querySelector('#scrap-search-input');
    if (searchInp) {
      searchInp.addEventListener('input', (e) => {
        scrapSearchQuery = e.target.value;
        renderView();
        const newInp = root.querySelector('#scrap-search-input');
        if (newInp) { newInp.focus(); newInp.selectionStart = newInp.selectionEnd = newInp.value.length; }
      });
    }
    root.querySelectorAll('.btn-kpi-range').forEach(btn => {
      btn.addEventListener('click', () => { kpiRange = btn.getAttribute('data-range') || '30d'; renderView(); });
    });
  }

  function render(rootElement) { root = rootElement; renderView(); }
  function destroy() { root = null; }

  return { render, destroy, openInspectionModal, openReprintModal, isDimensionOk };
})();

CP.registerModule({
  id: 'qc',
  route: '#/qc',
  title: 'QC & Scrap',
  icon: '🔍',
  render: CP.qc.render,
  destroy: CP.qc.destroy
});
