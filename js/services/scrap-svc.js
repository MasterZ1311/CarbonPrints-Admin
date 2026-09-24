/**
 * CarbonPrints Company OS - Quality Control & Scrap Tracking Service
 * Global namespace: window.CP.scrap
 * Tracks failed prints, scrap analytics, reason breakdowns, machine KPI metrics,
 * and handles lifecycle event deduplication from the farm board.
 */
window.CP = window.CP || {};

CP.scrap = (function () {
  let isInitialized = false;

  /**
   * Standard failure reasons across CarbonPrints operations.
   */
  const FAILURE_REASONS = [
    'Spaghetti',
    'Warping',
    'Layer shift',
    'Nozzle clog',
    'Bed adhesion',
    'Power cut',
    'Other'
  ];

  /**
   * Helper to check if a timestamp falls within a selected time window.
   * @param {string} ts - ISO timestamp string
   * @param {"30d"|"month"|"all"} range - Time range
   * @returns {boolean}
   */
  function isInRange(ts, range) {
    if (!ts || range === 'all') return true;
    const d = new Date(ts);
    if (isNaN(d.getTime())) return false;
    const now = new Date();

    if (range === 'month') {
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    }
    if (range === '30d') {
      const diffMs = now.getTime() - d.getTime();
      return diffMs >= 0 && diffMs <= 30 * 24 * 60 * 60 * 1000;
    }
    return true;
  }

  /**
   * Appends a new scrap record to cp_scrap and emits bus event.
   * @param {Object} entry - Scrap details
   * @returns {Object} Created scrap record
   */
  function add(entry) {
    if (!entry || typeof entry !== 'object') {
      throw new Error('Invalid scrap entry object');
    }

    const list = CP.store.get('cp_scrap', []);
    const record = {
      id: entry.id || (CP.util ? CP.util.uid('scr') : `scr_${Date.now()}`),
      ts: entry.ts || new Date().toISOString(),
      printerId: (entry.printerId !== undefined && entry.printerId !== null && entry.printerId !== '') ? Number(entry.printerId) : null,
      orderId: entry.orderId || null,
      partId: entry.partId || null,
      material: entry.material || 'PLA',
      grams: Math.max(0, Number(entry.grams) || 0),
      reason: entry.reason || 'Other',
      notes: entry.notes || '',
      source: entry.source || 'manual' // 'farm' | 'qc' | 'manual'
    };

    list.unshift(record);
    CP.store.set('cp_scrap', list);

    if (CP.bus) {
      CP.bus.emit('scrap:changed', record);
    }

    return record;
  }

  /**
   * Calculates scrap and consumption totals for a given time range.
   * @param {"30d"|"month"|"all"} [range="30d"] - Time range
   * @returns {{ scrapG: number, consumedG: number, scrapPct: number }}
   */
  function totals(range = '30d') {
    const scrapList = CP.store.get('cp_scrap', []);
    let scrapG = 0;
    scrapList.forEach(s => {
      if (isInRange(s.ts, range)) {
        scrapG += (Number(s.grams) || 0);
      }
    });

    // consumedG = sum of absolute deltaG of ledger entries with reason "print" or "scrap" in range
    const ledger = CP.store.get('cp_ledger', []);
    let consumedG = 0;
    ledger.forEach(l => {
      if ((l.reason === 'print' || l.reason === 'scrap') && isInRange(l.ts, range)) {
        consumedG += Math.abs(Number(l.deltaG) || 0);
      }
    });

    const scrapPct = consumedG === 0 ? 0 : Math.round((scrapG / consumedG) * 1000) / 10;

    return {
      scrapG: Math.round(scrapG * 10) / 10,
      consumedG: Math.round(consumedG * 10) / 10,
      scrapPct: Number(scrapPct.toFixed(1))
    };
  }

  /**
   * Aggregates scrap by failure reason in descending order of grams.
   * @param {"30d"|"month"|"all"} [range="30d"] - Time range
   * @returns {Array<{ reason: string, grams: number, count: number, pct: number }>}
   */
  function byReason(range = '30d') {
    const scrapList = CP.store.get('cp_scrap', []);
    const map = new Map();

    FAILURE_REASONS.forEach(r => {
      map.set(r, { reason: r, grams: 0, count: 0 });
    });

    let totalRangeScrap = 0;
    scrapList.forEach(s => {
      if (isInRange(s.ts, range)) {
        const r = s.reason || 'Other';
        if (!map.has(r)) {
          map.set(r, { reason: r, grams: 0, count: 0 });
        }
        const item = map.get(r);
        const g = Number(s.grams) || 0;
        item.grams += g;
        item.count += 1;
        totalRangeScrap += g;
      }
    });

    const result = Array.from(map.values()).map(item => ({
      reason: item.reason,
      grams: Math.round(item.grams * 10) / 10,
      count: item.count,
      pct: totalRangeScrap === 0 ? 0 : Math.round((item.grams / totalRangeScrap) * 1000) / 10
    }));

    result.sort((a, b) => b.grams - a.grams || b.count - a.count);
    return result;
  }

  /**
   * Aggregates scrap by printer in descending order (worst first).
   * @param {"30d"|"month"|"all"} [range="30d"] - Time range
   * @returns {Array<{ printerId: number, printerName: string, grams: number, count: number, pct: number }>}
   */
  function byPrinter(range = '30d') {
    const scrapList = CP.store.get('cp_scrap', []);
    const printers = CP.store.get('cp_printers', []);
    const printerMap = new Map();

    printers.forEach(p => {
      printerMap.set(p.id, {
        printerId: p.id,
        printerName: p.name || `Printer ${String(p.id).padStart(2, '0')}`,
        grams: 0,
        count: 0
      });
    });

    let totalScrap = 0;
    scrapList.forEach(s => {
      if (isInRange(s.ts, range) && s.printerId) {
        const prId = Number(s.printerId);
        if (!printerMap.has(prId)) {
          printerMap.set(prId, {
            printerId: prId,
            printerName: `Printer ${String(prId).padStart(2, '0')}`,
            grams: 0,
            count: 0
          });
        }
        const item = printerMap.get(prId);
        const g = Number(s.grams) || 0;
        item.grams += g;
        item.count += 1;
        totalScrap += g;
      }
    });

    const result = Array.from(printerMap.values()).map(item => ({
      printerId: item.printerId,
      printerName: item.printerName,
      grams: Math.round(item.grams * 10) / 10,
      count: item.count,
      pct: totalScrap === 0 ? 0 : Math.round((item.grams / totalScrap) * 1000) / 10
    }));

    result.sort((a, b) => b.grams - a.grams || b.count - a.count);
    return result;
  }

  /**
   * Evaluates scrap percentage against the target threshold in settings.
   * Returns "good" when pct <= target, "warn" when up to 2x target, else "bad".
   * @param {number} pct - Calculated scrap percentage
   * @returns {"good"|"warn"|"bad"}
   */
  function scrapStatus(pct) {
    const settings = CP.store.get('cp_settings', CP.defaults ? CP.defaults.settings : {});
    const target = Number(settings?.production?.scrapTargetPct) || 5;
    if (pct <= target) return 'good';
    if (pct <= target * 2) return 'warn';
    return 'bad';
  }

  /**
   * Subscribes to farm board job events and registers failure listeners.
   */
  function init() {
    if (isInitialized) return;
    isInitialized = true;

    if (!CP.bus) return;

    // Handle job:failed event from farm board
    CP.bus.on('job:failed', (payload) => {
      if (!payload) return;

      // Guard against double processing using stored processed keys
      const processed = CP.store.get('cp_processed_job_events', []);
      const eventKey = `scrap_fail_${payload.orderId}_${payload.partId}_${payload.spoolId}_${payload.failedG}_${payload.reason || ''}`;
      if (processed.includes(eventKey)) return;

      processed.push(eventKey);
      CP.store.set('cp_processed_job_events', processed);

      add({
        printerId: payload.printerId,
        orderId: payload.orderId,
        partId: payload.partId,
        material: payload.material || 'PLA',
        grams: payload.failedG,
        reason: payload.reason || 'Other',
        notes: payload.notes || '',
        source: 'farm'
      });
    });
  }

  /**
   * Seeds demo data: 12 scrap entries and 5 QC records (one failing).
   */
  function seedScrapData() {
    const now = Date.now();
    const dayMs = 86400000;

    // 1. Seed 12 scrap entries across printers and reasons
    const scrapEntries = [
      { id: 'SCR-2026-001', ts: new Date(now - 1 * dayMs).toISOString(), printerId: 4, orderId: 'CP-2026-0001', partId: 'pt_01', material: 'PLA', grams: 65, reason: 'Nozzle clog', notes: 'Extrusion stopped halfway', source: 'farm' },
      { id: 'SCR-2026-002', ts: new Date(now - 2 * dayMs).toISOString(), printerId: 2, orderId: 'CP-2026-0002', partId: 'pt_02', material: 'ABS', grams: 85, reason: 'Warping', notes: 'Lifted from bed corner', source: 'farm' },
      { id: 'SCR-2026-003', ts: new Date(now - 3 * dayMs).toISOString(), printerId: 1, orderId: null, partId: null, material: 'PLA', grams: 40, reason: 'Spaghetti', notes: 'Purge line failure overnight', source: 'manual' },
      { id: 'SCR-2026-004', ts: new Date(now - 4 * dayMs).toISOString(), printerId: 5, orderId: 'CP-2026-0003', partId: 'pt_03', material: 'TPU', grams: 35, reason: 'Bed adhesion', notes: 'Part dislodged at layer 20', source: 'farm' },
      { id: 'SCR-2026-005', ts: new Date(now - 6 * dayMs).toISOString(), printerId: 3, orderId: null, partId: null, material: 'ABS', grams: 50, reason: 'Layer shift', notes: 'Y-axis belt slipped on tall print', source: 'qc' },
      { id: 'SCR-2026-006', ts: new Date(now - 8 * dayMs).toISOString(), printerId: 7, orderId: 'CP-2026-0004', partId: 'pt_04', material: 'PLA', grams: 110, reason: 'Power cut', notes: 'UPS cut out after 45 mins', source: 'farm' },
      { id: 'SCR-2026-007', ts: new Date(now - 11 * dayMs).toISOString(), printerId: 4, orderId: null, partId: null, material: 'ABS', grams: 75, reason: 'Nozzle clog', notes: 'Burnt residue clog', source: 'manual' },
      { id: 'SCR-2026-008', ts: new Date(now - 14 * dayMs).toISOString(), printerId: 8, orderId: 'CP-2026-0005', partId: 'pt_05', material: 'PLA', grams: 30, reason: 'Warping', notes: 'Cooling fan draft issue', source: 'farm' },
      { id: 'SCR-2026-009', ts: new Date(now - 18 * dayMs).toISOString(), printerId: 2, orderId: null, partId: null, material: 'ABS', grams: 90, reason: 'Bed adhesion', notes: 'PEI sheet needed alcohol wipe', source: 'manual' },
      { id: 'SCR-2026-010', ts: new Date(now - 22 * dayMs).toISOString(), printerId: 6, orderId: null, partId: null, material: 'PLA', grams: 25, reason: 'Other', notes: 'Filament tangle on spool holder', source: 'manual' },
      { id: 'SCR-2026-011', ts: new Date(now - 25 * dayMs).toISOString(), printerId: 4, orderId: null, partId: null, material: 'ABS', grams: 60, reason: 'Spaghetti', notes: 'Support detachment', source: 'farm' },
      { id: 'SCR-2026-012', ts: new Date(now - 28 * dayMs).toISOString(), printerId: 10, orderId: null, partId: null, material: 'TPU', grams: 45, reason: 'Layer shift', notes: 'Extruder stepper skip', source: 'qc' }
    ];
    CP.store.set('cp_scrap', scrapEntries);

    // 2. Seed 5 QC records (4 passing, 1 failing)
    const qcRecords = [
      {
        id: 'QC-2026-001',
        ts: new Date(now - 1 * dayMs).toISOString(),
        orderId: 'CP-2026-0001',
        partId: 'pt_qc_01',
        partName: 'Robotic Gripper Finger',
        inspector: 'Karthik (Intern)',
        nominal: { x: 20.00, y: 50.00, z: 15.00 },
        measured: { x: 20.10, y: 49.95, z: 15.05 },
        checks: { surface: true, supports: true, packed: true, label: true },
        dimOk: { x: true, y: true, z: true },
        result: 'pass',
        override: false,
        notes: 'Dimensional inspection within +/-0.2mm tolerance. Clean finish.'
      },
      {
        id: 'QC-2026-002',
        ts: new Date(now - 2 * dayMs).toISOString(),
        orderId: 'CP-2026-0002',
        partId: 'pt_qc_02',
        partName: 'Quadcopter Motor Mount',
        inspector: 'Sneha (Intern)',
        nominal: { x: 45.00, y: 45.00, z: 8.00 },
        measured: { x: 45.15, y: 44.90, z: 8.12 },
        checks: { surface: true, supports: true, packed: true, label: true },
        dimOk: { x: true, y: true, z: true },
        result: 'pass',
        override: false,
        notes: 'Motor screw holes aligned, deburred nicely.'
      },
      {
        id: 'QC-2026-003',
        ts: new Date(now - 3 * dayMs).toISOString(),
        orderId: 'CP-2026-0003',
        partId: 'pt_qc_03',
        partName: 'Telemetry Mast Clamp',
        inspector: 'Karthik (Intern)',
        nominal: { x: 30.00, y: 30.00, z: 25.00 },
        measured: { x: 30.35, y: 30.12, z: 25.08 }, // X is 30.35 -> OUT (+0.35 > 0.20)
        checks: { surface: false, supports: true, packed: false, label: false },
        dimOk: { x: false, y: true, z: true },
        result: 'fail',
        override: false,
        notes: 'X-axis dimension 30.35mm is out of tolerance (+0.35mm vs ±0.2mm). Severe surface layer shift.'
      },
      {
        id: 'QC-2026-004',
        ts: new Date(now - 5 * dayMs).toISOString(),
        orderId: 'CP-2026-0004',
        partId: 'pt_qc_04',
        partName: 'GoPro Helmet J-Hook',
        inspector: 'Sneha (Intern)',
        nominal: { x: 25.00, y: 15.00, z: 35.00 },
        measured: { x: 24.90, y: 15.08, z: 34.95 },
        checks: { surface: true, supports: true, packed: true, label: true },
        dimOk: { x: true, y: true, z: true },
        result: 'pass',
        override: false,
        notes: 'Flexible TPU clip tested on helmet buckle. Good snap fit.'
      },
      {
        id: 'QC-2026-005',
        ts: new Date(now - 7 * dayMs).toISOString(),
        orderId: 'CP-2026-0005',
        partId: 'pt_qc_05',
        partName: 'ECU Module Enclosure Lid',
        inspector: 'Karthik (Intern)',
        nominal: { x: 60.00, y: 40.00, z: 12.00 },
        measured: { x: 60.05, y: 39.90, z: 12.10 },
        checks: { surface: true, supports: true, packed: true, label: true },
        dimOk: { x: true, y: true, z: true },
        result: 'pass',
        override: false,
        notes: 'Snap fit perimeter verified.'
      }
    ];
    CP.store.set('cp_qc', qcRecords);

    // Also ensure cp_ledger has print/scrap records so totals() computes meaningful consumedG
    const ledger = CP.store.get('cp_ledger', []);
    if (ledger.length < 5) {
      ledger.push(
        { id: 'led_demo_01', ts: new Date(now - 2 * dayMs).toISOString(), spoolId: 'SP-PLA-01', deltaG: -180, reason: 'print', orderId: 'CP-2026-0001', note: 'Demo print ledger' },
        { id: 'led_demo_02', ts: new Date(now - 3 * dayMs).toISOString(), spoolId: 'SP-ABS-01', deltaG: -360, reason: 'print', orderId: 'CP-2026-0002', note: 'Demo print ledger' },
        { id: 'led_demo_03', ts: new Date(now - 5 * dayMs).toISOString(), spoolId: 'SP-PLA-01', deltaG: -65, reason: 'scrap', orderId: 'CP-2026-0001', note: 'Demo scrap ledger' },
        { id: 'led_demo_04', ts: new Date(now - 10 * dayMs).toISOString(), spoolId: 'SP-TPU-01', deltaG: -100, reason: 'print', orderId: 'CP-2026-0004', note: 'Demo print ledger' },
        { id: 'led_demo_05', ts: new Date(now - 15 * dayMs).toISOString(), spoolId: 'SP-ABS-01', deltaG: -85, reason: 'scrap', orderId: 'CP-2026-0002', note: 'Demo scrap ledger' }
      );
      CP.store.set('cp_ledger', ledger);
    }
  }

  return {
    add,
    totals,
    byReason,
    byPrinter,
    scrapStatus,
    init,
    seedScrapData,
    FAILURE_REASONS
  };
})();

if (CP.dev && typeof CP.dev.registerSeeder === 'function') {
  CP.dev.registerSeeder(CP.scrap.seedScrapData);
}
