/**
 * CarbonPrints Company OS - Developer & Demo Data Tools
 * Global namespace: window.CP.dev
 */
window.CP = window.CP || {};

CP.dev = (function () {
  const seeders = [];

  return {
    /**
     * Registers a seeding function that populates demo data.
     * @param {Function} fn - Seeder callback
     */
    registerSeeder(fn) {
      if (typeof fn === 'function') {
        seeders.push(fn);
      }
    },

    /**
     * Executes all registered demo data seeders and refreshes the current view.
     */
    seed() {
      if (seeders.length === 0) {
        if (CP.ui && typeof CP.ui.toast === 'function') {
          CP.ui.toast("No seeders registered yet. Module seeders are added in subsequent prompts.", "info");
        }
        return;
      }

      try {
        seeders.forEach(fn => fn());
        if (CP.store) {
          const meta = CP.store.get('cp_meta', { schemaVersion: 1, lastBackupAt: null });
          meta.lastBackupAt = new Date().toISOString();
          CP.store.set('cp_meta', meta);
        }

        if (CP.ui && typeof CP.ui.toast === 'function') {
          CP.ui.toast("Demo data seeded successfully!", "success");
        }

        // Re-trigger current route rendering
        if (CP.router && typeof window !== 'undefined' && window.location) {
          const currentHash = window.location.hash || '#/dashboard';
          window.location.hash = '';
          window.location.hash = currentHash;
        }
      } catch (err) {
        console.error('[CP.dev] Error seeding data:', err);
        if (CP.ui && typeof CP.ui.toast === 'function') {
          CP.ui.toast("Failed to seed demo data. Check console for details.", "danger");
        }
      }
    },

    /**
     * Safe reset: clears operational data (orders, spools, scrap, qc, maint log, counters, drafts),
     * while preserving business configuration, printer profiles, pricing settings, and maint checklists.
     */
    async safeReset() {
      if (!CP.ui) return;
      const confirmed = await CP.ui.confirm(
        "SAFE RESET: This will clear operational data (all orders, spools, scrap records, QC entries, maintenance logs, and counter sequences).\n\n" +
        "Your business details, printer slots, custom pricing rates, and maintenance checklist tasks will be PRESERVED.\n\n" +
        "Are you sure you want to proceed?"
      );
      if (!confirmed) return;

      try {
        const operationalKeys = [
          'cp_orders', 'cp_expenses', 'cp_spools', 'cp_ledger', 'cp_scrap',
          'cp_qc', 'cp_maint_log', 'cp_counters', 'cp_draft_order'
        ];
        operationalKeys.forEach(k => {
          if (k === 'cp_counters') {
            CP.store.set(k, {});
          } else if (k === 'cp_draft_order') {
            CP.store.remove(k);
          } else {
            CP.store.set(k, []);
          }
        });

        CP.ui.toast("Operational data cleared. Business settings & printers preserved.", "success");
        setTimeout(() => {
          if (typeof window !== 'undefined' && window.location) {
            window.location.hash = '#/dashboard';
            window.location.reload();
          }
        }, 400);
      } catch (err) {
        console.error('[CP.dev] Error during safe reset:', err);
        CP.ui.toast("Error clearing operational data: " + (err.message || err), "danger");
      }
    },

    /**
     * Full Factory Reset: Confirms and clears all cp_* localStorage entries, then restores clean defaults.
     * Generates a pre-reset safety backup download first to prevent accidental data loss.
     */
    async reset() {
      if (!CP.ui) return;

      const confirmed = await CP.ui.confirm(
        "DANGER - FULL FACTORY RESET: This will PERMANENTLY ERASE ALL data, including orders, inventory, printer profiles, and configured business & pricing settings.\n\n" +
        "A safety backup copy will be automatically downloaded before clearing.\n\n" +
        "Are you sure you want to wipe everything and restore fresh defaults?"
      );

      if (!confirmed) return;

      try {
        // Download a pre-reset safety backup file
        if (typeof window !== 'undefined' && window.document) {
          try {
            const dump = (CP.store && typeof CP.store.exportAll === 'function') ? CP.store.exportAll() : {};
            const payload = {
              app: 'CarbonPrints Company OS',
              version: CP.version || '0.1.0',
              exportedAt: new Date().toISOString(),
              note: 'Pre-Reset Safety Backup',
              ...dump
            };
            const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `carbonprints-safety-backup-${new Date().toISOString().slice(0, 10)}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
          } catch (backupErr) {
            console.warn('[CP.dev] Could not create pre-reset download:', backupErr);
          }
        }

        const toRemove = [];
        if (typeof localStorage !== 'undefined') {
          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.startsWith('cp_')) {
              toRemove.push(k);
            }
          }
          toRemove.forEach(k => localStorage.removeItem(k));
        }

        // Re-seed clean defaults
        if (CP.store && typeof CP.store.init === 'function') {
          CP.store.init();
        }

        CP.ui.toast("Factory reset complete. Defaults restored.", "success");

        // Reload page to guarantee clean state
        setTimeout(() => {
          if (typeof window !== 'undefined' && window.location) {
            window.location.hash = '#/dashboard';
            window.location.reload();
          }
        }, 400);
      } catch (err) {
        console.error('[CP.dev] Error during data reset:', err);
        CP.ui.toast("Error resetting data. Check console.", "danger");
      }
    },

    /**
     * Alias for full factory reset
     */
    async fullReset() {
      return this.reset();
    }
  };
})();

// Register sample order and customer seeder in CP.dev
if (CP.dev && typeof CP.dev.registerSeeder === 'function') {
  CP.dev.registerSeeder(() => {
    const settings = CP.store ? CP.store.get('cp_settings', CP.defaults ? CP.defaults.settings : {}) : {};
    const existingOrders = CP.store ? CP.store.get('cp_orders', []) : [];
    const sampleSeeds = [
      { customer: { name: 'Aravind Kumar', phone: '9840123456', email: 'aravind@aerovision.in', category: 'Hardware Startup R&D' }, status: 'confirmed', dueDate: CP.util.addDays(CP.util.todayISO(), 3), notes: 'Enclosure prototyping v1.4', advance: 500, parts: [{ name: 'Sensor Enclosure Top', material: 'ABS', layer: '0.20', infillPct: 30, weightG: 45, qty: 2 }, { name: 'Sensor Enclosure Base', material: 'ABS', layer: '0.20', infillPct: 40, weightG: 55, qty: 2 }] },
      { customer: { name: 'Pooja Sundaram', phone: '9789012345', email: 'pooja.s@annauniv.edu', category: 'College Project' }, status: 'quote', dueDate: CP.util.addDays(CP.util.todayISO(), 2), notes: 'Final year quadcopter arm', advance: 0, parts: [{ name: 'Quadcopter Arm Mount', material: 'PLA', layer: '0.28', infillPct: 25, weightG: 65, qty: 4 }] },
      { customer: { name: 'Apex Auto Dynamics', phone: '9444012345', email: 'service@apexauto.in', category: 'Automotive Garage' }, status: 'confirmed', dueDate: CP.util.addDays(CP.util.todayISO(), 4), notes: 'Dashboard gauge mount and intake duct', advance: 1000, parts: [{ name: 'Gauge Pod Mount', material: 'ABS', layer: '0.12', infillPct: 50, weightG: 80, qty: 1 }, { name: 'Air Intake Snorkel Joint', material: 'TPU', layer: '0.20', infillPct: 100, weightG: 120, qty: 1 }] },
      { customer: { name: 'Vignesh R', phone: '9884012345', email: 'vignesh.r@gmail.com', category: 'Hobbyist' }, status: 'quote', dueDate: CP.util.addDays(CP.util.todayISO(), 5), notes: 'Mechanical keyboard case', advance: 0, parts: [{ name: '60% Keyboard Top Case', material: 'PLA', layer: '0.20', infillPct: 20, weightG: 140, qty: 1 }] }
    ];
    const seededOrders = [...existingOrders];
    sampleSeeds.forEach(seed => {
      const orderId = CP.util.nextId('order'), nowISO = new Date().toISOString();
      const parts = seed.parts.map(p => ({ id: CP.util.uid('pt'), name: p.name, material: p.material, layer: p.layer, infillPct: p.infillPct, weightG: p.weightG, qty: p.qty, printHoursOverride: null, status: 'pending', assignedPrinterId: null, spoolId: null, notes: '' }));
      const calc = CP.pricing.calcOrder({ customer: seed.customer, parts, pricing: { advance: seed.advance } }, settings);
      seededOrders.push({
        id: orderId, createdAt: nowISO, updatedAt: nowISO, customer: seed.customer, dueDate: seed.dueDate, notes: seed.notes, parts,
        pricing: { ...calc, isSnapshotted: true },
        payment: { status: seed.advance > 0 ? 'advance' : 'unpaid', paidAmount: seed.advance, history: seed.advance > 0 ? [{ id: CP.util.uid('pay'), ts: nowISO, amount: seed.advance, mode: 'UPI', txnRef: 'UPI-DEMO-SEED', note: 'Advance payment' }] : [] },
        status: seed.status, invoiceNo: null, challanNo: null
      });
    });
    if (CP.store) {
      CP.store.set('cp_orders', seededOrders);
      if (CP.customers && typeof CP.customers.learnFromOrders === 'function') {
        CP.customers.learnFromOrders();
      }
    }
  });
}

CP.dev.seedFarmData = function () {
  const settings = (CP.store && CP.store.get('cp_settings')) || (CP.defaults ? CP.defaults.settings : {});
  const now = Date.now(), nowISO = new Date(now).toISOString();

  let spools = (CP.store && CP.store.get('cp_spools', [])) || [];
  if (!spools || spools.length === 0) {
    spools = [
      { id: 'SP-PLA-01', material: 'PLA', color: 'Jet Black', brand: 'Numakers', supplier: 'Parrys Chennai', initialG: 1000, remainingG: 820, costINR: 950, purchasedAt: nowISO, status: 'active', loadedOnPrinterId: 1 },
      { id: 'SP-PLA-02', material: 'PLA', color: 'Pure White', brand: 'Numakers', supplier: 'Parrys Chennai', initialG: 1000, remainingG: 960, costINR: 950, purchasedAt: nowISO, status: 'active', loadedOnPrinterId: null },
      { id: 'SP-ABS-01', material: 'ABS', color: 'Signal Red', brand: 'Wol3D', supplier: 'Ambattur Chennai', initialG: 1000, remainingG: 640, costINR: 1100, purchasedAt: nowISO, status: 'active', loadedOnPrinterId: 2 },
      { id: 'SP-TPU-01', material: 'TPU', color: 'Translucent Blue', brand: 'eSun', supplier: 'Parrys Chennai', initialG: 1000, remainingG: 900, costINR: 1450, purchasedAt: nowISO, status: 'active', loadedOnPrinterId: 5 }
    ];
    if (CP.store) CP.store.set('cp_spools', spools);
  }

  let orders = (CP.store && CP.store.get('cp_orders', [])) || [];
  const mkPart = (name, mat, layer, infill, wt, qty, status, prId, spId) => ({
    id: CP.util.uid('pt'), name, material: mat, layer, infillPct: infill, weightG: wt, qty,
    printHoursOverride: null, status, assignedPrinterId: prId, spoolId: spId, notes: ''
  });
  const mkOrder = (id, daysOffset, cust, notes, parts, st, adv) => {
    const calc = CP.pricing ? CP.pricing.calcOrder({ parts, pricing: { advance: adv } }, settings) : { subtotal: 400, total: 400 };
    return {
      id, createdAt: new Date(now - 86400000).toISOString(), updatedAt: nowISO, customer: cust,
      dueDate: CP.util.addDays(CP.util.todayISO(), daysOffset), notes, parts,
      pricing: { subtotal: calc.subtotal, discountPct: 0, discountAmt: 0, gstPct: 0, gstAmt: 0, total: calc.total, advance: adv },
      payment: { status: adv > 0 ? 'advance' : 'unpaid', paidAmount: adv, history: adv > 0 ? [{ id: CP.util.uid('pay'), ts: nowISO, amount: adv, mode: 'UPI', txnRef: 'UPI-DEMO', note: 'Advance' }] : [] },
      status: st, invoiceNo: null, challanNo: null
    };
  };

  if (!orders.find(o => o.id === 'CP-2026-0001')) orders.push(mkOrder('CP-2026-0001', 3, { name: 'Aravind Kumar', phone: '9840123456', email: 'aravind@aerovision.in', category: 'Hardware Startup R&D' }, 'Robotic arm link', [mkPart('Robotic Gripper Finger', 'PLA', '0.20', 35, 65, 1, 'printing', 1, 'SP-PLA-01')], 'printing', 200));
  if (!orders.find(o => o.id === 'CP-2026-0002')) orders.push(mkOrder('CP-2026-0002', 2, { name: 'Pooja Sundaram', phone: '9789012345', email: 'pooja.s@annauniv.edu', category: 'College Project' }, 'UAV mount', [mkPart('Quadcopter Motor Mount', 'ABS', '0.20', 40, 85, 1, 'printing', 2, 'SP-ABS-01')], 'printing', 300));

  let pendingCount = 0;
  orders.forEach(o => { if (o.status === 'confirmed' || o.status === 'printing') (o.parts || []).forEach(p => { if (p.status === 'pending') pendingCount++; }); });
  if (pendingCount < 5) {
    orders.push(
      mkOrder('CP-2026-0003', 1, { name: 'Apex Auto Dynamics', phone: '9444012345', email: 'service@apexauto.in', category: 'Automotive Garage' }, 'Priority telemetry mounts', [mkPart('Drone Gimbal Baseplate', 'PLA', '0.20', 30, 45, 1, 'pending', null, null), mkPart('Telemetry Mast Clamp', 'ABS', '0.20', 45, 35, 2, 'pending', null, null)], 'confirmed', 500),
      mkOrder('CP-2026-0004', 2, { name: 'Vignesh R', phone: '9884012345', email: 'vignesh.r@gmail.com', category: 'Hobbyist' }, 'Action camera shoe', [mkPart('GoPro Helmet J-Hook', 'TPU', '0.20', 100, 40, 1, 'pending', null, null), mkPart('Handlebar Spreader Clamp', 'ABS', '0.12', 50, 30, 2, 'pending', null, null)], 'confirmed', 400),
      mkOrder('CP-2026-0005', 4, { name: 'IIT Madras Tech Club', phone: '9840998877', email: 'sae@iitm.ac.in', category: 'College Project' }, 'Aero wing test flap', [mkPart('Formula Student Aero Flap', 'PLA', '0.28', 20, 140, 1, 'pending', null, null), mkPart('ECU Module Enclosure Lid', 'PLA', '0.20', 30, 50, 1, 'pending', null, null)], 'confirmed', 600)
    );
  }
  if (CP.store) CP.store.set('cp_orders', orders);

  const printers = [];
  for (let i = 1; i <= 10; i++) {
    const curJob = i === 1 ? { orderId: 'CP-2026-0001', partId: 'pt_farm_01', partName: 'Robotic Gripper Finger', material: 'PLA', spoolId: 'SP-PLA-01', gramsPlanned: 65, startedAt: new Date(now - 38 * 60000).toISOString(), durationMin: 90, jobRunId: 'CP-2026-0001_pt_farm_01_seed' }
      : i === 2 ? { orderId: 'CP-2026-0002', partId: 'pt_farm_02', partName: 'Quadcopter Motor Mount', material: 'ABS', spoolId: 'SP-ABS-01', gramsPlanned: 85, startedAt: new Date(now - 75 * 60000).toISOString(), durationMin: 120, jobRunId: 'CP-2026-0002_pt_farm_02_seed' }
      : null;
    printers.push({
      id: i, name: `Printer ${String(i).padStart(2, '0')}`,
      model: i <= 2 ? 'Bambu Lab X1-Carbon' : i === 3 ? 'Bambu Lab P1S' : i === 4 ? 'Ender 3' : i === 5 ? 'Ender 3 Pro' : 'Ender 3',
      status: i <= 2 ? 'printing' : i === 3 ? 'maint' : i === 4 ? 'error' : i === 5 ? 'post' : 'idle',
      statusNote: i === 3 ? 'Carbon rod IPA wipe & Z lead screw lube' : i === 4 ? 'Nozzle clog - awaiting hotend clearance' : '',
      material: i === 2 || i === 4 ? 'ABS' : i === 5 ? 'TPU' : 'PLA', currentJob: curJob,
      nozzle: { type: i <= 3 ? 'hardened_steel' : 'brass', installedAt: nowISO, gramsExtruded: 1200 + i * 200, abrasiveGramsExtruded: 150 },
      integration: i <= 3 ? 'bambu' : 'none', octoprint: { url: '', apiKey: '' },
      bambu: { ip: i <= 3 ? `192.168.1.10${i}` : '', accessCode: i <= 3 ? '12345678' : '', serial: i <= 3 ? `01P00A12345600${i}` : '', bridgeUrl: 'http://127.0.0.1:5005' }
    });
  }
  if (CP.store) CP.store.set('cp_printers', printers);
};

