/**
 * CarbonPrints Company OS - Preventive Maintenance Service
 * Global namespace: window.CP.maint
 * Machine service tasks, nozzle wear telemetry, abrasive counters, and global alerts.
 */
window.CP = window.CP || {};

CP.maint = (function () {
  let isInitialized = false;

  function getSettings() {
    return CP.store.get('cp_settings', CP.defaults ? CP.defaults.settings : {});
  }

  /**
   * Evaluates the due / overdue state of a maintenance task.
   * @param {Object} task
   * @returns {{ state: "ok"|"due"|"overdue", dueAt: string|null, daysOverdue: number }}
   */
  function taskStatus(task) {
    if (!task) return { state: 'ok', dueAt: null, daysOverdue: 0 };

    const intervalDays = Math.max(1, Number(task.intervalDays) || 1);
    if (!task.lastDone) {
      return { state: 'due', dueAt: null, daysOverdue: 0 };
    }

    const lastDoneMs = new Date(task.lastDone).getTime();
    if (isNaN(lastDoneMs)) {
      return { state: 'due', dueAt: null, daysOverdue: 0 };
    }

    const intervalMs = intervalDays * 24 * 60 * 60 * 1000;
    const dueMs = lastDoneMs + intervalMs;
    const dueAt = new Date(dueMs).toISOString();
    const now = Date.now();

    if (now < dueMs) {
      return { state: 'ok', dueAt, daysOverdue: 0 };
    }

    const msLate = now - dueMs;
    const daysLate = msLate / (24 * 60 * 60 * 1000);
    // Overdue means more than 1 interval-day late (for daily tasks: more than 1 day late)
    const isOverdue = daysLate > intervalDays;

    return {
      state: isOverdue ? 'overdue' : 'due',
      dueAt,
      daysOverdue: Math.max(0, Math.floor(daysLate))
    };
  }

  /**
   * Returns total count of tasks currently in overdue state across all printers.
   * @returns {number}
   */
  function overdueCount() {
    const tasks = CP.store.get('cp_maint_tasks', []);
    let count = 0;
    tasks.forEach(t => {
      if (taskStatus(t).state === 'overdue') count++;
    });
    return count;
  }

  /**
   * Checks printers against nozzle abrasive extrusion limits.
   * @returns {Array<{ printerId: number, printerName: string, abrasiveGrams: number, limitG: number, level: "danger"|"warn", pct: number }>}
   */
  function nozzleAlerts() {
    const printers = CP.store.get('cp_printers', []);
    const settings = getSettings();
    const limitG = Number(settings.production?.nozzleLifeLimitG) || 5000;
    const alerts = [];

    printers.forEach(p => {
      const abrasiveG = Number(p.nozzle?.abrasiveGramsExtruded) || 0;
      const pct = Math.round((abrasiveG / limitG) * 100);
      if (abrasiveG >= limitG) {
        alerts.push({
          printerId: p.id,
          printerName: p.name || `Printer ${String(p.id).padStart(2, '0')}`,
          abrasiveGrams: abrasiveG,
          limitG,
          level: 'danger',
          pct
        });
      } else if (abrasiveG >= limitG * 0.8) {
        alerts.push({
          printerId: p.id,
          printerName: p.name || `Printer ${String(p.id).padStart(2, '0')}`,
          abrasiveGrams: abrasiveG,
          limitG,
          level: 'warn',
          pct
        });
      }
    });

    return alerts;
  }

  /**
   * Updates global alerts without overwriting low-stock alerts from inventory.
   */
  function updateGlobalAlerts() {
    if (!CP.ui || typeof CP.ui.setAlerts !== 'function') return;

    const printers = CP.store.get('cp_printers', []);
    const settings = getSettings();
    const limitG = Number(settings.production?.nozzleLifeLimitG) || 5000;
    const alerts = [];

    // 1. Danger alerts for printers over nozzle life limit
    printers.forEach(p => {
      const abrasiveG = Number(p.nozzle?.abrasiveGramsExtruded) || 0;
      const id = `nozzle-${p.id}`;
      if (abrasiveG >= limitG) {
        alerts.push({
          id,
          kind: 'danger',
          html: `⚠️ <strong>Nozzle Wear Critical:</strong> ${CP.util.esc(p.name)} has exceeded abrasive limit (${CP.util.fmtNum(abrasiveG)}g of ${CP.util.fmtNum(limitG)}g). <a href="#/maintenance" style="color: inherit; text-decoration: underline; font-weight: 700; margin-left: 6px;">Replace nozzle &rarr;</a>`
        });
      } else {
        alerts.push({ id, html: null }); // Removes banner if under limit
      }
    });

    // 2. Overdue maintenance routines warning banner
    const ovCount = overdueCount();
    const ovId = 'maint-overdue';
    if (ovCount > 0) {
      alerts.push({
        id: ovId,
        kind: 'warning',
        html: `🔧 <strong>Preventive Maintenance:</strong> ${ovCount} routine${ovCount === 1 ? ' is' : 's are'} overdue. <a href="#/maintenance" style="color: inherit; text-decoration: underline; font-weight: 700; margin-left: 6px;">View Today's Checklist &rarr;</a>`
      });
    } else {
      alerts.push({ id: ovId, html: null });
    }

    CP.ui.setAlerts(alerts);
  }

  /**
   * Marks a maintenance task as completed and appends a log entry.
   * @param {string} taskId
   * @param {string} [doneBy="Operator"]
   * @param {string} [note=""]
   * @returns {Object|null}
   */
  function markDone(taskId, doneBy = 'Operator', note = '') {
    const tasks = CP.store.get('cp_maint_tasks', []);
    const task = tasks.find(t => t.id === taskId);
    if (!task) return null;

    const nowISO = new Date().toISOString();
    task.lastDone = nowISO;
    CP.store.set('cp_maint_tasks', tasks);

    const logList = CP.store.get('cp_maint_log', []);
    const logEntry = {
      id: CP.util ? CP.util.uid('mlog') : `mlog_${Date.now()}`,
      ts: nowISO,
      printerId: task.printerId,
      taskId: task.id,
      key: task.key,
      label: task.label,
      doneBy: (doneBy || 'Operator').trim(),
      note: (note || '').trim()
    };
    logList.unshift(logEntry);
    CP.store.set('cp_maint_log', logList);

    if (CP.bus) CP.bus.emit('maint:changed');
    updateGlobalAlerts();
    return task;
  }

  /**
   * Resets nozzle counters for a printer after hardware replacement.
   * @param {number|string} printerId
   * @param {string} [doneBy="Operator"]
   * @param {string} [note=""]
   * @returns {Object|null}
   */
  function changeNozzle(printerId, doneBy = 'Operator', note = '') {
    const prId = Number(printerId);
    const printers = CP.store.get('cp_printers', []);
    const printer = printers.find(p => p.id === prId);
    if (!printer) return null;

    const nowISO = new Date().toISOString();
    printer.nozzle = {
      type: printer.nozzle?.type || 'brass',
      installedAt: nowISO,
      gramsExtruded: 0,
      abrasiveGramsExtruded: 0
    };
    CP.store.set('cp_printers', printers);

    const logList = CP.store.get('cp_maint_log', []);
    const logEntry = {
      id: CP.util ? CP.util.uid('mlog') : `mlog_${Date.now()}`,
      ts: nowISO,
      printerId: prId,
      taskId: null,
      key: 'nozzle_change',
      label: 'Nozzle changed (counters reset)',
      doneBy: (doneBy || 'Operator').trim(),
      note: (note || 'Installed fresh nozzle').trim()
    };
    logList.unshift(logEntry);
    CP.store.set('cp_maint_log', logList);

    if (CP.bus) CP.bus.emit('maint:changed');
    updateGlobalAlerts();
    return printer;
  }

  /**
   * Subscribes to job completion and failure events to increment nozzle extrusion counters.
   */
  function init() {
    updateGlobalAlerts();

    if (isInitialized) return;
    isInitialized = true;

    if (!CP.bus) return;

    CP.bus.on('maint:changed', () => {
      updateGlobalAlerts();
    });

    // Handle job completion extrusion telemetry
    CP.bus.on('job:completed', (payload) => {
      if (!payload || !payload.printerId) return;

      const processed = CP.store.get('cp_processed_job_events', []);
      const eventKey = `maint_comp_${payload.orderId}_${payload.partId}_${payload.printerId}_${payload.gramsActual}`;
      if (processed.includes(eventKey)) return;

      processed.push(eventKey);
      CP.store.set('cp_processed_job_events', processed);

      const printers = CP.store.get('cp_printers', []);
      const printer = printers.find(p => p.id === Number(payload.printerId));
      if (!printer) return;

      printer.nozzle = printer.nozzle || { type: 'brass', installedAt: new Date().toISOString(), gramsExtruded: 0, abrasiveGramsExtruded: 0 };
      const g = Math.max(0, Number(payload.gramsActual) || 0);
      printer.nozzle.gramsExtruded = (Number(printer.nozzle.gramsExtruded) || 0) + g;

      const settings = getSettings();
      const abrasiveList = settings.production?.abrasiveMaterials || ['ABS'];
      if (abrasiveList.includes(payload.material)) {
        printer.nozzle.abrasiveGramsExtruded = (Number(printer.nozzle.abrasiveGramsExtruded) || 0) + g;
      }

      CP.store.set('cp_printers', printers);
      CP.bus.emit('maint:changed');
    });

    // Handle job failure extrusion telemetry
    CP.bus.on('job:failed', (payload) => {
      if (!payload || !payload.printerId) return;

      const processed = CP.store.get('cp_processed_job_events', []);
      const eventKey = `maint_fail_${payload.orderId}_${payload.partId}_${payload.printerId}_${payload.failedG}_${payload.reason || ''}`;
      if (processed.includes(eventKey)) return;

      processed.push(eventKey);
      CP.store.set('cp_processed_job_events', processed);

      const printers = CP.store.get('cp_printers', []);
      const printer = printers.find(p => p.id === Number(payload.printerId));
      if (!printer) return;

      printer.nozzle = printer.nozzle || { type: 'brass', installedAt: new Date().toISOString(), gramsExtruded: 0, abrasiveGramsExtruded: 0 };
      const g = Math.max(0, Number(payload.failedG) || 0);
      printer.nozzle.gramsExtruded = (Number(printer.nozzle.gramsExtruded) || 0) + g;

      const settings = getSettings();
      const abrasiveList = settings.production?.abrasiveMaterials || ['ABS'];
      if (abrasiveList.includes(payload.material)) {
        printer.nozzle.abrasiveGramsExtruded = (Number(printer.nozzle.abrasiveGramsExtruded) || 0) + g;
      }

      CP.store.set('cp_printers', printers);
      CP.bus.emit('maint:changed');
    });
  }

  /**
   * Seeds realistic demo maintenance tasks, nozzle wear values, and history logs.
   */
  function seedMaintData() {
    const now = Date.now();
    const dayMs = 86400000;
    const nowISO = new Date(now).toISOString();

    // 1. Seed printers with varying nozzle wear (one at 90%, one over limit)
    let printers = CP.store.get('cp_printers', []);
    if (!printers || printers.length === 0) {
      printers = CP.defaults ? JSON.parse(JSON.stringify(CP.defaults.printers)) : [];
    }

    printers.forEach(p => {
      p.nozzle = p.nozzle || { type: 'brass', installedAt: new Date(now - 30 * dayMs).toISOString(), gramsExtruded: 1200, abrasiveGramsExtruded: 400 };
    });

    // Printer 2 at 90% of nozzle limit (4,500g of 5,000g)
    const p2 = printers.find(p => p.id === 2);
    if (p2) {
      p2.nozzle.installedAt = new Date(now - 25 * dayMs).toISOString();
      p2.nozzle.gramsExtruded = 7800;
      p2.nozzle.abrasiveGramsExtruded = 4550; // ~91%
    }

    // Printer 4 over the limit (5,250g of 5,000g)
    const p4 = printers.find(p => p.id === 4);
    if (p4) {
      p4.nozzle.installedAt = new Date(now - 45 * dayMs).toISOString();
      p4.nozzle.gramsExtruded = 9400;
      p4.nozzle.abrasiveGramsExtruded = 5250; // 105% (Trigger danger alert)
    }

    CP.store.set('cp_printers', printers);

    // 2. Seed maintenance tasks across printers with some overdue items
    const taskTemplates = [
      { key: 'bed_level', label: 'Bed leveling check', intervalDays: 1 },
      { key: 'lead_screw_lube', label: 'Lead screw lubrication (white lithium grease)', intervalDays: 7 },
      { key: 'belt_tension', label: 'Belt tension check', intervalDays: 30 }
    ];

    const tasks = [];
    for (let p = 1; p <= 10; p++) {
      taskTemplates.forEach(t => {
        let lastDone = new Date(now - Math.floor(Math.random() * 2) * dayMs).toISOString();

        // Target specific tasks to be due or overdue
        if (p === 1 && t.key === 'bed_level') {
          lastDone = null; // Due immediately
        } else if (p === 2 && t.key === 'bed_level') {
          lastDone = new Date(now - 3 * dayMs).toISOString(); // 2 days overdue
        } else if (p === 3 && t.key === 'lead_screw_lube') {
          lastDone = new Date(now - 18 * dayMs).toISOString(); // 11 days overdue
        } else if (p === 4 && t.key === 'belt_tension') {
          lastDone = new Date(now - 70 * dayMs).toISOString(); // 40 days overdue
        } else if (p === 5 && t.key === 'bed_level') {
          lastDone = nowISO; // Done today (OK)
        }

        tasks.push({
          id: `task_${p}_${t.key}`,
          printerId: p,
          key: t.key,
          label: t.label,
          intervalDays: t.intervalDays,
          lastDone
        });
      });
    }
    CP.store.set('cp_maint_tasks', tasks);

    // 3. Seed maintenance logs
    const maintLogs = [
      { id: 'mlog_01', ts: new Date(now - 1 * dayMs).toISOString(), printerId: 1, taskId: 'task_1_bed_level', key: 'bed_level', label: 'Bed leveling check', doneBy: 'SK', note: 'Z-probe offset calibrated to -1.24mm' },
      { id: 'mlog_02', ts: new Date(now - 4 * dayMs).toISOString(), printerId: 5, taskId: null, key: 'nozzle_change', label: 'Nozzle changed (counters reset)', doneBy: 'AK', note: 'Replaced brass 0.4mm with hardened steel' },
      { id: 'mlog_03', ts: new Date(now - 7 * dayMs).toISOString(), printerId: 2, taskId: 'task_2_lead_screw_lube', key: 'lead_screw_lube', label: 'Lead screw lubrication (white lithium grease)', doneBy: 'SK', note: 'Cleaned brass nut and greased' },
      { id: 'mlog_04', ts: new Date(now - 12 * dayMs).toISOString(), printerId: 3, taskId: 'task_3_belt_tension', key: 'belt_tension', label: 'Belt tension check', doneBy: 'SK', note: 'Tensioned X-axis belt to 85 Hz' }
    ];
    CP.store.set('cp_maint_log', maintLogs);

    if (CP.bus) CP.bus.emit('maint:changed');
    updateGlobalAlerts();
  }

  return {
    init,
    taskStatus,
    overdueCount,
    nozzleAlerts,
    markDone,
    changeNozzle,
    updateGlobalAlerts,
    seedMaintData
  };
})();

if (CP.dev && typeof CP.dev.registerSeeder === 'function') {
  CP.dev.registerSeeder(CP.maint.seedMaintData);
}
