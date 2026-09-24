/**
 * CarbonPrints Company OS - Spools & Stock Inventory Module
 * Global namespace: window.CP
 * Manages physical spools, consumption ledger, reorder alerts,
 * 14-day daily consumption CSS chart, and Chennai supplier wholesale price tracker.
 */
window.CP = window.CP || {};

CP.inventoryModule = (function () {
  let root = null, activeTab = 'spools', materialFilter = 'all', statusFilter = 'active', busUnsub = null;

  function getSpools() { return CP.store.get('cp_spools', []); }
  function getPrinters() { return CP.store.get('cp_printers', []); }
  function getSettings() { return CP.store.get('cp_settings', CP.defaults ? CP.defaults.settings : {}); }

  // --- TAB 1: SPOOL LEDGER ---

  function openAddSpoolModal() {
    const settings = getSettings();
    const materials = (settings && settings.materials) ? settings.materials : ['PLA', 'ABS', 'TPU'];
    const today = CP.util.todayISO ? CP.util.todayISO() : new Date().toISOString().split('T')[0];
    let currentMat = materials[0] || 'PLA';

    function getPreviewId(mat) {
      const counters = CP.store.get('cp_counters', {});
      const spools = getSpools();
      let maxSeq = Number(counters[`spool:${mat}`]) || 0;
      const regex = new RegExp(`^SP-${mat}-(\\d+)$`, 'i');
      spools.forEach(s => {
        const m = (s.id || '').match(regex);
        if (m) { const n = parseInt(m[1], 10); if (n > maxSeq) maxSeq = n; }
      });
      return `SP-${mat}-${CP.util.pad(maxSeq + 1, 2)}`;
    }

    const wrapper = document.createElement('div');
    wrapper.innerHTML = `
      <div class="banner banner-info" style="margin-bottom: 12px; font-size: 13px;">Generated Spool ID: <strong id="add-spool-preview-id" class="font-mono" style="font-size: 14px; color: var(--primary);">${getPreviewId(currentMat)}</strong></div>
      <div class="field"><label>Material:</label><select class="select" id="add-spool-mat">${materials.map(m => `<option value="${CP.util.esc(m)}">${CP.util.esc(m)}</option>`).join('')}</select></div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
        <div class="field"><label>Filament Color:</label><input type="text" class="input" id="add-spool-color" placeholder="e.g. Jet Black" value="Jet Black"></div>
        <div class="field"><label>Brand / Manufacturer:</label><input type="text" class="input" id="add-spool-brand" placeholder="e.g. Numakers" value="Numakers"></div>
      </div>
      <div class="field"><label>Chennai Supplier:</label><input type="text" class="input" id="add-spool-supplier" list="supplier-datalist" placeholder="e.g. Parrys Chennai" value="Parrys Chennai"><datalist id="supplier-datalist"><option value="Parrys Chennai"></option><option value="Ambattur Chennai"></option><option value="Guindy Industrial Estate"></option></datalist></div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
        <div class="field"><label>Initial Net Weight (g):</label><input type="number" class="input" id="add-spool-grams" min="1" step="50" value="1000"></div>
        <div class="field"><label>Total Cost (INR ₹):</label><input type="number" class="input" id="add-spool-cost" min="0" step="10" value="850"></div>
      </div>
      <div class="field"><label>Purchase Date:</label><input type="date" class="input" id="add-spool-date" value="${today}"></div>
    `;

    const matSelect = wrapper.querySelector('#add-spool-mat');
    const previewEl = wrapper.querySelector('#add-spool-preview-id');
    matSelect.addEventListener('change', () => {
      currentMat = matSelect.value;
      if (previewEl) previewEl.textContent = getPreviewId(currentMat);
    });

    CP.ui.modal({
      title: '🧵 Add New Filament Spool',
      bodyNode: wrapper,
      buttons: [
        { label: 'Cancel', kind: 'btn-secondary' },
        {
          label: 'Create Spool & Add to Stock', kind: 'btn-primary',
          onClick: () => {
            const material = matSelect.value, color = wrapper.querySelector('#add-spool-color')?.value.trim();
            const brand = wrapper.querySelector('#add-spool-brand')?.value.trim(), supplier = wrapper.querySelector('#add-spool-supplier')?.value.trim();
            const initialG = Number(wrapper.querySelector('#add-spool-grams')?.value), costINR = Number(wrapper.querySelector('#add-spool-cost')?.value);
            const purchasedAt = wrapper.querySelector('#add-spool-date')?.value;

            if (!color) { CP.ui.toast('Please enter a color.', 'danger'); return false; }
            if (isNaN(initialG) || initialG <= 0) { CP.ui.toast('Initial weight must be > 0 grams.', 'danger'); return false; }
            if (isNaN(costINR) || costINR < 0) { CP.ui.toast('Cost must be a valid non-negative number.', 'danger'); return false; }

            const newSpool = CP.inventory.addSpool({ material, color, brand, supplier, initialG, costINR, purchasedAt: purchasedAt ? new Date(purchasedAt).toISOString() : new Date().toISOString() });
            CP.ui.toast(`Created spool ${newSpool.id} (${newSpool.color} ${newSpool.material})`, 'success');
            renderView();
            return true;
          }
        }
      ]
    });
  }

  function openLoadModal(spool) {
    const printers = getPrinters(), wrapper = document.createElement('div');
    wrapper.style.cssText = 'display: grid; grid-template-columns: 1fr 1fr; gap: 8px; max-height: 380px; overflow-y: auto;';

    printers.forEach(p => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-secondary';
      btn.style.cssText = 'min-height: 48px; flex-direction: column; align-items: flex-start; justify-content: center; padding: 6px 10px;';
      const isCur = spool.loadedOnPrinterId === p.id;
      btn.innerHTML = `<span style="font-weight: 700; font-size: 13px;">${CP.util.esc(p.name)} ${isCur ? '(Currently Loaded)' : ''}</span><span style="font-size: 11px; color: var(--text-muted);">${CP.util.esc(p.model)} &bull; ${CP.util.esc(p.status)} &bull; ${CP.util.esc(p.material || 'None')}</span>`;
      btn.addEventListener('click', async () => {
        if (modalRef) modalRef.close();
        await CP.inventory.loadSpoolOnPrinter(spool.id, p.id);
        renderView();
      });
      wrapper.appendChild(btn);
    });

    const modalRef = CP.ui.modal({ title: `Load ${spool.id} onto Printer`, bodyNode: wrapper, buttons: [{ label: 'Cancel', kind: 'btn-secondary' }] });
  }

  function openAdjustModal(spool) {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = `
      <div class="banner banner-info" style="margin-bottom: 12px; font-size: 13px;"><strong>${CP.util.esc(spool.id)}</strong> &bull; ${CP.util.esc(spool.color)} ${CP.util.esc(spool.material)}<br>Current remaining weight: <strong>${spool.remainingG} g</strong> (Initial: ${spool.initialG}g)</div>
      <div class="field"><label>Actual Measured Weight (g):</label><input type="number" class="input" id="adj-new-grams" min="0" step="1" value="${spool.remainingG}"><span class="help-text">Weigh the spool on the shop scale and enter net filament weight.</span></div>
      <div class="field"><label>Adjustment Reason / Note:</label><input type="text" class="input" id="adj-note" placeholder="e.g. Scale audit, calibration purge..."></div>
    `;

    CP.ui.modal({
      title: `Adjust Spool Weight - ${spool.id}`,
      bodyNode: wrapper,
      buttons: [
        { label: 'Cancel', kind: 'btn-secondary' },
        {
          label: 'Save Adjustment', kind: 'btn-primary',
          onClick: () => {
            const newG = Number(wrapper.querySelector('#adj-new-grams')?.value);
            const note = wrapper.querySelector('#adj-note')?.value.trim() || 'Manual stock adjustment';
            if (isNaN(newG) || newG < 0) { CP.ui.toast('Please enter a valid non-negative weight.', 'danger'); return false; }
            CP.inventory.adjust(spool.id, newG, note);
            CP.ui.toast(`Updated ${spool.id} remaining weight to ${newG}g`, 'success');
            renderView();
            return true;
          }
        }
      ]
    });
  }

  function openHistoryModal(spool) {
    const ledger = CP.store.get('cp_ledger', []);
    const entries = ledger.filter(l => l.spoolId === spool.id).sort((a, b) => new Date(b.ts || 0) - new Date(a.ts || 0));
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'max-height: 420px; overflow-y: auto;';

    const cols = [
      { key: 'ts', label: 'Date & Time', render: r => CP.util.fmtDate(r.ts) },
      { key: 'reason', label: 'Reason', render: r => `<span class="badge badge-${r.reason === 'purchase' ? 'success' : r.reason === 'print' ? 'info' : r.reason === 'scrap' ? 'danger' : 'warning'}">${CP.util.esc((r.reason || '').toUpperCase())}</span>` },
      { key: 'deltaG', label: 'Change (g)', render: r => `<span style="font-weight: 700; color: ${r.deltaG >= 0 ? '#059669' : '#dc2626'};">${r.deltaG >= 0 ? '+' : ''}${r.deltaG} g</span>` },
      { key: 'meta', label: 'Order / Printer', render: r => [r.orderId ? `Order: ${CP.util.esc(r.orderId)}` : '', r.printerId ? `P${String(r.printerId).padStart(2, '0')}` : ''].filter(Boolean).join(' &bull; ') || '—' },
      { key: 'note', label: 'Note', render: r => CP.util.esc(r.note || '—') }
    ];

    wrapper.innerHTML = CP.ui.table(cols, entries);
    CP.ui.modal({ title: `🧵 Ledger History: ${spool.id} (${spool.color} ${spool.material})`, bodyNode: wrapper, buttons: [{ label: 'Close', kind: 'btn-secondary' }] });
  }

  function renderSpoolLedgerTab() {
    const spools = getSpools(), printers = getPrinters(), settings = getSettings();
    const materials = (settings && settings.materials) ? settings.materials : ['PLA', 'ABS', 'TPU'];
    const filtered = spools.filter(s => (materialFilter === 'all' || s.material === materialFilter) && (statusFilter === 'all' || s.status === statusFilter));

    const matOpts = ['all', ...materials].map(m => `<option value="${CP.util.esc(m)}" ${materialFilter === m ? 'selected' : ''}>${m === 'all' ? 'All Materials' : CP.util.esc(m)}</option>`).join('');
    const statusOpts = ['active', 'all', 'empty', 'archived'].map(st => `<option value="${st}" ${statusFilter === st ? 'selected' : ''}>${st.charAt(0).toUpperCase() + st.slice(1)}</option>`).join('');

    const cols = [
      { key: 'id', label: 'Spool ID', render: r => `<span class="font-mono" style="font-weight: 700;">${CP.util.esc(r.id)}</span>` },
      { key: 'material', label: 'Material', render: r => `<span class="badge badge-default">${CP.util.esc(r.material)}</span>` },
      { key: 'color', label: 'Color & Brand', render: r => `<div><strong>${CP.util.esc(r.color)}</strong><div style="font-size: 11px; color: var(--text-muted);">${CP.util.esc(r.brand || 'Generic')}</div></div>` },
      { key: 'supplier', label: 'Supplier', render: r => `<span style="font-size: 12px;">${CP.util.esc(r.supplier || '—')}</span>` },
      {
        key: 'remainingG', label: 'Remaining (g)',
        render: r => {
          const pct = Math.max(0, Math.min(100, Math.round((Number(r.remainingG) / Number(r.initialG || 1000)) * 100)));
          const colorClass = pct < 15 ? 'spool-meter-low' : pct < 35 ? 'spool-meter-mid' : 'spool-meter-high';
          return `<div style="min-width: 120px;"><div style="display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 2px;"><strong>${r.remainingG} g</strong><span style="color: var(--text-muted);">${pct}%</span></div><div class="spool-meter"><div class="spool-meter-fill ${colorClass}" style="width: ${pct}%;"></div></div></div>`;
        }
      },
      { key: 'costINR', label: 'Cost', render: r => CP.util.fmtINR(r.costINR) },
      { key: 'costPerG', label: 'Cost / g', render: r => `₹${CP.util.round2(Number(r.initialG) > 0 ? (Number(r.costINR) / Number(r.initialG)) : 0).toFixed(2)}` },
      { key: 'loadedOnPrinterId', label: 'Loaded Printer', render: r => r.loadedOnPrinterId ? `<span class="badge badge-info" style="font-weight: 700;">${CP.util.esc((printers.find(x => x.id === r.loadedOnPrinterId) || {}).name || 'P' + r.loadedOnPrinterId)}</span>` : '<span style="color: var(--text-muted);">—</span>' },
      { key: 'status', label: 'Status', render: r => `<span class="badge badge-${r.status === 'active' ? 'success' : r.status === 'empty' ? 'danger' : 'default'}">${CP.util.esc(r.status.toUpperCase())}</span>` },
      {
        key: 'actions', label: 'Actions',
        render: r => {
          const printerBtn = r.loadedOnPrinterId
            ? `<button type="button" class="btn btn-secondary btn-sm btn-spool-unload" data-spool-id="${CP.util.esc(r.id)}">Unload</button>`
            : (r.status === 'active' ? `<button type="button" class="btn btn-secondary btn-sm btn-spool-load" data-spool-id="${CP.util.esc(r.id)}">Load...</button>` : '');
          return `<div style="display: flex; gap: 4px; flex-wrap: wrap;">${printerBtn}<button type="button" class="btn btn-secondary btn-sm btn-spool-adjust" data-spool-id="${CP.util.esc(r.id)}">Adjust</button><button type="button" class="btn btn-secondary btn-sm btn-spool-history" data-spool-id="${CP.util.esc(r.id)}">History</button>${r.status !== 'archived' ? `<button type="button" class="btn btn-secondary btn-sm btn-spool-archive" data-spool-id="${CP.util.esc(r.id)}" style="color: var(--danger);">Archive</button>` : ''}</div>`;
        }
      }
    ];

    return `
      <div class="card" style="margin-bottom: 16px;">
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
          <div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
            <div style="display: flex; align-items: center; gap: 6px;"><label style="font-size: 12px; font-weight: 600;">Material:</label><select class="select" id="filter-spool-mat" style="width: 140px; min-height: 36px; padding: 4px 8px;">${matOpts}</select></div>
            <div style="display: flex; align-items: center; gap: 6px;"><label style="font-size: 12px; font-weight: 600;">Status:</label><select class="select" id="filter-spool-status" style="width: 120px; min-height: 36px; padding: 4px 8px;">${statusOpts}</select></div>
          </div>
          <div style="display: flex; gap: 8px;">
            <button type="button" class="btn btn-primary btn-sm" id="btn-add-spool" style="min-height: 36px; font-weight: 600;">+ Add Spool</button>
            <button type="button" class="btn btn-secondary btn-sm" id="btn-seed-inv-quick" style="min-height: 36px;">⚡ Seed Inventory Demo</button>
          </div>
        </div>
      </div>
      <div class="table-container">${CP.ui.table(cols, filtered)}</div>
    `;
  }

  // --- TAB 2: STOCK & REORDER ---

  function renderStockAndReorderTab() {
    const settings = getSettings(), thresholdG = settings.production?.lowStockThresholdG ?? 2000;
    const stock = CP.inventory.stockByMaterial(), ledger = CP.store.get('cp_ledger', []), spools = getSpools();

    const spoolMatMap = {};
    spools.forEach(s => { spoolMatMap[s.id] = s.material; });

    const days = [];
    const now = new Date();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 86400000);
      days.push({ isoDate: d.toISOString().split('T')[0], label: `${d.getDate()} ${d.toLocaleString('en-US', { month: 'short' })}` });
    }

    return `
      <div class="stock-cards-grid">
        ${Object.keys(stock).map(mat => {
          const info = stock[mat] || { grams: 0, spools: 0 }, isLow = info.grams < thresholdG, costG = CP.inventory.costPerGram(mat);
          const dailyConsumption = days.map(day => {
            const daySum = ledger.reduce((acc, e) => (e.deltaG < 0 && spoolMatMap[e.spoolId] === mat && (e.ts || '').split('T')[0] === day.isoDate) ? acc + Math.abs(e.deltaG) : acc, 0);
            return { label: day.label, grams: daySum };
          });
          const maxDayG = Math.max(...dailyConsumption.map(d => d.grams), 1);
          const total14DayConsumed = dailyConsumption.reduce((acc, d) => acc + d.grams, 0);

          return `
            <div class="stock-card ${isLow ? 'stock-card-low' : ''}">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;"><h3 style="font-size: 18px; font-weight: 700;">${CP.util.esc(mat)} Stock</h3><span class="badge badge-default font-mono">${info.spools} active spool${info.spools !== 1 ? 's' : ''}</span></div>
              <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px;"><div><span style="font-size: 28px; font-weight: 800; color: ${isLow ? 'var(--status-error)' : 'var(--text-main)'};">${CP.util.fmtNum(info.grams)}</span><span style="font-size: 14px; color: var(--text-muted); font-weight: 600;">g</span></div><div style="text-align: right; font-size: 12px; color: var(--text-muted);">Raw Cost: <strong>₹${costG.toFixed(2)}/g</strong></div></div>
              ${isLow ? `<div class="stock-reorder-banner">⚠️ <strong>Reorder ${CP.util.esc(mat)}:</strong> only ${CP.util.fmtNum(info.grams)} g left (Threshold: ${CP.util.fmtNum(thresholdG)} g)</div>` : `<div class="stock-healthy-banner">✓ Healthy Stock (${CP.util.fmtNum(info.grams)} g &bull; Threshold: ${CP.util.fmtNum(thresholdG)} g)</div>`}
              <div style="margin-top: 16px; border-top: 1px solid var(--border-color); padding-top: 14px;">
                <div style="display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 8px;"><span style="font-weight: 600; color: var(--secondary);">14-Day Consumption</span><span style="color: var(--text-muted);">Total: <strong>${CP.util.fmtNum(total14DayConsumed)} g</strong></span></div>
                <div class="consumption-chart">${dailyConsumption.map(d => `<div class="consumption-col" title="${d.label}: ${d.grams}g consumed"><div class="consumption-bar-track"><div class="consumption-bar" style="height: ${d.grams > 0 ? Math.max(8, Math.round((d.grams / maxDayG) * 100)) : 0}%;"></div></div><span class="consumption-bar-label">${d.label.split(' ')[0]}</span></div>`).join('')}</div>
              </div>
            </div>`;
        }).join('')}
      </div>
    `;
  }

  // --- TAB 3: SUPPLIER PRICES & MARGIN REPORT ---

  function renderPricesAndMarginsTab() {
    const prices = CP.store.get('cp_supplier_prices', []).slice().sort((a, b) => new Date(b.ts || 0) - new Date(a.ts || 0));
    const margins = CP.inventory.marginReport(), settings = getSettings();
    const materials = (settings && settings.materials) ? settings.materials : ['PLA', 'ABS', 'TPU'];
    const today = CP.util.todayISO ? CP.util.todayISO() : new Date().toISOString().split('T')[0];

    const marginCols = [
      { key: 'material', label: 'Material', render: r => `<strong>${CP.util.esc(r.material)}</strong>` },
      { key: 'sellingRatePerG', label: 'Selling Rate / g', render: r => `₹${r.sellingRatePerG.toFixed(2)}` },
      { key: 'costPerG', label: 'Cost / g', render: r => `₹${r.costPerG.toFixed(2)}` },
      { key: 'marginPerG', label: 'Gross Margin / g', render: r => `<span style="font-weight: 700; color: ${r.belowTarget ? 'var(--status-error)' : '#059669'};">₹${r.marginPerG.toFixed(2)}</span>` },
      { key: 'marginPct', label: 'Margin %', render: r => `<span style="font-weight: 700; color: ${r.belowTarget ? 'var(--status-error)' : '#059669'};">${r.marginPct.toFixed(1)}%</span>` },
      { key: 'belowTarget', label: 'Margin Status', render: r => r.belowTarget ? `<span class="badge badge-danger">BELOW TARGET (&lt; ${settings.pricing?.minMarginPct || 40}%)</span>` : `<span class="badge badge-success">HEALTHY</span>` }
    ];

    const priceCols = [
      { key: 'ts', label: 'Quote Date', render: r => CP.util.fmtDate(r.ts) },
      { key: 'supplier', label: 'Chennai Vendor', render: r => `<strong>${CP.util.esc(r.supplier)}</strong>` },
      { key: 'material', label: 'Material', render: r => `<span class="badge badge-default">${CP.util.esc(r.material)}</span>` },
      { key: 'pricePerKg', label: 'Wholesale Price / kg', render: r => CP.util.fmtINR(r.pricePerKg) },
      { key: 'impliedPerG', label: 'Raw Cost / g', render: r => `₹${CP.util.round2(r.pricePerKg / 1000).toFixed(2)}/g` }
    ];

    return `
      <div class="card" style="margin-bottom: 20px;">
        <h3 class="card-title">📝 Log Wholesale Filament Price (Chennai Vendors)</h3>
        <form id="form-log-price" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)) 120px; gap: 12px; align-items: flex-end;">
          <div class="field" style="margin-bottom: 0;"><label>Vendor / Supplier:</label><input type="text" class="input" id="sup-vendor" list="sup-vendor-list" placeholder="e.g. Parrys Chennai" value="Parrys Chennai" required><datalist id="sup-vendor-list"><option value="Parrys Chennai"></option><option value="Ambattur Chennai"></option><option value="Guindy Industrial Estate"></option></datalist></div>
          <div class="field" style="margin-bottom: 0;"><label>Material:</label><select class="select" id="sup-material">${materials.map(m => `<option value="${CP.util.esc(m)}">${CP.util.esc(m)}</option>`).join('')}</select></div>
          <div class="field" style="margin-bottom: 0;"><label>Price per kg (INR ₹):</label><input type="number" class="input" id="sup-price" min="1" step="10" value="850" required></div>
          <div class="field" style="margin-bottom: 0;"><label>Date Logged:</label><input type="date" class="input" id="sup-date" value="${today}" required></div>
          <div><button type="submit" class="btn btn-primary" style="width: 100%; min-height: 40px; font-weight: 600;">+ Log Price</button></div>
        </form>
      </div>

      <div class="card" style="margin-bottom: 20px;">
        <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 12px; flex-wrap: wrap; gap: 6px;"><h3 class="card-title" style="margin-bottom: 0;">📊 Material Margin Report</h3><span style="font-size: 12px; color: var(--text-muted);">Selling rate vs. avg latest 3 quotes. Target margin: <strong>${settings.pricing?.minMarginPct || 40}%</strong></span></div>
        <div class="table-container"><table class="table"><thead><tr>${marginCols.map(c => `<th>${c.label}</th>`).join('')}</tr></thead><tbody>${margins.map(r => `<tr class="${r.belowTarget ? 'row-below-target' : ''}">${marginCols.map(c => `<td>${c.render(r)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
      </div>

      <div class="card"><h3 class="card-title">📜 Supplier Wholesale Price History</h3><div class="table-container">${CP.ui.table(priceCols, prices)}</div></div>
    `;
  }

  // --- MAIN VIEW RENDER & BINDINGS ---

  function renderView() {
    if (!root) return;
    const spools = getSpools();
    const activeSpoolsCount = spools.filter(s => s.status === 'active').length;
    const lowAlerts = CP.inventory ? CP.inventory.lowStockAlerts() : [];

    root.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; flex-wrap: wrap; gap: 12px;">
        <div><h2 style="font-size: 20px; font-weight: 800; color: var(--text-main);">🧵 Spools &amp; Stock</h2><div style="font-size: 13px; color: var(--text-muted);">Filament spool tracking, real-time consumption ledger, and Chennai wholesale pricing</div></div>
      </div>

      <div class="inventory-tabs">
        <button type="button" class="inventory-tab-btn ${activeTab === 'spools' ? 'active' : ''}" data-tab="spools">🧵 Spool Ledger <span class="badge badge-default" style="margin-left: 6px;">${activeSpoolsCount}</span></button>
        <button type="button" class="inventory-tab-btn ${activeTab === 'reorder' ? 'active' : ''}" data-tab="reorder">📦 Stock &amp; Reorder ${lowAlerts.length > 0 ? `<span class="badge badge-danger" style="margin-left: 6px;">${lowAlerts.length} LOW</span>` : ''}</button>
        <button type="button" class="inventory-tab-btn ${activeTab === 'prices' ? 'active' : ''}" data-tab="prices">🏷️ Supplier Prices &amp; Margins</button>
      </div>

      <div class="inventory-tab-content">
        ${activeTab === 'spools' ? renderSpoolLedgerTab() : activeTab === 'reorder' ? renderStockAndReorderTab() : renderPricesAndMarginsTab()}
      </div>
    `;

    bindEvents();
  }

  function bindEvents() {
    if (!root) return;

    root.querySelectorAll('.inventory-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => { activeTab = btn.getAttribute('data-tab'); renderView(); });
    });

    if (activeTab === 'spools') {
      root.querySelector('#filter-spool-mat')?.addEventListener('change', (e) => { materialFilter = e.target.value; renderView(); });
      root.querySelector('#filter-spool-status')?.addEventListener('change', (e) => { statusFilter = e.target.value; renderView(); });
      root.querySelector('#btn-add-spool')?.addEventListener('click', openAddSpoolModal);
      root.querySelector('#btn-seed-inv-quick')?.addEventListener('click', () => {
        if (CP.inventory && typeof CP.inventory.seedInventoryData === 'function') {
          CP.inventory.seedInventoryData();
          CP.ui.toast('Sample inventory data seeded!', 'success');
          renderView();
        }
      });

      root.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-spool-id]');
        if (!btn) return;
        const spoolId = btn.getAttribute('data-spool-id');
        const spool = getSpools().find(s => s.id === spoolId);
        if (!spool) return;

        if (btn.classList.contains('btn-spool-load')) openLoadModal(spool);
        else if (btn.classList.contains('btn-spool-unload')) { CP.inventory.unloadSpool(spool.id); renderView(); }
        else if (btn.classList.contains('btn-spool-adjust')) openAdjustModal(spool);
        else if (btn.classList.contains('btn-spool-history')) openHistoryModal(spool);
        else if (btn.classList.contains('btn-spool-archive')) {
          CP.ui.confirm(`Archive spool ${spool.id}? It will be hidden from active inventory.`).then(ok => {
            if (ok) { CP.inventory.archiveSpool(spool.id); renderView(); }
          });
        }
      });
    }

    if (activeTab === 'prices') {
      const form = root.querySelector('#form-log-price');
      if (form) {
        form.addEventListener('submit', (e) => {
          e.preventDefault();
          const supplier = root.querySelector('#sup-vendor')?.value.trim();
          const material = root.querySelector('#sup-material')?.value;
          const pricePerKg = Number(root.querySelector('#sup-price')?.value);
          const date = root.querySelector('#sup-date')?.value;

          if (!supplier) { CP.ui.toast('Please enter a supplier name.', 'danger'); return; }
          if (isNaN(pricePerKg) || pricePerKg <= 0) { CP.ui.toast('Please enter a valid price / kg.', 'danger'); return; }

          CP.inventory.addSupplierPrice({ supplier, material, pricePerKg, date });
          CP.ui.toast(`Logged wholesale price for ${material} from ${supplier}`, 'success');
          renderView();
        });
      }
    }
  }

  function render(rootElement) {
    root = rootElement;
    renderView();

    if (CP.bus) {
      if (typeof busUnsub === 'function') busUnsub();
      busUnsub = CP.bus.on('stock:changed', () => { if (root) renderView(); });
    }
  }

  function destroy() {
    if (typeof busUnsub === 'function') {
      busUnsub();
      busUnsub = null;
    }
    root = null;
  }

  return { render, destroy };
})();

CP.registerModule({
  id: 'inventory',
  route: '#/inventory',
  title: 'Spools & Stock',
  icon: '🧵',
  render: CP.inventoryModule.render,
  destroy: CP.inventoryModule.destroy
});
