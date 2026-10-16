/**
 * CarbonPrints Company OS - Farm Board Module
 * Global namespace: window.CP
 * 10-Machine FDM farm board with live ticking countdowns, drag-and-drop assignment,
 * touch tablet support, pending queue filtering, job lifecycle events, and OctoPrint telemetry.
 */
window.CP = window.CP || {};

CP.farm = (function () {
  let root = null, timerId = null, materialFilter = 'all';

  function isDueSoon(dueDate) {
    if (!dueDate) return false;
    const dueTime = new Date(dueDate).setHours(23, 59, 59, 999);
    return (dueTime - Date.now()) <= (2 * 24 * 60 * 60 * 1000);
  }

  function getPrinters() {
    let list = CP.store.get('cp_printers', null);
    if (!list || !Array.isArray(list) || list.length === 0) {
      list = CP.defaults ? JSON.parse(JSON.stringify(CP.defaults.printers)) : [];
      if (list.length === 0) {
        for (let i = 1; i <= 10; i++) {
          list.push({ id: i, name: `Printer ${String(i).padStart(2, '0')}`, model: 'Ender 3', status: 'idle', statusNote: '', material: 'PLA', currentJob: null, nozzle: { type: 'brass', installedAt: new Date().toISOString(), gramsExtruded: 0, abrasiveGramsExtruded: 0 }, octoprint: { url: '', apiKey: '' } });
        }
      }
      CP.store.set('cp_printers', list);
    }
    return list;
  }

  function updatePartAndOrder(orderId, partId, partUpdates, orderCheckFn) {
    const orders = CP.store.get('cp_orders', []);
    const order = orders.find(o => o.id === orderId);
    if (order) {
      const part = (order.parts || []).find(p => p.id === partId);
      if (part) Object.assign(part, partUpdates);
      if (typeof orderCheckFn === 'function') orderCheckFn(order);
      order.updatedAt = new Date().toISOString();
      CP.store.set('cp_orders', orders);
    }
  }

  function tick() {
    if (!root) return;
    const cards = root.querySelectorAll('.printer-card[data-status="printing"]'), now = Date.now();
    cards.forEach(card => {
      const startedAt = card.getAttribute('data-started-at'), durationMin = Number(card.getAttribute('data-duration-min')) || 0;
      if (!startedAt || durationMin <= 0) return;
      const startMs = new Date(startedAt).getTime(), totalMs = durationMin * 60000, diffMs = (startMs + totalMs) - now;
      const timeEl = card.querySelector('.countdown-text'), barEl = card.querySelector('.farm-progress-bar'), timerBox = card.querySelector('.printer-card-timer');
      if (diffMs >= 0) {
        const totSec = Math.floor(diffMs / 1000);
        const text = `${CP.util.pad(Math.floor(totSec / 3600))}:${CP.util.pad(Math.floor((totSec % 3600) / 60))}:${CP.util.pad(totSec % 60)} remaining`;
        if (timeEl && timeEl.textContent !== text) timeEl.textContent = text;
        if (barEl) barEl.style.width = `${Math.min(100, Math.max(0, ((now - startMs) / totalMs) * 100)).toFixed(1)}%`;
        if (timerBox) timerBox.classList.remove('is-overdue');
      } else {
        const overdueSec = Math.floor(Math.abs(diffMs) / 1000);
        const text = `Overdue (+${CP.util.pad(Math.floor(overdueSec / 3600))}:${CP.util.pad(Math.floor((overdueSec % 3600) / 60))}:${CP.util.pad(overdueSec % 60)})`;
        if (timeEl && timeEl.textContent !== text) timeEl.textContent = text;
        if (barEl) barEl.style.width = '100%';
        if (timerBox) timerBox.classList.add('is-overdue');
      }
    });
  }

  function updateTelemetryUI(serviceName, printerId) {
    if (!root) return;
    const p = getPrinters().find(x => x.id === printerId);
    if (!p) return;
    const svc = serviceName === 'bambu' ? CP.bambu : CP.octo;
    if (!svc) return;
    const chipSlot = root.querySelector(`.${serviceName}-chip-slot[data-printer-id="${printerId}"]`);
    if (chipSlot) chipSlot.innerHTML = svc.renderCardChip(p);
    const stripSlot = root.querySelector(`.${serviceName}-strip-slot[data-printer-id="${printerId}"]`);
    if (stripSlot) stripSlot.innerHTML = svc.renderCardStrip(p);
    const suggSlot = root.querySelector(`.${serviceName}-suggest-slot[data-printer-id="${printerId}"]`);
    if (suggSlot) suggSlot.innerHTML = svc.renderSuggestion(p);
  }

  function openAssignModal(order, part, printer) {
    if (!order || !part || !printer) return;
    if (printer.status !== 'idle') {
      CP.ui.toast(`Printer ${printer.name} is ${printer.status}. Only idle printers accept jobs.`, 'danger');
      return;
    }
    if (part.status !== 'pending') {
      CP.ui.toast(`Part "${part.name}" is already ${part.status}. Only pending parts can be assigned.`, 'warning');
      return;
    }
    if (order.status !== 'confirmed' && order.status !== 'printing') {
      CP.ui.toast(`Order ${order.id} is ${order.status}. Only confirmed orders accept assignments.`, 'warning');
      return;
    }

    const settings = CP.store.get('cp_settings', CP.defaults ? CP.defaults.settings : {});
    const spools = CP.store.get('cp_spools', []);
    const defaultGrams = Number(part.weightG) * Number(part.qty);
    const estHours = CP.pricing ? CP.pricing.partPrintHours(part, settings) : 1;
    const defaultDurationMin = Math.max(1, Math.round(estHours * 60));
    const qualifying = spools.filter(s => s.material === part.material && s.status === 'active' && Number(s.remainingG) >= defaultGrams);

    const wrapper = document.createElement('div');
    const spoolOpts = qualifying.length > 0 ? qualifying.map(s => `<option value="${s.id}">${s.id} - ${s.color} (${s.brand || 'Vendor'}) [${s.remainingG}g left]</option>`).join('') + '<option value="">-- Start without spool --</option>' : '<option value="">-- Start without spool (no eligible spools) --</option>';
    wrapper.innerHTML = `
      <div class="banner banner-info" style="margin-bottom: 12px;"><div><strong>Assign to ${CP.util.esc(printer.name)} (${CP.util.esc(printer.model)})</strong></div><div style="font-size: 12px; margin-top: 2px;">Part: <strong>${CP.util.esc(part.name)}</strong> &bull; Order: ${CP.util.esc(order.id)} (${CP.util.esc(order.customer?.name || '')})<br>Material: <strong>${CP.util.esc(part.material)}</strong> &bull; Layer: ${CP.util.esc(part.layer)}mm &bull; Qty: ${part.qty} &bull; Weight: ${defaultGrams}g</div></div>
      ${qualifying.length === 0 ? `<div class="banner banner-warning" style="margin-bottom: 12px; font-size: 12px;">⚠️ No active <strong>${CP.util.esc(part.material)}</strong> spools with at least ${defaultGrams}g remaining. You can start without a spool.</div>` : ''}
      <div class="field"><label>Allocated Spool:</label><select class="select" id="assign-spool">${spoolOpts}</select></div>
      <div class="field"><label>Planned Grams to Extrude (g):</label><input type="number" class="input" id="assign-grams" min="1" step="1" value="${defaultGrams}"></div>
      <div class="field"><label>Estimated Duration (Minutes):</label><input type="number" class="input" id="assign-duration" min="1" step="1" value="${defaultDurationMin}"><span class="help-text">Speed profile: ~${estHours} hr(s) (${defaultDurationMin} min)</span></div>
    `;

    CP.ui.modal({
      title: `Assign Job to ${printer.name}`,
      bodyNode: wrapper,
      buttons: [
        { label: 'Cancel', kind: 'btn-secondary' },
        { label: '🎋 Slicer Handoff', kind: 'btn-secondary', onClick: () => { if (CP.bambu) CP.bambu.openInStudio(part, order, printer.bambu?.bridgeUrl); return false; } },
        {
          label: 'Confirm & Start Print',
          kind: 'btn-primary',
          onClick: () => {
            const gramsPlanned = Number(wrapper.querySelector('#assign-grams')?.value);
            const durationMin = Number(wrapper.querySelector('#assign-duration')?.value);
            const spoolId = wrapper.querySelector('#assign-spool')?.value || null;
            if (isNaN(gramsPlanned) || gramsPlanned <= 0) { CP.ui.toast('Please enter valid planned grams (> 0g).', 'danger'); return false; }
            if (isNaN(durationMin) || durationMin <= 0) { CP.ui.toast('Please enter a valid duration (> 0 min).', 'danger'); return false; }
            if (!spoolId) {
              CP.ui.confirm('No spool allocated for this job. Start without allocating a spool?').then(ok => {
                if (ok) executeAssignment(order.id, part.id, printer.id, null, gramsPlanned, durationMin);
              });
              return true;
            }
            executeAssignment(order.id, part.id, printer.id, spoolId, gramsPlanned, durationMin);
            return true;
          }
        }
      ]
    });
  }

  function executeAssignment(orderId, partId, printerId, spoolId, gramsPlanned, durationMin) {
    const printers = getPrinters();
    const printer = printers.find(p => p.id === Number(printerId));
    if (!printer || printer.status !== 'idle') { CP.ui.toast('Printer is not idle!', 'danger'); return; }

    const orders = CP.store.get('cp_orders', []);
    const order = orders.find(o => o.id === orderId);
    const part = order ? (order.parts || []).find(p => p.id === partId) : null;
    if (!part || part.status !== 'pending') { CP.ui.toast(`Part is not in pending state (${part ? part.status : 'missing'})!`, 'danger'); return; }

    const nowISO = new Date().toISOString();
    const jobRunId = `${orderId}_${partId}_${Date.now()}`;
    printer.status = 'printing';
    printer.statusNote = '';
    printer.material = part.material;
    printer.currentJob = { orderId: order.id, partId, partName: part.name, material: part.material, spoolId, gramsPlanned, startedAt: nowISO, durationMin, jobRunId };

    part.status = 'printing';
    part.assignedPrinterId = printer.id;
    part.spoolId = spoolId;
    if (order.status === 'confirmed') order.status = 'printing';
    order.updatedAt = nowISO;

    CP.store.set('cp_orders', orders);
    CP.store.set('cp_printers', printers);
    CP.ui.toast(`Started print on ${printer.name}`, 'success');
    renderView();
  }

  function openPendingChooserModal(printer) {
    const orders = CP.store.get('cp_orders', []), settings = CP.store.get('cp_settings', CP.defaults ? CP.defaults.settings : {});
    const pending = [];
    orders.forEach(o => {
      if (o.status === 'confirmed' || o.status === 'printing' || (o.parts && o.parts.some(p => p.status === 'pending'))) {
        (o.parts || []).forEach(p => { if (p.status === 'pending') pending.push({ order: o, part: p }); });
      }
    });
    if (pending.length === 0) { CP.ui.toast('No pending parts in confirmed orders.', 'info'); return; }
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'display:flex; flex-direction:column; gap:8px; max-height:360px; overflow-y:auto;';
    pending.forEach(item => {
      const chip = document.createElement('div');
      chip.className = 'queue-chip';
      chip.style.cursor = 'pointer';
      const estH = CP.pricing ? CP.pricing.partPrintHours(item.part, settings) : 1;
      chip.innerHTML = `<div class="queue-chip-header"><span class="queue-chip-part">${CP.util.esc(item.part.name)}</span><span class="queue-chip-order">${CP.util.esc(item.order.id)}</span></div><div class="queue-chip-customer">${CP.util.esc(item.order.customer?.name || '')}</div><div class="queue-chip-meta"><span class="queue-chip-tag">${CP.util.esc(item.part.material)}</span><span class="queue-chip-tag">${CP.util.esc(item.part.layer)}mm</span><span class="queue-chip-tag">${item.part.weightG * item.part.qty}g</span><span class="queue-chip-tag">~${estH}h</span></div>`;
      chip.addEventListener('click', () => { if (modalRef) modalRef.close(); openAssignModal(item.order, item.part, printer); });
      wrapper.appendChild(chip);
    });
    const modalRef = CP.ui.modal({ title: `Select Pending Part for ${printer.name}`, bodyNode: wrapper, buttons: [{ label: 'Cancel', kind: 'btn-secondary' }] });
  }

  function openIdlePrinterChooserModal(order, part) {
    const idlePrinters = getPrinters().filter(p => p.status === 'idle');
    if (idlePrinters.length === 0) { CP.ui.toast('No idle printers available right now.', 'warning'); return; }
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'display:grid; grid-template-columns:repeat(2, 1fr); gap:8px;';
    idlePrinters.forEach(p => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-secondary';
      btn.style.cssText = 'min-height:48px; flex-direction:column; align-items:flex-start; justify-content:center; padding:6px 10px;';
      btn.innerHTML = `<span style="font-weight:700; font-size:13px;">${CP.util.esc(p.name)}</span><span style="font-size:11px; color:var(--text-muted);">${CP.util.esc(p.model)} &bull; ${CP.util.esc(p.material || 'Idle')}</span>`;
      btn.addEventListener('click', () => { if (modalRef) modalRef.close(); openAssignModal(order, part, p); });
      wrapper.appendChild(btn);
    });
    const modalRef = CP.ui.modal({ title: `Assign "${part.name}" to Printer`, bodyNode: wrapper, buttons: [{ label: 'Cancel', kind: 'btn-secondary' }] });
  }

  function openCompleteModal(printer) {
    const job = printer.currentJob;
    if (!job || printer.status !== 'printing') {
      CP.ui.toast(`Printer ${printer.name} is not currently printing.`, 'warning');
      return;
    }
    const wrapper = document.createElement('div');
    wrapper.innerHTML = `
      <div class="banner banner-info" style="margin-bottom:12px;"><div><strong>${CP.util.esc(job.partName)}</strong> (${CP.util.esc(job.orderId)})</div><div style="font-size:12px;">Material: ${CP.util.esc(job.material)} &bull; Planned: ${job.gramsPlanned}g</div></div>
      <div class="field"><label>Actual Grams Extruded (g):</label><input type="number" class="input" id="comp-actual-g" min="0.1" step="0.1" value="${job.gramsPlanned}"><span class="help-text">Includes part, purge lines, and supports.</span></div>`;
    CP.ui.modal({
      title: `Mark Completed - ${printer.name}`, bodyNode: wrapper,
      buttons: [
        { label: 'Cancel', kind: 'btn-secondary' },
        {
          label: 'Complete & Move to Post', kind: 'btn-primary',
          onClick: () => {
            const gramsActual = Number(wrapper.querySelector('#comp-actual-g')?.value) || job.gramsPlanned;
            if (isNaN(gramsActual) || gramsActual <= 0) { CP.ui.toast('Enter valid actual grams (> 0).', 'danger'); return false; }
            const jobRunId = job.jobRunId || `${job.orderId}_${job.partId}_${job.startedAt}`;
            const payload = { printerId: printer.id, orderId: job.orderId, partId: job.partId, spoolId: job.spoolId || null, material: job.material, gramsPlanned: Number(job.gramsPlanned), gramsActual: Number(gramsActual), startedAt: job.startedAt, jobRunId };
            updatePartAndOrder(job.orderId, job.partId, { status: 'done' }, (order) => {
              if (order.parts.every(p => p.status === 'done')) order.status = 'post';
            });
            const printers = getPrinters(), pr = printers.find(p => p.id === printer.id);
            if (pr) { pr.status = 'post'; pr.currentJob = null; CP.store.set('cp_printers', printers); }
            if (CP.bus) CP.bus.emit('job:completed', payload);
            CP.ui.toast(`${printer.name} job marked completed. In post-processing.`, 'success');
            renderView();
            return true;
          }
        }
      ]
    });
  }

  function openFailedModal(printer) {
    const job = printer.currentJob;
    if (!job || printer.status !== 'printing') {
      CP.ui.toast(`Printer ${printer.name} is not currently printing.`, 'warning');
      return;
    }
    const reasons = ['Spaghetti', 'Warping', 'Layer shift', 'Nozzle clog', 'Bed adhesion', 'Power cut', 'Other'];
    const optionsHtml = reasons.map(r => `<option value="${r}">${r}</option>`).join('');
    const wrapper = document.createElement('div');
    wrapper.innerHTML = `
      <div class="banner banner-danger" style="margin-bottom:12px;"><div><strong>Failure: ${CP.util.esc(job.partName)}</strong> (${CP.util.esc(job.orderId)})</div><div style="font-size:12px;">The part will be returned to the Pending Queue for reprint.</div></div>
      <div class="field"><label>Failed Grams Lost (g):</label><input type="number" class="input" id="fail-grams" min="1" step="1" value="${job.gramsPlanned}"></div>
      <div class="field"><label>Failure Reason:</label><select class="select" id="fail-reason">${optionsHtml}</select></div>
      <div class="field"><label>Notes / Observations:</label><textarea class="textarea" id="fail-notes" placeholder="e.g. Detached from bed at 40%..."></textarea></div>
    `;
    CP.ui.modal({
      title: `Mark Failed - ${printer.name}`,
      bodyNode: wrapper,
      buttons: [
        { label: 'Cancel', kind: 'btn-secondary' },
        {
          label: 'Confirm Failure', kind: 'btn-danger',
          onClick: () => {
            const failedG = Number(wrapper.querySelector('#fail-grams')?.value) || job.gramsPlanned;
            if (isNaN(failedG) || failedG <= 0) { CP.ui.toast('Enter valid failed grams (> 0).', 'danger'); return false; }
            const reason = wrapper.querySelector('#fail-reason')?.value || 'Other';
            const notes = wrapper.querySelector('#fail-notes')?.value.trim() || '';
            const jobRunId = job.jobRunId || `${job.orderId}_${job.partId}_${job.startedAt}`;
            const payload = { printerId: printer.id, orderId: job.orderId, partId: job.partId, spoolId: job.spoolId || null, material: job.material, failedG: Number(failedG), reason, notes, startedAt: job.startedAt, jobRunId };
            updatePartAndOrder(job.orderId, job.partId, { status: 'pending', assignedPrinterId: null, spoolId: null });
            const printers = getPrinters(), pr = printers.find(p => p.id === printer.id);
            if (pr) {
              if (reason === 'Nozzle clog') { pr.status = 'error'; pr.statusNote = `Nozzle clog${notes ? ': ' + notes : ''}`; }
              else { pr.status = 'idle'; pr.statusNote = ''; }
              pr.currentJob = null;
              CP.store.set('cp_printers', printers);
            }
            if (CP.bus) CP.bus.emit('job:failed', payload);
            CP.ui.toast(`Job marked failed (${reason}). Part re-queued for reprint.`, 'warning');
            renderView();
            return true;
          }
        }
      ]
    });
  }

  async function withJobDiscardConfirm(printer, actionFn) {
    if (printer.status === 'printing' && printer.currentJob) {
      const ok = await CP.ui.confirm(`Printer ${printer.name} is printing "${printer.currentJob.partName}". Discard this running job?`);
      if (!ok) return;
      updatePartAndOrder(printer.currentJob.orderId, printer.currentJob.partId, { status: 'pending', assignedPrinterId: null, spoolId: null });
    }
    actionFn();
  }

  function renderView() {
    if (!root) return;
    const printers = getPrinters(), orders = CP.store.get('cp_orders', []), settings = CP.store.get('cp_settings', CP.defaults ? CP.defaults.settings : {});
    const materialsList = (settings && settings.materials) ? settings.materials : ['PLA', 'ABS', 'TPU'];

    const pendingItems = [];
    orders.forEach(o => {
      if (o.status === 'confirmed' || o.status === 'printing' || (o.parts && o.parts.some(p => p.status === 'pending'))) {
        (o.parts || []).forEach(p => { if (p.status === 'pending') pendingItems.push({ order: o, part: p }); });
      }
    });

    pendingItems.sort((a, b) => {
      const aDue = a.order.dueDate ? new Date(a.order.dueDate).getTime() : Infinity;
      const bDue = b.order.dueDate ? new Date(b.order.dueDate).getTime() : Infinity;
      if (aDue !== bDue) return aDue - bDue;
      return (new Date(a.order.createdAt || 0)).getTime() - (new Date(b.order.createdAt || 0)).getTime();
    });

    const filteredPending = pendingItems.filter(item => materialFilter === 'all' || item.part.material === materialFilter);
    const counts = { idle: 0, printing: 0, post: 0, maint: 0, error: 0 };
    printers.forEach(p => { if (counts[p.status] !== undefined) counts[p.status]++; });
    const matOptions = ['all', ...materialsList].map(m => `<option value="${CP.util.esc(m)}" ${materialFilter === m ? 'selected' : ''}>${m === 'all' ? 'All Materials' : CP.util.esc(m)}</option>`).join('');

    root.innerHTML = `
      <div class="farm-header-bar">
        <div class="farm-legend">
          <span class="farm-legend-title">Status:</span>
          <span class="farm-legend-item"><span class="legend-dot dot-idle"></span> Ready (${counts.idle})</span><span class="farm-legend-item"><span class="legend-dot dot-printing"></span> Printing (${counts.printing})</span><span class="farm-legend-item"><span class="legend-dot dot-post"></span> Post (${counts.post})</span><span class="farm-legend-item"><span class="legend-dot dot-maint"></span> Maint (${counts.maint})</span><span class="farm-legend-item"><span class="legend-dot dot-error"></span> Error (${counts.error})</span>
        </div>
        <div><button type="button" class="btn btn-secondary btn-sm" id="btn-seed-farm-quick">⚡ Seed Farm Demo</button></div>
      </div>

      <div class="farm-layout">
        <div class="pending-queue-col">
          <div class="pending-queue-header"><h3 class="pending-queue-title"><span>📥 Pending Queue</span><span class="badge badge-default">${filteredPending.length}</span></h3></div>
          <div class="pending-queue-filter"><select class="select" id="queue-material-filter">${matOptions}</select></div>
          <div class="pending-queue-list">
            ${filteredPending.length === 0 ? `<div class="empty-state" style="padding:24px 8px;"><div class="empty-state-icon" style="font-size:24px;">📭</div><div class="empty-state-title" style="font-size:13px;">No Pending Parts</div><div class="empty-state-text" style="font-size:11px;">Confirmed orders with pending parts appear here.</div></div>` : filteredPending.map(item => {
              const estH = CP.pricing ? CP.pricing.partPrintHours(item.part, settings) : 1;
              const dueSoon = isDueSoon(item.order.dueDate);
              const dueText = item.order.dueDate ? CP.util.fmtDate(item.order.dueDate) : 'No due date';
              const totalG = (Number(item.part.weightG) || 0) * (Number(item.part.qty) || 1);
              return `
                <div class="queue-chip" draggable="true" data-order-id="${CP.util.esc(item.order.id)}" data-part-id="${CP.util.esc(item.part.id)}">
                  <div class="queue-chip-header"><span class="queue-chip-part">${CP.util.esc(item.part.name)}</span><span class="queue-chip-order">${CP.util.esc(item.order.id)}</span></div>
                  <div class="queue-chip-customer">${CP.util.esc(item.order.customer?.name || 'Customer')}</div>
                  <div class="queue-chip-meta"><span class="queue-chip-tag">${CP.util.esc(item.part.material)}</span><span class="queue-chip-tag">${CP.util.esc(item.part.layer)}mm</span><span class="queue-chip-tag">${totalG}g (${item.part.weightG}g × ${item.part.qty})</span><span class="queue-chip-tag">~${estH}h</span></div>
                  <div class="queue-chip-footer">
                    <div><span>${CP.util.esc(dueText)}</span>${dueSoon ? '<span class="badge badge-due-soon" style="margin-left:4px;">Due soon</span>' : ''}</div>
                    <div style="display:flex; gap:4px;">
                      <button type="button" class="btn btn-secondary btn-sm btn-chip-bambu" data-order-id="${CP.util.esc(item.order.id)}" data-part-id="${CP.util.esc(item.part.id)}" title="Open in Bambu Studio" style="min-height:28px; padding:0 8px; font-size:11px;">🎋 Bambu</button>
                      <button type="button" class="btn btn-secondary btn-sm btn-chip-assign" data-order-id="${CP.util.esc(item.order.id)}" data-part-id="${CP.util.esc(item.part.id)}" style="min-height:28px; padding:0 8px; font-size:11px;">Assign...</button>
                    </div>
                  </div>
                </div>`;
            }).join('')}
          </div>
        </div>

        <div class="printers-grid">
          ${printers.map(p => {
            const job = p.currentJob;
            let body = '', actions = '';
            if (p.status === 'idle') {
              body = `<div class="printer-idle-box"><div class="printer-idle-icon">🖨️</div><div class="printer-idle-label">Ready / Idle</div><div class="printer-idle-hint">Drag part here or click Assign</div></div>`;
              actions = `<button type="button" class="btn btn-primary btn-card-assign" data-printer-id="${p.id}">Assign</button>`;
            } else if (p.status === 'printing' && job) {
              const order = orders.find(o => o.id === job.orderId);
              body = `<div class="printer-printing-box"><div class="printing-part-name" title="${CP.util.esc(job.partName)}">${CP.util.esc(job.partName)}</div><div class="printing-order-meta">${CP.util.esc(job.orderId)}${order?.customer?.name ? ' • ' + CP.util.esc(order.customer.name) : ''}</div><div class="printing-plan-meta"><span>Mat: <strong>${CP.util.esc(job.material)}</strong></span><span>Plan: <strong>${job.gramsPlanned}g</strong></span></div><div class="printer-card-timer"><div class="countdown-row"><span class="countdown-text">Calculating...</span></div><div class="farm-progress"><div class="farm-progress-bar" style="width:0%;"></div></div></div></div>`;
              actions = `<button type="button" class="btn btn-secondary btn-sm btn-mark-completed" data-printer-id="${p.id}">Complete</button><button type="button" class="btn btn-danger btn-sm btn-mark-failed" data-printer-id="${p.id}">Fail</button>`;
            } else if (p.status === 'post') {
              body = `<div class="printer-post-box"><div class="printer-post-icon">✨</div><div class="printer-post-label">Post-processing</div><div class="printer-post-hint">Part cleaning, support removal & cure</div></div>`;
              actions = `<button type="button" class="btn btn-primary btn-post-done" data-printer-id="${p.id}">Done</button>`;
            } else if (p.status === 'maint') {
              body = `<div class="printer-maint-box"><div class="printer-maint-icon">🔧</div><div class="printer-maint-label">Maintenance</div><div class="printer-maint-note">${CP.util.esc(p.statusNote || 'Routine service in progress')}</div></div>`;
              actions = `<button type="button" class="btn btn-secondary btn-mark-ready" data-printer-id="${p.id}">Mark Ready</button>`;
            } else if (p.status === 'error') {
              body = `<div class="printer-error-box"><div class="printer-error-icon">⚠️</div><div class="printer-error-label">Printer Error</div><div class="printer-error-note">${CP.util.esc(p.statusNote || 'Fault detected')}</div></div>`;
              actions = `<button type="button" class="btn btn-secondary btn-mark-ready" data-printer-id="${p.id}">Clear Error</button>`;
            }

            return `
              <div class="printer-card" data-printer-id="${p.id}" data-status="${p.status}" ${p.status === 'printing' && job ? `data-started-at="${job.startedAt}" data-duration-min="${job.durationMin}"` : ''}>
                <div class="printer-card-top">
                  <div><span class="printer-card-name">${CP.util.esc(p.name)}</span><span class="printer-card-model">${CP.util.esc(p.model)}</span></div>
                  <div style="display:flex; align-items:center; gap:4px;">
                    <div class="octo-chip-slot" data-printer-id="${p.id}">${CP.octo ? CP.octo.renderCardChip(p) : ''}</div>
                    <div class="bambu-chip-slot" data-printer-id="${p.id}">${CP.bambu ? CP.bambu.renderCardChip(p) : ''}</div>
                    <span class="printer-card-mat">${CP.util.esc(p.material || 'PLA')}</span>
                    <span class="badge badge-status-${p.status}">${p.status.toUpperCase()}</span>
                  </div>
                </div>
                <div class="octo-strip-slot" data-printer-id="${p.id}">${CP.octo ? CP.octo.renderCardStrip(p) : ''}</div>
                <div class="bambu-strip-slot" data-printer-id="${p.id}">${CP.bambu ? CP.bambu.renderCardStrip(p) : ''}</div>
                <div class="octo-suggest-slot" data-printer-id="${p.id}">${CP.octo ? CP.octo.renderSuggestion(p) : ''}</div>
                <div class="bambu-suggest-slot" data-printer-id="${p.id}">${CP.bambu ? CP.bambu.renderSuggestion(p) : ''}</div>
                <div class="printer-card-body">${body}</div>
                <div>
                  <div class="printer-card-actions">${actions}</div>
                  <div class="printer-card-aux">
                    <button type="button" class="btn-flag-maint" data-printer-id="${p.id}">Maint</button>
                    <button type="button" class="btn-flag-error" data-printer-id="${p.id}">Error</button>
                    ${p.status !== 'idle' ? `<button type="button" class="btn-mark-ready" data-printer-id="${p.id}">Reset</button>` : ''}
                  </div>
                </div>
              </div>`;
          }).join('')}
        </div>
      </div>
    `;

    bindEvents();
    tick();
  }

  function bindEvents() {
    if (!root) return;

    root.querySelector('#queue-material-filter')?.addEventListener('change', (e) => { materialFilter = e.target.value; renderView(); });
    root.querySelector('#btn-seed-farm-quick')?.addEventListener('click', () => { seedFarmData(); CP.ui.toast('Realistic farm board demo seeded!', 'success'); renderView(); });

    root.querySelectorAll('.queue-chip').forEach(chip => {
      chip.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', JSON.stringify({ orderId: chip.getAttribute('data-order-id'), partId: chip.getAttribute('data-part-id') }));
        e.dataTransfer.effectAllowed = 'copyMove';
        chip.classList.add('is-dragging');
      });
      chip.addEventListener('dragend', () => chip.classList.remove('is-dragging'));
    });

    root.querySelectorAll('.btn-chip-assign').forEach(btn => {
      btn.addEventListener('click', () => {
        const order = (CP.store.get('cp_orders', [])).find(o => o.id === btn.getAttribute('data-order-id'));
        const part = order ? (order.parts || []).find(p => p.id === btn.getAttribute('data-part-id')) : null;
        if (order && part) openIdlePrinterChooserModal(order, part);
      });
    });

    root.querySelectorAll('.printer-card').forEach(card => {
      const printerId = Number(card.getAttribute('data-printer-id')), status = card.getAttribute('data-status');
      if (status === 'idle') {
        card.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; card.classList.add('drag-over'); });
        card.addEventListener('dragleave', () => card.classList.remove('drag-over'));
        card.addEventListener('drop', (e) => {
          e.preventDefault(); card.classList.remove('drag-over');
          try {
            const data = JSON.parse(e.dataTransfer.getData('text/plain'));
            const order = (CP.store.get('cp_orders', [])).find(o => o.id === data.orderId);
            const part = order ? (order.parts || []).find(p => p.id === data.partId) : null;
            const printer = getPrinters().find(p => p.id === printerId);
            if (order && part && printer) openAssignModal(order, part, printer);
          } catch (err) { console.error('Drop error:', err); }
        });
      } else {
        card.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'none'; card.classList.add('drag-over-reject'); });
        card.addEventListener('dragleave', () => card.classList.remove('drag-over-reject'));
        card.addEventListener('drop', (e) => {
          e.preventDefault(); card.classList.remove('drag-over-reject');
          const printer = getPrinters().find(p => p.id === printerId);
          CP.ui.toast(`Printer ${printer ? printer.name : 'card'} is not idle (${status})!`, 'danger');
        });
      }
    });

    root.querySelector('.pending-queue-list')?.addEventListener('click', (e) => {
      const bBtn = e.target.closest('.btn-chip-bambu');
      if (bBtn) {
        const orderId = bBtn.getAttribute('data-order-id');
        const partId = bBtn.getAttribute('data-part-id');
        const orders = CP.store.get('cp_orders', []);
        const order = orders.find(o => o.id === orderId);
        const part = (order?.parts || []).find(p => p.id === partId);
        if (part && CP.bambu) {
          CP.bambu.openInStudio(part, order);
        }
      }
    });

    root.querySelector('.printers-grid')?.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-printer-id]');
      if (!btn) return;
      const printerId = Number(btn.getAttribute('data-printer-id'));
      const printer = getPrinters().find(p => p.id === printerId);
      if (!printer) return;

      if (btn.classList.contains('btn-octo-retry') || btn.classList.contains('btn-octo-retry-link')) {
        if (CP.octo) CP.octo.retry(printerId, (id) => updateTelemetryUI('octo', id));
      } else if (btn.classList.contains('btn-bambu-retry') || btn.classList.contains('btn-bambu-retry-link')) {
        if (CP.bambu) CP.bambu.retry(printerId, (id) => updateTelemetryUI('bambu', id));
      } else if (btn.classList.contains('btn-octo-suggest-complete') || btn.classList.contains('btn-bambu-suggest-complete')) {
        openCompleteModal(printer);
      } else if (btn.classList.contains('btn-card-assign')) openPendingChooserModal(printer);
      else if (btn.classList.contains('btn-mark-completed')) openCompleteModal(printer);
      else if (btn.classList.contains('btn-mark-failed')) openFailedModal(printer);
      else if (btn.classList.contains('btn-post-done')) {
        const prs = getPrinters(), pr = prs.find(p => p.id === printerId);
        if (pr) { pr.status = 'idle'; pr.statusNote = ''; pr.currentJob = null; CP.store.set('cp_printers', prs); CP.ui.toast(`${pr.name} post-processing complete. Ready for jobs.`, 'success'); renderView(); }
      } else if (btn.classList.contains('btn-flag-maint')) {
        withJobDiscardConfirm(printer, async () => {
          const reason = await CP.ui.prompt(`Enter maintenance task for ${printer.name}:`, printer.statusNote || 'Routine service');
          if (reason !== null) {
            const prs = getPrinters(), p = prs.find(x => x.id === printerId);
            if (p) { p.status = 'maint'; p.statusNote = reason.trim() || 'Routine check'; p.currentJob = null; CP.store.set('cp_printers', prs); CP.ui.toast(`${printer.name} flagged for maintenance.`, 'warning'); renderView(); }
          }
        });
      } else if (btn.classList.contains('btn-flag-error')) {
        withJobDiscardConfirm(printer, async () => {
          const reason = await CP.ui.prompt(`Enter error/fault for ${printer.name}:`, printer.statusNote || 'Hardware fault');
          if (reason !== null) {
            const prs = getPrinters(), p = prs.find(x => x.id === printerId);
            if (p) { p.status = 'error'; p.statusNote = reason.trim() || 'Hardware error'; p.currentJob = null; CP.store.set('cp_printers', prs); CP.ui.toast(`${printer.name} marked with error.`, 'danger'); renderView(); }
          }
        });
      } else if (btn.classList.contains('btn-mark-ready')) {
        withJobDiscardConfirm(printer, () => {
          const prs = getPrinters(), p = prs.find(x => x.id === printerId);
          if (p) { p.status = 'idle'; p.statusNote = ''; p.currentJob = null; CP.store.set('cp_printers', prs); CP.ui.toast(`${printer.name} is now Ready / Idle.`, 'success'); renderView(); }
        });
      }
    });
  }

  function seedFarmData() {
    if (CP.dev && typeof CP.dev.seedFarmData === 'function') {
      CP.dev.seedFarmData();
    }
  }

  function render(rootElement) {
    root = rootElement;
    renderView();
    if (timerId) clearInterval(timerId);
    timerId = setInterval(tick, 1000);
    if (CP.octo) CP.octo.startPolling((id) => updateTelemetryUI('octo', id));
    if (CP.bambu) CP.bambu.startPolling((id) => updateTelemetryUI('bambu', id));
  }

  function destroy() {
    if (timerId) { clearInterval(timerId); timerId = null; }
    if (CP.octo) CP.octo.stopPolling();
    if (CP.bambu) CP.bambu.stopPolling();
    root = null;
  }

  return { render, destroy, seedFarmData };
})();

CP.registerModule({
  id: 'farm',
  route: '#/farm',
  title: 'Farm Board',
  icon: '🖨️',
  render: CP.farm.render,
  destroy: CP.farm.destroy
});

if (CP.dev && typeof CP.dev.registerSeeder === 'function') {
  CP.dev.registerSeeder(CP.farm.seedFarmData);
}
