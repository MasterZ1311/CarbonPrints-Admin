/**
 * CarbonPrints Company OS - Data Export, Accounting & Backup Module
 * Route: #/data (strictly <= 600 lines)
 * Full offline JSON backups, validated restores (Replace/Merge), Tally/Zoho registers & CSVs.
 */
window.CP = window.CP || {};

CP.data = (function () {
  let activeContainer = null;
  let selectedBackupObj = null;

  function getCounts() {
    return {
      orders: (CP.store.get('cp_orders', []) || []).length,
      spools: (CP.store.get('cp_spools', []) || []).length,
      printers: (CP.store.get('cp_printers', []) || []).length,
      scrap: (CP.store.get('cp_scrap', []) || []).length,
      qc: (CP.store.get('cp_qc', []) || []).length,
      maintLog: (CP.store.get('cp_maint_log', []) || []).length,
      ledger: (CP.store.get('cp_ledger', []) || []).length
    };
  }

  function getStorageUsage() {
    const bytes = (CP.store && typeof CP.store.usage === 'function') ? CP.store.usage() : 0;
    const maxBytes = 5 * 1024 * 1024;
    const pct = Math.min(100, (bytes / maxBytes) * 100);
    return { bytes, kb: (bytes / 1024).toFixed(1), maxMb: 5.0, pct: pct.toFixed(1), isWarning: pct >= 70 };
  }

  function isInRange(dateStr, start, end) {
    if (!dateStr) return false;
    const d = dateStr.slice(0, 10);
    if (start && d < start) return false;
    if (end && d > end) return false;
    return true;
  }

  function exportFullBackup() {
    const nowISO = new Date().toISOString();
    const counts = getCounts();
    const dump = (CP.store && typeof CP.store.exportAll === 'function') ? CP.store.exportAll() : {};

    const meta = CP.store.get('cp_meta', { schemaVersion: 1, lastBackupAt: null });
    meta.lastBackupAt = nowISO;
    CP.store.set('cp_meta', meta);
    dump.cp_meta = meta;

    const backupPayload = {
      app: 'CarbonPrints Company OS',
      version: CP.version || '0.1.0',
      exportedAt: nowISO,
      counts,
      _meta: { app: 'CarbonPrints Company OS', version: CP.version || '0.1.0', exportedAt: nowISO, counts },
      ...dump
    };

    CP.csv.download(`carbonprints-backup-${nowISO.slice(0, 10)}.json`, JSON.stringify(backupPayload, null, 2), 'application/json;charset=utf-8;');
    if (CP.bus) CP.bus.emit('backup:completed', nowISO);
    if (CP.ui && typeof CP.ui.removeAlert === 'function') CP.ui.removeAlert('backup-reminder');
    if (CP.ui && typeof CP.ui.toast === 'function') CP.ui.toast(`Full backup downloaded (${counts.orders} orders, ${counts.spools} spools).`, 'success');
    if (activeContainer) render(activeContainer);
    return backupPayload;
  }

  function validateBackup(json) {
    if (!json || typeof json !== 'object') return { valid: false, error: 'File is not a valid JSON object.' };
    const appName = json.app || (json._meta && json._meta.app) || '';
    if (!appName.toLowerCase().includes('carbonprints')) {
      return { valid: false, error: 'Invalid backup: Header does not identify as CarbonPrints Company OS.' };
    }
    const known = ['cp_orders', 'cp_spools', 'cp_settings', 'cp_printers', 'counts', '_meta'];
    if (!known.some(k => k in json || (json.data && k in json.data))) {
      return { valid: false, error: 'Invalid backup: No recognized CarbonPrints database keys found.' };
    }

    const rc = json.counts || (json._meta && json._meta.counts) || {};
    const counts = {
      orders: rc.orders !== undefined ? rc.orders : (Array.isArray(json.cp_orders) ? json.cp_orders.length : 0),
      spools: rc.spools !== undefined ? rc.spools : (Array.isArray(json.cp_spools) ? json.cp_spools.length : 0),
      printers: rc.printers !== undefined ? rc.printers : (Array.isArray(json.cp_printers) ? json.cp_printers.length : 0),
      scrap: rc.scrap !== undefined ? rc.scrap : (Array.isArray(json.cp_scrap) ? json.cp_scrap.length : 0),
      qc: rc.qc !== undefined ? rc.qc : (Array.isArray(json.cp_qc) ? json.cp_qc.length : 0),
      maintLog: rc.maintLog !== undefined ? rc.maintLog : (Array.isArray(json.cp_maint_log) ? json.cp_maint_log.length : 0),
      ledger: rc.ledger !== undefined ? rc.ledger : (Array.isArray(json.cp_ledger) ? json.cp_ledger.length : 0)
    };
    return {
      valid: true,
      app: appName,
      version: json.version || (json._meta && json._meta.version) || '0.1.0',
      exportedAt: json.exportedAt || (json._meta && json._meta.exportedAt) || null,
      counts
    };
  }

  function restoreBackup(json, mode = 'replace') {
    const val = validateBackup(json);
    if (!val.valid) throw new Error(val.error);

    const safetyNow = new Date().toISOString();
    const safetyPayload = {
      app: 'CarbonPrints Company OS',
      version: CP.version || '0.1.0',
      exportedAt: safetyNow,
      counts: getCounts(),
      _meta: { app: 'CarbonPrints Company OS', version: CP.version || '0.1.0', exportedAt: safetyNow, note: 'Pre-restore safety backup' },
      ...CP.store.exportAll()
    };
    CP.csv.download(`carbonprints-pre-restore-safety-backup-${safetyNow.slice(0, 10)}.json`, JSON.stringify(safetyPayload, null, 2), 'application/json;charset=utf-8;');

    const incoming = {};
    const root = (json.data && typeof json.data === 'object') ? { ...json, ...json.data } : json;
    Object.keys(root).forEach(k => { if (k.startsWith('cp_')) incoming[k] = root[k]; });

    if (mode === 'replace') {
      CP.store.importAll(incoming, 'replace');
    } else {
      ['cp_orders', 'cp_spools', 'cp_scrap', 'cp_qc', 'cp_maint_log', 'cp_ledger', 'cp_supplier_prices'].forEach(k => {
        const existing = CP.store.get(k, []) || [];
        const inArr = Array.isArray(incoming[k]) ? incoming[k] : [];
        const existingIds = new Set(existing.map(x => x && x.id).filter(Boolean));
        CP.store.set(k, existing.concat(inArr.filter(item => !item || !item.id || !existingIds.has(item.id))));
      });
      if (incoming.cp_settings) {
        CP.store.set('cp_settings', CP.store.deepMerge(incoming.cp_settings, CP.store.get('cp_settings', {})));
      }
      if ((CP.store.get('cp_printers', []) || []).length === 0 && incoming.cp_printers) CP.store.set('cp_printers', incoming.cp_printers);
      if ((CP.store.get('cp_maint_tasks', []) || []).length === 0 && incoming.cp_maint_tasks) CP.store.set('cp_maint_tasks', incoming.cp_maint_tasks);
    }

    const meta = CP.store.get('cp_meta', { schemaVersion: 1 });
    meta.lastBackupAt = new Date().toISOString();
    CP.store.set('cp_meta', meta);

    if (CP.bus) {
      CP.bus.emit('backup:completed', meta.lastBackupAt);
      CP.bus.emit('store:restore');
    }
    if (CP.ui && typeof CP.ui.removeAlert === 'function') CP.ui.removeAlert('backup-reminder');
    return true;
  }

  // --- CSV Exporters ---

  function exportOrdersCSV(start, end) {
    let orders = CP.store.get('cp_orders', []) || [];
    if (start || end) orders = orders.filter(o => isInRange(o.createdAt || o.date, start, end));
    const cols = [
      { key: 'id', label: 'Order ID' }, { key: 'date', label: 'Date', render: o => (o.createdAt || '').slice(0, 10) },
      { key: 'customer', label: 'Customer Name', render: o => o.customer?.name || '' },
      { key: 'phone', label: 'Phone', render: o => o.customer?.phone || '' },
      { key: 'category', label: 'Category', render: o => o.customer?.category || '' },
      { key: 'status', label: 'Status', render: o => (o.status || '').toUpperCase() },
      { key: 'subtotal', label: 'Subtotal (₹)', render: o => (o.pricing?.subtotal || 0).toFixed(2) },
      { key: 'discount', label: 'Discount (₹)', render: o => (o.pricing?.discountAmt || 0).toFixed(2) },
      { key: 'gst', label: 'GST (₹)', render: o => (o.pricing?.gstAmt || 0).toFixed(2) },
      { key: 'total', label: 'Total (₹)', render: o => (o.pricing?.total || 0).toFixed(2) },
      { key: 'paid', label: 'Paid (₹)', render: o => (o.payment?.paidAmount || 0).toFixed(2) },
      { key: 'balance', label: 'Balance (₹)', render: o => Math.max(0, (o.pricing?.total || 0) - (o.payment?.paidAmount || 0)).toFixed(2) },
      { key: 'invoiceNo', label: 'Invoice No', render: o => o.invoiceNo || '' }
    ];
    const csv = CP.csv.toCSV(orders, cols);
    CP.csv.download(`carbonprints-orders-${CP.util.todayISO()}.csv`, csv);
    return csv;
  }

  function exportOrderLinesCSV(start, end) {
    let orders = CP.store.get('cp_orders', []) || [];
    if (start || end) orders = orders.filter(o => isInRange(o.createdAt || o.date, start, end));
    const lines = [];
    orders.forEach(o => {
      (o.parts || []).forEach(p => {
        lines.push({
          orderId: o.id, date: (o.createdAt || '').slice(0, 10), customer: o.customer?.name || '',
          partName: p.name || '', material: p.material || '', layer: p.layer || '',
          infill: p.infillPct !== undefined ? `${p.infillPct}%` : '', singleG: p.weightG || 0,
          qty: p.qty || 1, totalG: (p.weightG || 0) * (p.qty || 1), status: p.status || o.status || ''
        });
      });
    });
    const cols = [
      { key: 'orderId', label: 'Order ID' }, { key: 'date', label: 'Date' }, { key: 'customer', label: 'Customer' },
      { key: 'partName', label: 'Part Name' }, { key: 'material', label: 'Material' }, { key: 'layer', label: 'Layer Height (mm)' },
      { key: 'infill', label: 'Infill %' }, { key: 'singleG', label: 'Weight (Single g)' }, { key: 'qty', label: 'Quantity' },
      { key: 'totalG', label: 'Total Grams' }, { key: 'status', label: 'Part Status' }
    ];
    const csv = CP.csv.toCSV(lines, cols);
    CP.csv.download(`carbonprints-order-lines-${CP.util.todayISO()}.csv`, csv);
    return csv;
  }

  function exportPaymentsCSV(start, end) {
    const orders = CP.store.get('cp_orders', []) || [];
    const payments = [];
    orders.forEach(o => {
      ((o.payment && o.payment.history) || []).forEach(h => {
        const d = (h.ts || o.createdAt || '').slice(0, 10);
        if (isInRange(d, start, end) || (!start && !end)) {
          payments.push({
            date: d, orderId: o.id, customer: o.customer?.name || '',
            amount: Number(h.amount || 0).toFixed(2), mode: h.mode || 'UPI',
            reference: h.txnRef || '', notes: h.note || ''
          });
        }
      });
    });
    const cols = [
      { key: 'date', label: 'Payment Date' }, { key: 'orderId', label: 'Order ID' }, { key: 'customer', label: 'Customer' },
      { key: 'amount', label: 'Amount (₹)' }, { key: 'mode', label: 'Mode' }, { key: 'reference', label: 'Reference' }, { key: 'notes', label: 'Notes' }
    ];
    const csv = CP.csv.toCSV(payments, cols);
    CP.csv.download(`carbonprints-payments-${CP.util.todayISO()}.csv`, csv);
    return csv;
  }

  function exportSpoolsCSV() {
    const spools = CP.store.get('cp_spools', []) || [];
    const cols = [
      { key: 'id', label: 'Spool ID' }, { key: 'material', label: 'Material' }, { key: 'color', label: 'Color' },
      { key: 'brand', label: 'Brand' }, { key: 'supplier', label: 'Vendor / Supplier' },
      { key: 'purchasedAt', label: 'Purchase Date', render: s => (s.purchasedAt || '').slice(0, 10) },
      { key: 'costINR', label: 'Cost (₹)', render: s => (s.costINR || 0).toFixed(2) },
      { key: 'initialG', label: 'Initial Weight (g)' }, { key: 'remainingG', label: 'Remaining Weight (g)' },
      { key: 'status', label: 'Status' },
      { key: 'loadedOnPrinterId', label: 'Loaded Machine', render: s => s.loadedOnPrinterId ? `Printer ${String(s.loadedOnPrinterId).padStart(2, '0')}` : 'None' }
    ];
    const csv = CP.csv.toCSV(spools, cols);
    CP.csv.download(`carbonprints-spools-${CP.util.todayISO()}.csv`, csv);
    return csv;
  }

  function exportStockLedgerCSV(start, end) {
    let ledger = CP.store.get('cp_ledger', []) || [];
    if (start || end) ledger = ledger.filter(l => isInRange(l.ts, start, end));
    const cols = [
      { key: 'date', label: 'Date', render: l => (l.ts || '').slice(0, 10) },
      { key: 'spoolId', label: 'Spool ID' }, { key: 'deltaG', label: 'Weight Change (g)' },
      { key: 'reason', label: 'Reason / Type' }, { key: 'orderId', label: 'Order Ref', render: l => l.orderId || '' },
      { key: 'printerId', label: 'Machine', render: l => l.printerId ? `Printer ${String(l.printerId).padStart(2, '0')}` : '' },
      { key: 'note', label: 'Notes' }
    ];
    const csv = CP.csv.toCSV(ledger, cols);
    CP.csv.download(`carbonprints-stock-ledger-${CP.util.todayISO()}.csv`, csv);
    return csv;
  }

  function exportScrapCSV(start, end) {
    let scrap = CP.store.get('cp_scrap', []) || [];
    if (start || end) scrap = scrap.filter(s => isInRange(s.ts, start, end));
    const cols = [
      { key: 'date', label: 'Date', render: s => (s.ts || '').slice(0, 10) },
      { key: 'printer', label: 'Printer', render: s => s.printerId ? `Printer ${String(s.printerId).padStart(2, '0')}` : '' },
      { key: 'material', label: 'Material' }, { key: 'weightG', label: 'Weight (g)' },
      { key: 'costINR', label: 'Cost (₹)', render: s => (s.costINR || 0).toFixed(2) },
      { key: 'reason', label: 'Failure Reason' }, { key: 'orderId', label: 'Order ID', render: s => s.orderId || '' },
      { key: 'notes', label: 'Notes' }
    ];
    const csv = CP.csv.toCSV(scrap, cols);
    CP.csv.download(`carbonprints-scrap-log-${CP.util.todayISO()}.csv`, csv);
    return csv;
  }

  function exportQCCSV(start, end) {
    let qc = CP.store.get('cp_qc', []) || [];
    if (start || end) qc = qc.filter(q => isInRange(q.ts, start, end));
    const cols = [
      { key: 'date', label: 'Date', render: q => (q.ts || '').slice(0, 10) },
      { key: 'orderId', label: 'Order ID' }, { key: 'partName', label: 'Part Name' },
      { key: 'result', label: 'QC Result', render: q => (q.result || '').toUpperCase() },
      { key: 'inspector', label: 'Inspector' }, { key: 'notes', label: 'Notes' }
    ];
    const csv = CP.csv.toCSV(qc, cols);
    CP.csv.download(`carbonprints-qc-records-${CP.util.todayISO()}.csv`, csv);
    return csv;
  }

  function exportMaintCSV(start, end) {
    let maint = CP.store.get('cp_maint_log', []) || [];
    if (start || end) maint = maint.filter(m => isInRange(m.ts, start, end));
    const cols = [
      { key: 'date', label: 'Date', render: m => (m.ts || '').slice(0, 10) },
      { key: 'printer', label: 'Printer', render: m => m.printerId ? `Printer ${String(m.printerId).padStart(2, '0')}` : '' },
      { key: 'task', label: 'Task Label', render: m => m.label || m.key || '' },
      { key: 'technician', label: 'Done By', render: m => m.doneBy || '' },
      { key: 'costINR', label: 'Cost (₹)', render: m => (m.costINR || 0).toFixed(2) },
      { key: 'note', label: 'Notes' }
    ];
    const csv = CP.csv.toCSV(maint, cols);
    CP.csv.download(`carbonprints-maintenance-log-${CP.util.todayISO()}.csv`, csv);
    return csv;
  }

  function exportSalesRegisterCSV(start, end) {
    let orders = (CP.store.get('cp_orders', []) || []).filter(o => o.status !== 'cancelled' && o.status !== 'quote');
    if (start || end) orders = orders.filter(o => isInRange(o.createdAt || o.date, start, end));

    const rows = orders.map(o => {
      const taxable = (o.pricing?.subtotal || 0) - (o.pricing?.discountAmt || 0);
      const gstAmt = o.pricing?.gstAmt || 0;
      const isInter = o.pricing?.interState || false;
      const total = o.pricing?.total || 0;
      return {
        voucherDate: (o.createdAt || '').slice(0, 10), voucherNumber: o.invoiceNo || o.id,
        partyName: o.customer?.name || '', partyPhone: o.customer?.phone || '',
        taxableValue: taxable.toFixed(2), cgst: (isInter ? 0 : gstAmt / 2).toFixed(2),
        sgst: (isInter ? 0 : gstAmt / 2).toFixed(2), igst: (isInter ? gstAmt : 0).toFixed(2),
        roundOff: (total - (taxable + gstAmt)).toFixed(2), invoiceTotal: total.toFixed(2),
        narration: `3D Printing Services - Order ${o.id}`
      };
    });

    const cols = [
      { key: 'voucherDate', label: 'Voucher Date' }, { key: 'voucherNumber', label: 'Voucher Number' },
      { key: 'partyName', label: 'Party Name' }, { key: 'partyPhone', label: 'Party Phone' },
      { key: 'taxableValue', label: 'Taxable Value' }, { key: 'cgst', label: 'CGST' },
      { key: 'sgst', label: 'SGST' }, { key: 'igst', label: 'IGST' },
      { key: 'roundOff', label: 'Round Off' }, { key: 'invoiceTotal', label: 'Invoice Total' },
      { key: 'narration', label: 'Narration' }
    ];
    const csv = CP.csv.toCSV(rows, cols);
    CP.csv.download(`carbonprints-sales-register-${CP.util.todayISO()}.csv`, csv);
    return csv;
  }

  function exportReceiptsCSV(start, end) {
    const orders = (CP.store.get('cp_orders', []) || []).filter(o => o.status !== 'cancelled');
    const receipts = [];
    orders.forEach(o => {
      ((o.payment && o.payment.history) || []).forEach(h => {
        const d = (h.ts || o.createdAt || '').slice(0, 10);
        if (isInRange(d, start, end) || (!start && !end)) {
          receipts.push({
            date: d, partyName: o.customer?.name || '',
            amount: Number(h.amount || 0).toFixed(2), mode: h.mode || 'UPI',
            reference: h.txnRef || h.id || ''
          });
        }
      });
    });
    const cols = [
      { key: 'date', label: 'Date' }, { key: 'partyName', label: 'Party Name' },
      { key: 'amount', label: 'Amount' }, { key: 'mode', label: 'Mode' }, { key: 'reference', label: 'Reference' }
    ];
    const csv = CP.csv.toCSV(receipts, cols);
    CP.csv.download(`carbonprints-receipts-${CP.util.todayISO()}.csv`, csv);
    return csv;
  }

  function render(rootElement) {
    activeContainer = rootElement;
    const usage = getStorageUsage();
    const meta = CP.store.get('cp_meta', { schemaVersion: 1, lastBackupAt: null });
    const lastBackupStr = meta.lastBackupAt ? (CP.util.formatDate ? CP.util.formatDate(meta.lastBackupAt) : meta.lastBackupAt.slice(0, 10)) : 'Never';
    const counts = getCounts();

    rootElement.innerHTML = `
      <div class="card" style="margin-bottom: 20px;">
        <div class="card-header">
          <div>
            <h2 class="card-title">💾 Data &amp; Backup</h2>
            <div class="card-subtitle">Offline database backups, Tally/Zoho accounting registers, and operational CSV reports</div>
          </div>
          <span class="badge ${meta.lastBackupAt ? 'badge-confirmed' : 'badge-danger'}">
            ${meta.lastBackupAt ? `Last Backup: ${CP.util.esc(lastBackupStr)}` : '⚠️ No Backup Taken'}
          </span>
        </div>
        <div class="data-grid-2">
          <div class="data-box">
            <h3 style="font-size: 14px; font-weight: 700; margin-bottom: 8px;">💽 Browser Storage Meter</h3>
            <div style="display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 6px; color: var(--text-muted);">
              <span>Database: <strong>${usage.kb} KB</strong> / ${usage.maxMb.toFixed(1)} MB</span>
              <span><strong>${usage.pct}%</strong> quota</span>
            </div>
            <div class="storage-meter-bar">
              <div class="storage-meter-fill ${usage.isWarning ? 'danger' : 'success'}" style="width: ${usage.pct}%;"></div>
            </div>
            ${usage.isWarning ? '<div class="banner banner-danger" style="margin-top: 10px; padding: 6px 10px; font-size: 12px;">⚠️ Storage quota warning: Database is over 70% full. Download a full backup and clear older logs.</div>' : '<div style="font-size: 11px; color: var(--text-muted); margin-top: 6px;">Estimated against standard 5.0 MB browser storage quota.</div>'}
          </div>
          <div class="data-box help-box">
            <h3 style="font-size: 14px; font-weight: 700; margin-bottom: 8px;">🔒 Offline-First Architecture</h3>
            <p style="font-size: 12px; color: var(--text-muted); line-height: 1.5; margin-bottom: 6px;">
              Data is stored in this browser only. To move to another computer, download a backup and restore it there.
            </p>
            <p style="font-size: 12px; color: var(--brand); font-weight: 600; margin: 0;">
              💡 Tip: Upload the downloaded JSON backup to your company Google Drive manually for safe off-site preservation.
            </p>
          </div>
        </div>
      </div>

      <div class="card" style="margin-bottom: 20px;">
        <div class="card-header"><h3 class="card-title">🗄️ Full Database Backup &amp; Restore</h3></div>
        <div class="data-grid-2">
          <div class="data-box">
            <h4 style="font-size: 13px; font-weight: 700; margin-bottom: 4px;">📥 Full Backup</h4>
            <p style="font-size: 12px; color: var(--text-muted); margin-bottom: 12px;">Downloads a single, portable JSON archive with all tables and metadata.</p>
            <button class="btn btn-primary" id="btn-full-backup" style="width: 100%;">💾 Download Full Backup (.json)</button>
          </div>
          <div class="data-box">
            <h4 style="font-size: 13px; font-weight: 700; margin-bottom: 4px;">📤 Restore Database</h4>
            <p style="font-size: 12px; color: var(--text-muted); margin-bottom: 12px;">Restore from a verified backup JSON file. Always creates a safety snapshot first.</p>
            <input type="file" id="restore-file-input" accept=".json,application/json" style="display: none;">
            <button class="btn btn-secondary" id="btn-trigger-restore" style="width: 100%;">📂 Choose Backup File to Restore...</button>
            <div id="restore-preview" style="margin-top: 12px; display: none;"></div>
          </div>
        </div>
      </div>

      <div class="card" style="margin-bottom: 20px;">
        <div class="card-header">
          <div>
            <h3 class="card-title">🧾 Accounting Export (Tally / Zoho Friendly)</h3>
            <div class="card-subtitle">Sales vouchers and receipt entries structured for Indian accounting software</div>
          </div>
        </div>
        <div class="banner banner-info" style="margin: 0 20px 14px 20px;">
          ℹ️ <strong>Accountant Notice:</strong> Column mapping may need adjusting for your accountant's import template.
        </div>
        <div style="display: flex; gap: 12px; padding: 0 20px 16px 20px; flex-wrap: wrap;">
          <button class="btn btn-primary" id="btn-export-sales-register">📊 Export Sales Register CSV</button>
          <button class="btn btn-secondary" id="btn-export-receipts">🧾 Export Receipts Register CSV</button>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <div>
            <h3 class="card-title">📑 Operational CSV Data Exports</h3>
            <div class="card-subtitle">Export granular raw tables with UTF-8 BOM encoding for Excel and Google Sheets</div>
          </div>
        </div>
        <div style="padding: 10px 16px; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; background: var(--surface-alt); margin: 0 20px 16px 20px; border-radius: var(--radius); border: 1px solid var(--border);">
          <span style="font-weight: 600; font-size: 12px;">Optional Date Filter:</span>
          <div style="display: flex; align-items: center; gap: 4px;">
            <label for="csv-date-start" style="font-size: 11px; color: var(--text-muted);">From:</label>
            <input type="date" id="csv-date-start" class="form-control" style="width: auto; padding: 2px 6px; font-size: 12px;">
          </div>
          <div style="display: flex; align-items: center; gap: 4px;">
            <label for="csv-date-end" style="font-size: 11px; color: var(--text-muted);">To:</label>
            <input type="date" id="csv-date-end" class="form-control" style="width: auto; padding: 2px 6px; font-size: 12px;">
          </div>
          <button class="btn btn-sm btn-outline" id="btn-csv-clear-date">Clear Range</button>
        </div>
        <div class="data-export-grid">
          <div class="data-export-card"><div><div class="data-export-title">📦 Orders</div><div class="data-export-desc">One row per order with pricing, GST, and balances (${counts.orders} records)</div></div><button class="btn btn-sm btn-secondary" id="btn-csv-orders">Download CSV</button></div>
          <div class="data-export-card"><div><div class="data-export-title">🧩 Order Lines (Parts)</div><div class="data-export-desc">One row per 3D printed component, material, layer &amp; infill</div></div><button class="btn btn-sm btn-secondary" id="btn-csv-order-lines">Download CSV</button></div>
          <div class="data-export-card"><div><div class="data-export-title">💳 Payments</div><div class="data-export-desc">One row per payment transaction with UPI/bank reference</div></div><button class="btn btn-sm btn-secondary" id="btn-csv-payments">Download CSV</button></div>
          <div class="data-export-card"><div><div class="data-export-title">🧵 Spools</div><div class="data-export-desc">Filament inventory, remaining grams, and costs (${counts.spools} spools)</div></div><button class="btn btn-sm btn-secondary" id="btn-csv-spools">Download CSV</button></div>
          <div class="data-export-card"><div><div class="data-export-title">📒 Stock Ledger</div><div class="data-export-desc">Gram-level audit trail for prints, scraps, and purchases (${counts.ledger} entries)</div></div><button class="btn btn-sm btn-secondary" id="btn-csv-ledger">Download CSV</button></div>
          <div class="data-export-card"><div><div class="data-export-title">🗑️ Scrap Log</div><div class="data-export-desc">Failed prints, causes, wasted grams, and monetary loss (${counts.scrap} entries)</div></div><button class="btn btn-sm btn-secondary" id="btn-csv-scrap">Download CSV</button></div>
          <div class="data-export-card"><div><div class="data-export-title">🔍 QC Records</div><div class="data-export-desc">Dimensional calipers, surface inspections, and passes (${counts.qc} inspections)</div></div><button class="btn btn-sm btn-secondary" id="btn-csv-qc">Download CSV</button></div>
          <div class="data-export-card"><div><div class="data-export-title">🔧 Maintenance Log</div><div class="data-export-desc">Bed leveling, lubrications, and nozzle replacements (${counts.maintLog} records)</div></div><button class="btn btn-sm btn-secondary" id="btn-csv-maint">Download CSV</button></div>
        </div>
      </div>
    `;

    bindEvents(rootElement);
  }

  function getDateFilter() {
    const s = document.getElementById('csv-date-start');
    const e = document.getElementById('csv-date-end');
    return { start: s && s.value ? s.value : null, end: e && e.value ? e.value : null };
  }

  function bindEvents(root) {
    const btnFull = root.querySelector('#btn-full-backup');
    if (btnFull) btnFull.addEventListener('click', () => exportFullBackup());

    const btnTrigger = root.querySelector('#btn-trigger-restore');
    const fi = root.querySelector('#restore-file-input');
    if (btnTrigger && fi) {
      btnTrigger.addEventListener('click', () => fi.click());
      fi.addEventListener('change', e => { if (e.target.files && e.target.files[0]) handleRestoreFile(e.target.files[0], root); });
    }

    const btnClear = root.querySelector('#btn-csv-clear-date');
    if (btnClear) {
      btnClear.addEventListener('click', () => {
        const s = root.querySelector('#csv-date-start'), e = root.querySelector('#csv-date-end');
        if (s) s.value = ''; if (e) e.value = '';
      });
    }

    const btnSales = root.querySelector('#btn-export-sales-register');
    if (btnSales) btnSales.addEventListener('click', () => { const df = getDateFilter(); exportSalesRegisterCSV(df.start, df.end); });

    const btnReceipts = root.querySelector('#btn-export-receipts');
    if (btnReceipts) btnReceipts.addEventListener('click', () => { const df = getDateFilter(); exportReceiptsCSV(df.start, df.end); });

    [
      ['#btn-csv-orders', exportOrdersCSV], ['#btn-csv-order-lines', exportOrderLinesCSV],
      ['#btn-csv-payments', exportPaymentsCSV], ['#btn-csv-spools', exportSpoolsCSV],
      ['#btn-csv-ledger', exportStockLedgerCSV], ['#btn-csv-scrap', exportScrapCSV],
      ['#btn-csv-qc', exportQCCSV], ['#btn-csv-maint', exportMaintCSV]
    ].forEach(([sel, fn]) => {
      const el = root.querySelector(sel);
      if (el) el.addEventListener('click', () => { const df = getDateFilter(); fn(df.start, df.end); });
    });
  }

  function handleRestoreFile(file, root) {
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const json = JSON.parse(ev.target.result);
        const val = validateBackup(json);
        if (!val.valid) {
          if (CP.ui && typeof CP.ui.toast === 'function') CP.ui.toast(val.error, 'danger');
          else alert(val.error);
          return;
        }

        selectedBackupObj = json;
        const previewEl = root.querySelector('#restore-preview');
        if (!previewEl) return;
        previewEl.style.display = 'block';
        previewEl.innerHTML = `
          <div class="card" style="border: 2px solid var(--brand); background: var(--surface-alt); padding: 12px; margin-top: 10px;">
            <h4 style="margin: 0 0 6px 0; font-size: 14px;">📦 Validated Backup Archive</h4>
            <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 10px;">
              App: <strong>${CP.util.esc(val.app)} v${CP.util.esc(val.version)}</strong> • 
              Exported: <strong>${CP.util.esc(val.exportedAt ? val.exportedAt.slice(0, 19).replace('T', ' ') : 'Unknown')}</strong>
            </div>
            <div style="display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 12px;">
              <span class="badge badge-confirmed">${val.counts.orders} Orders</span>
              <span class="badge badge-confirmed">${val.counts.spools} Spools</span>
              <span class="badge badge-confirmed">${val.counts.scrap} Scrap</span>
              <span class="badge badge-confirmed">${val.counts.qc} QC</span>
              <span class="badge badge-confirmed">${val.counts.maintLog} Maint Logs</span>
              <span class="badge badge-confirmed">${val.counts.ledger} Ledger</span>
            </div>
            <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 12px;">
              <strong>Replace:</strong> Clears current database and restores file contents.<br>
              <strong>Merge:</strong> Keeps current records and adds only records with new IDs.<br>
              <em>Note: An automatic safety backup of current data will download before applying.</em>
            </div>
            <div style="display: flex; gap: 8px; flex-wrap: wrap;">
              <button class="btn btn-danger btn-sm" id="btn-apply-replace">Replace All Data</button>
              <button class="btn btn-primary btn-sm" id="btn-apply-merge">Merge Missing Records</button>
              <button class="btn btn-outline btn-sm" id="btn-cancel-restore">Cancel</button>
            </div>
          </div>
        `;

        previewEl.querySelector('#btn-apply-replace').addEventListener('click', async () => {
          const ok = await CP.ui.confirm("Are you sure you want to REPLACE all current database records? All existing data will be overwritten.");
          if (ok) doApplyRestore(selectedBackupObj, 'replace');
        });
        previewEl.querySelector('#btn-apply-merge').addEventListener('click', () => doApplyRestore(selectedBackupObj, 'merge'));
        previewEl.querySelector('#btn-cancel-restore').addEventListener('click', () => {
          previewEl.style.display = 'none';
          previewEl.innerHTML = '';
          selectedBackupObj = null;
        });
      } catch (err) {
        console.error('[CP.data] Error parsing JSON backup file:', err);
        if (CP.ui && typeof CP.ui.toast === 'function') CP.ui.toast('Failed to parse backup file: Invalid JSON syntax.', 'danger');
      }
    };
    reader.readAsText(file);
  }

  function doApplyRestore(json, mode) {
    try {
      restoreBackup(json, mode);
      if (CP.ui && typeof CP.ui.toast === 'function') CP.ui.toast(`Database restored successfully (${mode} mode). Reloading...`, 'success');
      setTimeout(() => {
        if (typeof window !== 'undefined' && window.location) {
          window.location.hash = '#/dashboard';
          window.location.reload();
        }
      }, 750);
    } catch (e) {
      console.error('[CP.data] Restore error:', e);
      if (CP.ui && typeof CP.ui.toast === 'function') CP.ui.toast(e.message || 'Error restoring backup.', 'danger');
    }
  }

  return {
    render, destroy() { activeContainer = null; selectedBackupObj = null; },
    getCounts, getStorageUsage, exportFullBackup, validateBackup, restoreBackup,
    exportOrdersCSV, exportOrderLinesCSV, exportPaymentsCSV, exportSpoolsCSV,
    exportStockLedgerCSV, exportScrapCSV, exportQCCSV, exportMaintCSV,
    exportSalesRegisterCSV, exportReceiptsCSV
  };
})();

CP.registerModule({
  id: 'data',
  route: '#/data',
  title: 'Data & Backup',
  icon: '💾',
  render: CP.data.render,
  destroy: CP.data.destroy
});
