/**
 * CarbonPrints Company OS - Spool Inventory & Stock Service
 * Global namespace: window.CP.inventory
 * Manages filament spools, stock ledgers, supplier wholesale pricing,
 * margin reporting, and job lifecycle material consumption.
 */
window.CP = window.CP || {};

CP.inventory = (function () {
  let isInitialized = false;

  /**
   * Generates next sequential spool ID per material, e.g. "SP-PLA-04".
   * Never reuses IDs even if spools were removed.
   * @param {string} material - e.g. 'PLA', 'ABS', 'TPU'
   * @returns {string}
   */
  function nextSpoolId(material) {
    const mat = (material || 'PLA').toUpperCase().trim();
    const counters = CP.store.get('cp_counters', {});
    const counterKey = `spool:${mat}`;
    let maxSeq = Number(counters[counterKey]) || 0;

    // Scan all existing spools in database to guarantee no duplicates
    const spools = CP.store.get('cp_spools', []);
    const regex = new RegExp(`^SP-${mat}-(\\d+)$`, 'i');
    spools.forEach(s => {
      const m = (s.id || '').match(regex);
      if (m) {
        const n = parseInt(m[1], 10);
        if (n > maxSeq) maxSeq = n;
      }
    });

    const nextVal = maxSeq + 1;
    counters[counterKey] = nextVal;
    CP.store.set('cp_counters', counters);
    return `SP-${mat}-${CP.util.pad(nextVal, 2)}`;
  }

  /**
   * Adds a new filament spool with purchase ledger entry and supplier price record.
   * @param {Object} data
   * @returns {Object} Created spool object
   */
  function addSpool({ material, color, brand, supplier, initialG, costINR, purchasedAt }) {
    const initG = Math.max(1, Number(initialG) || 1000);
    const cost = Math.max(0, Number(costINR) || 0);
    const mat = (material || 'PLA').toUpperCase().trim();
    const dateStr = purchasedAt || new Date().toISOString();
    const id = nextSpoolId(mat);

    const newSpool = {
      id,
      material: mat,
      color: color ? String(color).trim() : 'Natural',
      brand: brand ? String(brand).trim() : 'Generic',
      supplier: supplier ? String(supplier).trim() : 'Parrys Chennai',
      initialG: initG,
      remainingG: initG,
      costINR: cost,
      purchasedAt: dateStr,
      status: 'active',
      loadedOnPrinterId: null
    };

    const spools = CP.store.get('cp_spools', []);
    spools.push(newSpool);
    CP.store.set('cp_spools', spools);

    // 1. Ledger entry for initial purchase (deltaG = +initialG)
    const ledger = CP.store.get('cp_ledger', []);
    ledger.push({
      id: CP.util.uid('led'),
      ts: dateStr,
      spoolId: id,
      deltaG: initG,
      reason: 'purchase',
      orderId: null,
      printerId: null,
      note: 'Initial spool purchase'
    });
    CP.store.set('cp_ledger', ledger);

    // 2. Supplier price record (pricePerKg = costINR / initialG * 1000)
    const pricePerKg = CP.util.round2((cost / initG) * 1000);
    const prices = CP.store.get('cp_supplier_prices', []);
    prices.push({
      id: CP.util.uid('sup'),
      ts: dateStr,
      supplier: newSpool.supplier,
      material: mat,
      pricePerKg
    });
    CP.store.set('cp_supplier_prices', prices);

    if (CP.bus) CP.bus.emit('stock:changed');
    return newSpool;
  }

  /**
   * Consumes filament from a spool, writes ledger record, and guards against negative stock.
   * @param {string} spoolId
   * @param {number} grams
   * @param {Object} [meta] - { reason: 'print'|'scrap', orderId, printerId, note }
   * @returns {Object|null}
   */
  function consume(spoolId, grams, meta = {}) {
    if (!spoolId) return null;
    const spools = CP.store.get('cp_spools', []);
    const spool = spools.find(s => s.id === spoolId);
    if (!spool) return null;

    const reqG = Math.max(0, Number(grams) || 0);
    let consumedG = reqG;

    // Prevent negative stock: if consumption exceeds remaining, consume what remains
    if (reqG > spool.remainingG) {
      if (CP.ui && typeof CP.ui.toast === 'function') {
        CP.ui.toast(`Spool ${spool.id} has only ${spool.remainingG}g left. Consuming remaining ${spool.remainingG}g.`, 'warning');
      }
      consumedG = spool.remainingG;
      spool.remainingG = 0;
    } else {
      spool.remainingG = CP.util.round2(spool.remainingG - reqG);
    }

    if (spool.remainingG <= 0) {
      spool.remainingG = 0;
      spool.status = 'empty';
    }

    CP.store.set('cp_spools', spools);

    const ledger = CP.store.get('cp_ledger', []);
    ledger.push({
      id: CP.util.uid('led'),
      ts: new Date().toISOString(),
      spoolId: spool.id,
      deltaG: -consumedG,
      reason: meta.reason || 'print',
      orderId: meta.orderId || null,
      printerId: meta.printerId || null,
      note: meta.note || (meta.reason === 'scrap' ? 'Print failure scrap' : 'Job completion print')
    });
    CP.store.set('cp_ledger', ledger);

    if (CP.bus) CP.bus.emit('stock:changed');
    return spool;
  }

  /**
   * Adjusts the remaining grams on a spool with an "adjust" ledger entry.
   * @param {string} spoolId
   * @param {number} newRemainingG
   * @param {string} [note]
   * @returns {Object|null}
   */
  function adjust(spoolId, newRemainingG, note = '') {
    const spools = CP.store.get('cp_spools', []);
    const spool = spools.find(s => s.id === spoolId);
    if (!spool) return null;

    const targetG = Math.max(0, Number(newRemainingG) || 0);
    const deltaG = CP.util.round2(targetG - spool.remainingG);
    spool.remainingG = targetG;

    if (spool.remainingG <= 0) {
      spool.status = 'empty';
    } else if (spool.status === 'empty' && spool.remainingG > 0) {
      spool.status = 'active';
    }

    CP.store.set('cp_spools', spools);

    const ledger = CP.store.get('cp_ledger', []);
    ledger.push({
      id: CP.util.uid('led'),
      ts: new Date().toISOString(),
      spoolId: spool.id,
      deltaG,
      reason: 'adjust',
      orderId: null,
      printerId: null,
      note: note || 'Manual stock adjustment'
    });
    CP.store.set('cp_ledger', ledger);

    if (CP.bus) CP.bus.emit('stock:changed');
    return spool;
  }

  /**
   * Returns active stock summary aggregated by material.
   * @returns {Object.<string, { grams: number, spools: number }>}
   */
  function stockByMaterial() {
    const settings = CP.store.get('cp_settings', CP.defaults ? CP.defaults.settings : {});
    const materials = (settings && settings.materials) ? settings.materials : ['PLA', 'ABS', 'TPU'];
    const spools = CP.store.get('cp_spools', []);
    const result = {};

    materials.forEach(m => {
      result[m] = { grams: 0, spools: 0 };
    });

    spools.forEach(s => {
      if (s.status === 'active') {
        const mat = s.material;
        if (!result[mat]) {
          result[mat] = { grams: 0, spools: 0 };
        }
        result[mat].grams = CP.util.round2(result[mat].grams + (Number(s.remainingG) || 0));
        result[mat].spools += 1;
      }
    });

    return result;
  }

  /**
   * Returns list of materials whose total active grams are below the low stock threshold.
   * @returns {string[]}
   */
  function lowStockAlerts() {
    const settings = CP.store.get('cp_settings', CP.defaults ? CP.defaults.settings : {});
    const thresholdG = settings.production?.lowStockThresholdG ?? 2000;
    const stock = stockByMaterial();
    const alerts = [];

    Object.keys(stock).forEach(mat => {
      if (stock[mat].grams < thresholdG) {
        alerts.push(mat);
      }
    });

    return alerts;
  }

  /**
   * Computes cost per gram for a material.
   * Average of latest 3 supplier prices per kg / 1000, fallback to active spool average.
   * @param {string} material
   * @returns {number}
   */
  function costPerGram(material) {
    const mat = (material || 'PLA').toUpperCase().trim();
    const prices = CP.store.get('cp_supplier_prices', []);
    const matchingPrices = prices
      .filter(p => p.material.toUpperCase() === mat)
      .sort((a, b) => new Date(b.ts || 0) - new Date(a.ts || 0))
      .slice(0, 3);

    if (matchingPrices.length > 0) {
      const sum = matchingPrices.reduce((acc, p) => acc + Number(p.pricePerKg || 0), 0);
      const avgPricePerKg = sum / matchingPrices.length;
      return CP.util.round2(avgPricePerKg / 1000);
    }

    // Fallback: average of active spool costs for this material
    const spools = CP.store.get('cp_spools', []);
    const matchingSpools = spools.filter(s => s.material.toUpperCase() === mat && Number(s.initialG) > 0 && Number(s.costINR) > 0);
    if (matchingSpools.length > 0) {
      const sumPerG = matchingSpools.reduce((acc, s) => acc + (Number(s.costINR) / Number(s.initialG)), 0);
      return CP.util.round2(sumPerG / matchingSpools.length);
    }

    return 0.80; // Baseline fallback
  }

  /**
   * Generates material margin report comparison against selling rates.
   * @returns {Array<{ material: string, sellingRatePerG: number, costPerG: number, marginPerG: number, marginPct: number, belowTarget: boolean }>}
   */
  function marginReport() {
    const settings = CP.store.get('cp_settings', CP.defaults ? CP.defaults.settings : {});
    const materials = (settings && settings.materials) ? settings.materials : ['PLA', 'ABS', 'TPU'];
    const rates = settings.pricing?.ratePerGram || { PLA: 4, ABS: 4, TPU: 4 };
    const minMarginPct = Number(settings.pricing?.minMarginPct) || 40;

    return materials.map(mat => {
      const sellingRatePerG = Number(rates[mat] !== undefined ? rates[mat] : 4);
      const costPerG = costPerGram(mat);
      const marginPerG = CP.util.round2(sellingRatePerG - costPerG);
      const marginPct = sellingRatePerG > 0 ? CP.util.round2((marginPerG / sellingRatePerG) * 100) : 0;
      const belowTarget = marginPct < minMarginPct;

      return {
        material: mat,
        sellingRatePerG,
        costPerG,
        marginPerG,
        marginPct,
        belowTarget
      };
    });
  }

  /**
   * Adds a wholesale supplier price record.
   * @param {Object} data
   * @returns {Object}
   */
  function addSupplierPrice({ supplier, material, pricePerKg, date }) {
    const prices = CP.store.get('cp_supplier_prices', []);
    const record = {
      id: CP.util.uid('sup'),
      ts: date ? new Date(date).toISOString() : new Date().toISOString(),
      supplier: (supplier || 'Parrys Chennai').trim(),
      material: (material || 'PLA').toUpperCase().trim(),
      pricePerKg: CP.util.round2(Number(pricePerKg) || 0)
    };
    prices.push(record);
    CP.store.set('cp_supplier_prices', prices);
    if (CP.bus) CP.bus.emit('stock:changed');
    return record;
  }

  /**
   * Loads a spool on a printer. Prompts to swap if printer already has a loaded spool.
   * @param {string} spoolId
   * @param {number|string} printerId
   * @returns {Promise<boolean>}
   */
  async function loadSpoolOnPrinter(spoolId, printerId) {
    const spools = CP.store.get('cp_spools', []);
    const spool = spools.find(s => s.id === spoolId);
    if (!spool) return false;

    const printers = CP.store.get('cp_printers', []);
    const targetPrId = Number(printerId);
    const printer = printers.find(p => p.id === targetPrId);
    if (!printer) return false;

    // Check if printer already has a loaded spool
    const existingSpool = spools.find(s => s.loadedOnPrinterId === targetPrId && s.id !== spool.id);
    if (existingSpool) {
      const ok = await CP.ui.confirm(`Printer ${printer.name} already has spool ${existingSpool.id} (${existingSpool.color} ${existingSpool.material}) loaded. Swap spools?`);
      if (!ok) return false;
      existingSpool.loadedOnPrinterId = null;
    }

    // Clear any previous printer assignment for this spool
    spools.forEach(s => {
      if (s.id !== spool.id && s.loadedOnPrinterId === targetPrId) {
        s.loadedOnPrinterId = null;
      }
    });

    spool.loadedOnPrinterId = targetPrId;
    printer.material = spool.material;

    CP.store.set('cp_spools', spools);
    CP.store.set('cp_printers', printers);
    if (CP.bus) CP.bus.emit('stock:changed');
    if (CP.ui) CP.ui.toast(`Loaded ${spool.id} onto ${printer.name}`, 'success');
    return true;
  }

  /**
   * Unloads a spool from its current printer.
   * @param {string} spoolId
   * @returns {boolean}
   */
  function unloadSpool(spoolId) {
    const spools = CP.store.get('cp_spools', []);
    const spool = spools.find(s => s.id === spoolId);
    if (!spool) return false;

    spool.loadedOnPrinterId = null;
    CP.store.set('cp_spools', spools);
    if (CP.bus) CP.bus.emit('stock:changed');
    if (CP.ui) CP.ui.toast(`Unloaded ${spool.id}`, 'info');
    return true;
  }

  /**
   * Marks a spool as archived.
   * @param {string} spoolId
   * @returns {boolean}
   */
  function archiveSpool(spoolId) {
    const spools = CP.store.get('cp_spools', []);
    const spool = spools.find(s => s.id === spoolId);
    if (!spool) return false;

    spool.status = 'archived';
    spool.loadedOnPrinterId = null;
    CP.store.set('cp_spools', spools);
    if (CP.bus) CP.bus.emit('stock:changed');
    if (CP.ui) CP.ui.toast(`Spool ${spool.id} archived`, 'info');
    return true;
  }

  /**
   * Refreshes global low-stock alerts without wiping alerts from other modules.
   */
  function updateGlobalAlerts() {
    if (!CP.ui || typeof CP.ui.setAlerts !== 'function') return;
    const settings = CP.store.get('cp_settings', CP.defaults ? CP.defaults.settings : {});
    const thresholdG = settings.production?.lowStockThresholdG ?? 2000;
    const materials = (settings && settings.materials) ? settings.materials : ['PLA', 'ABS', 'TPU'];
    const stock = stockByMaterial();
    const lowMats = lowStockAlerts();

    const alerts = materials.map(mat => {
      const isLow = lowMats.includes(mat);
      const rem = stock[mat] ? stock[mat].grams : 0;
      const id = `low-stock-${mat}`;
      if (isLow) {
        return {
          id,
          kind: 'danger',
          html: `⚠️ <strong>Low Stock Alert:</strong> ${CP.util.esc(mat)} is below threshold (${CP.util.fmtNum(rem)}g remaining of ${CP.util.fmtNum(thresholdG)}g threshold). <a href="#/inventory" style="color: inherit; text-decoration: underline; font-weight: 700; margin-left: 6px;">Reorder now &rarr;</a>`
        };
      } else {
        return { id, html: null }; // Removes alert from active set
      }
    });

    CP.ui.setAlerts(alerts);
  }

  /**
   * Initializes inventory event listeners and updates low-stock banners.
   */
  function init() {
    updateGlobalAlerts();

    if (isInitialized) return;
    isInitialized = true;

    if (!CP.bus) return;

    CP.bus.on('stock:changed', () => {
      updateGlobalAlerts();
    });

    // Handle job completion: consume actual grams with reason "print"
    CP.bus.on('job:completed', (payload) => {
      if (!payload || !payload.spoolId) return;
      const processed = CP.store.get('cp_processed_job_events', []);
      const eventKey = `comp_${payload.orderId}_${payload.partId}_${payload.spoolId}_${payload.gramsActual}`;
      if (processed.includes(eventKey)) return;

      processed.push(eventKey);
      CP.store.set('cp_processed_job_events', processed);

      consume(payload.spoolId, payload.gramsActual, {
        reason: 'print',
        orderId: payload.orderId,
        printerId: payload.printerId,
        note: `Job completed (${payload.partId})`
      });
    });

    // Handle job failure: consume failed grams with reason "scrap"
    CP.bus.on('job:failed', (payload) => {
      if (!payload || !payload.spoolId) return;
      const processed = CP.store.get('cp_processed_job_events', []);
      const eventKey = `fail_${payload.orderId}_${payload.partId}_${payload.spoolId}_${payload.failedG}_${payload.reason || ''}`;
      if (processed.includes(eventKey)) return;

      processed.push(eventKey);
      CP.store.set('cp_processed_job_events', processed);

      consume(payload.spoolId, payload.failedG, {
        reason: 'scrap',
        orderId: payload.orderId,
        printerId: payload.printerId,
        note: `Print failed (${payload.reason || 'Unknown'})`
      });
    });
  }

  function seedInventoryData() {
    const now = Date.now();
    const nowISO = new Date(now).toISOString();

    const spools = [
      { id: 'SP-PLA-01', material: 'PLA', color: 'Jet Black', brand: 'Numakers', supplier: 'Parrys Chennai', initialG: 1000, remainingG: 820, costINR: 850, purchasedAt: new Date(now - 14 * 86400000).toISOString(), status: 'active', loadedOnPrinterId: 1 },
      { id: 'SP-PLA-02', material: 'PLA', color: 'Pure White', brand: 'Numakers', supplier: 'Parrys Chennai', initialG: 1000, remainingG: 960, costINR: 850, purchasedAt: new Date(now - 10 * 86400000).toISOString(), status: 'active', loadedOnPrinterId: null },
      { id: 'SP-PLA-03', material: 'PLA', color: 'Army Green', brand: 'Wol3D', supplier: 'Ambattur Chennai', initialG: 1000, remainingG: 550, costINR: 820, purchasedAt: new Date(now - 6 * 86400000).toISOString(), status: 'active', loadedOnPrinterId: null },
      { id: 'SP-PLA-04', material: 'PLA', color: 'Silk Silver', brand: 'eSun', supplier: 'Parrys Chennai', initialG: 1000, remainingG: 140, costINR: 950, purchasedAt: new Date(now - 20 * 86400000).toISOString(), status: 'active', loadedOnPrinterId: null },
      { id: 'SP-ABS-01', material: 'ABS', color: 'Signal Red', brand: 'Wol3D', supplier: 'Ambattur Chennai', initialG: 1000, remainingG: 640, costINR: 1100, purchasedAt: new Date(now - 8 * 86400000).toISOString(), status: 'active', loadedOnPrinterId: 2 },
      { id: 'SP-ABS-02', material: 'ABS', color: 'Matte Black', brand: 'Wol3D', supplier: 'Parrys Chennai', initialG: 1000, remainingG: 1000, costINR: 1050, purchasedAt: new Date(now - 3 * 86400000).toISOString(), status: 'active', loadedOnPrinterId: null },
      { id: 'SP-ABS-03', material: 'ABS', color: 'Industrial Grey', brand: 'Numakers', supplier: 'Parrys Chennai', initialG: 1000, remainingG: 85, costINR: 1000, purchasedAt: new Date(now - 25 * 86400000).toISOString(), status: 'active', loadedOnPrinterId: null },
      { id: 'SP-TPU-01', material: 'TPU', color: 'Translucent Blue', brand: 'eSun', supplier: 'Parrys Chennai', initialG: 1000, remainingG: 900, costINR: 1450, purchasedAt: new Date(now - 5 * 86400000).toISOString(), status: 'active', loadedOnPrinterId: 5 }
    ];
    CP.store.set('cp_spools', spools);

    const supplierPrices = [
      { id: CP.util.uid('sup'), ts: new Date(now - 14 * 86400000).toISOString(), supplier: 'Parrys Chennai', material: 'PLA', pricePerKg: 850 },
      { id: CP.util.uid('sup'), ts: new Date(now - 10 * 86400000).toISOString(), supplier: 'Parrys Chennai', material: 'PLA', pricePerKg: 820 },
      { id: CP.util.uid('sup'), ts: new Date(now - 4 * 86400000).toISOString(), supplier: 'Ambattur Chennai', material: 'PLA', pricePerKg: 800 },
      { id: CP.util.uid('sup'), ts: new Date(now - 12 * 86400000).toISOString(), supplier: 'Ambattur Chennai', material: 'ABS', pricePerKg: 1100 },
      { id: CP.util.uid('sup'), ts: new Date(now - 5 * 86400000).toISOString(), supplier: 'Parrys Chennai', material: 'ABS', pricePerKg: 1050 },
      { id: CP.util.uid('sup'), ts: new Date(now - 7 * 86400000).toISOString(), supplier: 'Parrys Chennai', material: 'TPU', pricePerKg: 1450 }
    ];
    CP.store.set('cp_supplier_prices', supplierPrices);

    const ledger = [
      { id: CP.util.uid('led'), ts: new Date(now - 14 * 86400000).toISOString(), spoolId: 'SP-PLA-01', deltaG: 1000, reason: 'purchase', orderId: null, printerId: null, note: 'Initial spool purchase' },
      { id: CP.util.uid('led'), ts: new Date(now - 8 * 86400000).toISOString(), spoolId: 'SP-PLA-01', deltaG: -115, reason: 'print', orderId: 'CP-2026-0001', printerId: 1, note: 'Drone arm batch' },
      { id: CP.util.uid('led'), ts: new Date(now - 4 * 86400000).toISOString(), spoolId: 'SP-PLA-01', deltaG: -65, reason: 'print', orderId: 'CP-2026-0001', printerId: 1, note: 'Gripper test' },
      { id: CP.util.uid('led'), ts: new Date(now - 2 * 86400000).toISOString(), spoolId: 'SP-ABS-01', deltaG: -240, reason: 'print', orderId: 'CP-2026-0002', printerId: 2, note: 'Chassis brackets' },
      { id: CP.util.uid('led'), ts: new Date(now - 1 * 86400000).toISOString(), spoolId: 'SP-ABS-01', deltaG: -120, reason: 'scrap', orderId: 'CP-2026-0002', printerId: 2, note: 'Layer shift failure' },
      { id: CP.util.uid('led'), ts: new Date(now - 1 * 86400000).toISOString(), spoolId: 'SP-PLA-04', deltaG: -30, reason: 'adjust', orderId: null, printerId: null, note: 'Scale calibration adjustment' },
      { id: CP.util.uid('led'), ts: new Date(now - 5 * 86400000).toISOString(), spoolId: 'SP-TPU-01', deltaG: 1000, reason: 'purchase', orderId: null, printerId: null, note: 'Initial spool purchase' },
      { id: CP.util.uid('led'), ts: new Date(now - 3 * 86400000).toISOString(), spoolId: 'SP-TPU-01', deltaG: -100, reason: 'print', orderId: 'CP-2026-0004', printerId: 5, note: 'Gasket sample' }
    ];
    CP.store.set('cp_ledger', ledger);

    const counters = CP.store.get('cp_counters', {});
    counters['spool:PLA'] = 4;
    counters['spool:ABS'] = 3;
    counters['spool:TPU'] = 1;
    CP.store.set('cp_counters', counters);

    if (CP.bus) CP.bus.emit('stock:changed');
  }

  return {
    nextSpoolId,
    addSpool,
    consume,
    adjust,
    stockByMaterial,
    lowStockAlerts,
    costPerGram,
    marginReport,
    addSupplierPrice,
    loadSpoolOnPrinter,
    unloadSpool,
    archiveSpool,
    updateGlobalAlerts,
    seedInventoryData,
    init
  };
})();

if (CP.dev && typeof CP.dev.registerSeeder === 'function') {
  CP.dev.registerSeeder(CP.inventory.seedInventoryData);
}
