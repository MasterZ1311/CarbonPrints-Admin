/**
 * CarbonPrints Company OS - Preventive Maintenance Module
 * Global namespace: window.CP
 * 3-Tab interface: Today's Checklist, Nozzle Life telemetry, and Service Log & Tasks.
 */
window.CP = window.CP || {};

CP.maintenance = (function () {
  let root = null;
  let activeTab = 'checklist'; // 'checklist' | 'nozzles' | 'tasks'
  let logSearchQuery = '';
  let selectedEditorPrinterId = 1;

  function renderTabsHeader() {
    return `
      <div class="inventory-tabs" role="tablist" style="margin-bottom: 20px;">
        <button type="button" class="inventory-tab-btn ${activeTab === 'checklist' ? 'active' : ''}" data-tab="checklist">
          📋 Today's Checklist
        </button>
        <button type="button" class="inventory-tab-btn ${activeTab === 'nozzles' ? 'active' : ''}" data-tab="nozzles">
          🔍 Nozzle Life
        </button>
        <button type="button" class="inventory-tab-btn ${activeTab === 'tasks' ? 'active' : ''}" data-tab="tasks">
          📜 Service Log &amp; Tasks
        </button>
      </div>`;
  }

  // =========================================================================
  // TAB 1: TODAY'S CHECKLIST
  // =========================================================================

  function renderChecklistTab() {
    const tasks = CP.store.get('cp_maint_tasks', []);
    const printers = CP.store.get('cp_printers', []);
    const storedInitials = localStorage.getItem('cp_maint_initials') || '';

    // Filter only tasks that are due or overdue
    const pendingTasks = tasks.map(t => {
      const status = CP.maint.taskStatus(t);
      return { task: t, status };
    }).filter(item => item.status.state !== 'ok');

    // Group pending tasks by printer
    const grouped = new Map();
    pendingTasks.forEach(item => {
      const prId = item.task.printerId;
      if (!grouped.has(prId)) grouped.set(prId, []);
      grouped.get(prId).push(item);
    });

    const overdueTotal = pendingTasks.filter(i => i.status.state === 'overdue').length;

    let contentHtml = '';
    if (pendingTasks.length === 0) {
      contentHtml = `
        <div class="card">
          <div class="card-header"><div><h2 class="card-title">📋 Today's Maintenance Checklist</h2><div class="card-subtitle">Daily bed leveling, lubrication, and tensioning routines</div></div></div>
          ${CP.ui.emptyState('✨', 'All Tasks Completed!', 'All 10 printers are up to date with preventive maintenance routines.')}
        </div>`;
    } else {
      const printerCards = Array.from(grouped.entries()).sort((a, b) => a[0] - b[0]).map(([prId, items]) => {
        const printer = printers.find(p => p.id === prId) || { name: `Printer ${String(prId).padStart(2, '0')}`, model: 'Ender 3' };
        const rowsHtml = items.map(({ task, status }) => {
          const isOverdue = status.state === 'overdue';
          const badgeHtml = isOverdue
            ? `<span class="badge badge-danger" style="font-weight: 700;">OVERDUE (${status.daysOverdue}d late)</span>`
            : `<span class="badge badge-warning">DUE TODAY</span>`;

          const lastDoneText = task.lastDone ? `Last done: ${CP.util.fmtDate(task.lastDone)}` : 'Never completed';

          return `
            <div style="display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; border-bottom: 1px solid var(--border-color); background: ${isOverdue ? '#fef2f2' : 'transparent'};">
              <label style="display: flex; align-items: center; gap: 12px; cursor: pointer; flex: 1; margin: 0;">
                <input type="checkbox" class="chk-task-select" data-task-id="${task.id}" data-interval="${task.intervalDays}">
                <div>
                  <div style="font-weight: 600; font-size: 13px; color: ${isOverdue ? '#991b1b' : 'inherit'};">
                    ${CP.util.esc(task.label)}
                  </div>
                  <div style="font-size: 11px; color: var(--text-muted);">
                    Interval: ${task.intervalDays} day${task.intervalDays === 1 ? '' : 's'} &bull; ${lastDoneText}
                  </div>
                </div>
              </label>
              <div>${badgeHtml}</div>
            </div>`;
        }).join('');

        return `
          <div class="card" style="margin-bottom: 16px;">
            <div class="card-header" style="background-color: var(--bg-subtle); padding: 10px 16px;">
              <div>
                <strong>${CP.util.esc(printer.name)}</strong>
                <span style="font-size: 12px; color: var(--text-muted); margin-left: 8px;">(${CP.util.esc(printer.model)})</span>
              </div>
              <span class="badge badge-default">${items.length} pending</span>
            </div>
            <div>${rowsHtml}</div>
          </div>`;
      }).join('');

      contentHtml = `
        <div style="display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 12px; background: var(--bg-surface); padding: 14px 18px; border: 1px solid var(--border-color); border-radius: var(--radius-md); margin-bottom: 20px;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <label for="maint-operator-initials" style="font-weight: 700; font-size: 13px;">Operator Initials:</label>
            <input type="text" class="input input-sm" id="maint-operator-initials" value="${CP.util.esc(storedInitials)}" placeholder="e.g. SK" style="width: 100px; text-transform: uppercase;">
          </div>
          <div style="display: flex; gap: 8px;">
            <button type="button" class="btn btn-primary btn-sm" id="btn-mark-selected-done">
              ✓ Mark Selected Done
            </button>
            <button type="button" class="btn btn-secondary btn-sm" id="btn-mark-daily-done">
              ⚡ Mark All Daily Tasks Done
            </button>
          </div>
        </div>
        ${overdueTotal > 0 ? `
          <div class="banner banner-danger" style="margin-bottom: 16px;">
            ⚠️ <strong>Attention:</strong> ${overdueTotal} maintenance task${overdueTotal === 1 ? ' is' : 's are'} overdue. Overdue items are highlighted in red below.
          </div>` : ''}
        ${printerCards}`;
    }

    return contentHtml;
  }

  // =========================================================================
  // TAB 2: NOZZLE LIFE
  // =========================================================================

  function renderNozzleTab() {
    const printers = CP.store.get('cp_printers', []);
    const settings = CP.store.get('cp_settings', CP.defaults ? CP.defaults.settings : {});
    const limitG = Number(settings.production?.nozzleLifeLimitG) || 5000;

    const cardsHtml = printers.map(p => {
      const nozzle = p.nozzle || { type: 'brass', installedAt: new Date().toISOString(), gramsExtruded: 0, abrasiveGramsExtruded: 0 };
      const abrasiveG = Number(nozzle.abrasiveGramsExtruded) || 0;
      const totalG = Number(nozzle.gramsExtruded) || 0;
      const pct = Math.round((abrasiveG / limitG) * 100);

      // Color coding: green < 80%, yellow 80-99%, red >= 100%
      let barColor = 'var(--status-idle)';
      let statusBadge = '<span class="badge badge-success">Good</span>';
      if (pct >= 100) {
        barColor = 'var(--status-error)';
        statusBadge = '<span class="badge badge-danger">Limit Reached</span>';
      } else if (pct >= 80) {
        barColor = 'var(--status-maint)';
        statusBadge = '<span class="badge badge-warning">High Wear</span>';
      }

      const barFillWidth = Math.min(100, pct);
      const installedText = nozzle.installedAt ? CP.util.fmtDate(nozzle.installedAt) : 'N/A';

      return `
        <div class="card" style="padding: 18px; border: ${pct >= 100 ? '2px solid var(--status-error-border)' : '1px solid var(--border-color)'};">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
            <div>
              <strong style="font-size: 15px;">${CP.util.esc(p.name)}</strong>
              <div style="font-size: 11px; color: var(--text-muted);">${CP.util.esc(p.model)} &bull; Nozzle: ${CP.util.esc(nozzle.type || 'brass')} 0.4mm</div>
            </div>
            <div>${statusBadge}</div>
          </div>

          <div style="margin-bottom: 12px;">
            <div style="display: flex; justify-content: space-between; font-size: 12px; font-weight: 600; margin-bottom: 4px;">
              <span>Abrasive Wear (ABS):</span>
              <span><strong>${CP.util.fmtNum(abrasiveG)}g</strong> / ${CP.util.fmtNum(limitG)}g (${pct}%)</span>
            </div>
            <div style="height: 10px; background-color: #f1f5f9; border-radius: 5px; overflow: hidden;">
              <div style="height: 100%; width: ${barFillWidth}%; background-color: ${barColor}; border-radius: 5px; transition: width 0.3s ease;"></div>
            </div>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 11px; color: var(--text-muted); margin-bottom: 14px; background: var(--bg-subtle); padding: 8px 10px; border-radius: var(--radius-sm);">
            <div>Total Extruded: <strong style="color: var(--text);">${CP.util.fmtNum(totalG)}g</strong></div>
            <div>Installed: <strong style="color: var(--text);">${installedText}</strong></div>
          </div>

          <button type="button" class="btn btn-secondary btn-sm btn-nozzle-changed" data-printer-id="${p.id}" style="width: 100%;">
            🔧 Nozzle Changed...
          </button>
        </div>`;
    }).join('');

    return `
      <div>
        <div class="banner banner-info" style="margin-bottom: 18px;">
          <div>
            <strong>Abrasive Nozzle Wear Telemetry:</strong> Standard brass nozzles wear out rapidly with abrasive filaments (ABS). The farm alerts at 80% wear (${CP.util.fmtNum(limitG * 0.8)}g) and triggers danger alerts at 100% (${CP.util.fmtNum(limitG)}g).
          </div>
        </div>
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px;">
          ${cardsHtml}
        </div>
      </div>`;
  }

  // =========================================================================
  // TAB 3: SERVICE LOG & TASKS
  // =========================================================================

  function renderTasksTab() {
    const tasks = CP.store.get('cp_maint_tasks', []);
    const printers = CP.store.get('cp_printers', []);
    const logs = CP.store.get('cp_maint_log', []);

    // Filter tasks for the selected editor printer
    const printerTasks = tasks.filter(t => t.printerId === Number(selectedEditorPrinterId));

    const taskRowsHtml = printerTasks.length === 0
      ? `<tr><td colspan="4" style="text-align: center; color: var(--text-muted); padding: 16px;">No tasks configured for this printer.</td></tr>`
      : printerTasks.map(t => {
        const status = CP.maint.taskStatus(t);
        const dueText = status.dueAt ? CP.util.fmtDate(status.dueAt) : 'Never';
        return `
          <tr>
            <td><strong>${CP.util.esc(t.label)}</strong></td>
            <td>
              <div style="display: flex; align-items: center; gap: 6px;">
                <input type="number" class="input input-sm inp-task-interval" data-task-id="${t.id}" value="${t.intervalDays}" min="1" max="365" style="width: 65px;">
                <span style="font-size: 12px; color: var(--text-muted);">days</span>
              </div>
            </td>
            <td>
              <span style="font-size: 12px;">${dueText}</span>
              ${status.state === 'overdue' ? `<span class="badge badge-danger" style="margin-left: 4px;">Overdue</span>` : status.state === 'due' ? `<span class="badge badge-warning" style="margin-left: 4px;">Due</span>` : ''}
            </td>
            <td style="text-align: right;">
              <button type="button" class="btn btn-secondary btn-sm btn-save-interval" data-task-id="${t.id}">Save</button>
            </td>
          </tr>`;
      }).join('');

    // Filter service logs by search query
    const q = logSearchQuery.toLowerCase().trim();
    const filteredLogs = logs.filter(l => {
      if (!q) return true;
      const mPr = l.printerId ? `printer ${l.printerId}`.includes(q) : false;
      return mPr || (l.label || '').toLowerCase().includes(q) || (l.key || '').toLowerCase().includes(q) || (l.doneBy || '').toLowerCase().includes(q) || (l.note || '').toLowerCase().includes(q);
    });

    const logRowsHtml = filteredLogs.length === 0
      ? `<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 24px;">No service logs recorded yet.</td></tr>`
      : filteredLogs.map(l => {
        const prName = l.printerId ? `Printer ${String(l.printerId).padStart(2, '0')}` : 'Farm';
        const isNozzle = l.key === 'nozzle_change';
        return `
          <tr>
            <td style="white-space: nowrap;">${CP.util.fmtDate(l.ts)}</td>
            <td><strong>${CP.util.esc(prName)}</strong></td>
            <td>
              ${isNozzle ? '<span class="badge badge-info" style="margin-right: 4px;">Nozzle</span>' : ''}
              <strong>${CP.util.esc(l.label || l.key)}</strong>
            </td>
            <td><span class="badge badge-default">${CP.util.esc(l.doneBy || 'Operator')}</span></td>
            <td style="font-size: 12px; color: var(--text-muted); max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${CP.util.esc(l.note || '')}">
              ${CP.util.esc(l.note || '—')}
            </td>
          </tr>`;
      }).join('');

    return `
      <div style="display: grid; grid-template-columns: 380px 1fr; gap: 20px; align-items: start;">
        <!-- Left: Task Configuration per Printer -->
        <div class="card">
          <div class="card-header">
            <div>
              <h3 class="card-title">⚙️ Printer Task Editor</h3>
              <div class="card-subtitle">Configure routine intervals and custom tasks</div>
            </div>
          </div>

          <div class="field" style="margin-bottom: 12px;">
            <label for="sel-editor-printer">Select Printer:</label>
            <select class="select" id="sel-editor-printer">
              ${printers.map(p => `<option value="${p.id}" ${p.id === Number(selectedEditorPrinterId) ? 'selected' : ''}>${CP.util.esc(p.name)} (${p.model})</option>`).join('')}
            </select>
          </div>

          <div class="table-container" style="margin-bottom: 16px;">
            <table class="table">
              <thead><tr><th>Task</th><th>Interval</th><th>Next Due</th><th></th></tr></thead>
              <tbody>${taskRowsHtml}</tbody>
            </table>
          </div>

          <div style="background: var(--bg-subtle); padding: 12px; border-radius: var(--radius-md);">
            <div style="font-weight: 700; font-size: 13px; margin-bottom: 8px;">+ Add Custom Task</div>
            <form id="form-add-custom-task">
              <div class="field" style="margin-bottom: 8px;">
                <input type="text" class="input input-sm" id="inp-new-task-label" placeholder="e.g. Extruder gear cleaning" required>
              </div>
              <div style="display: flex; gap: 8px;">
                <input type="number" class="input input-sm" id="inp-new-task-interval" placeholder="Interval (days)" min="1" max="365" value="14" style="width: 120px;" required>
                <button type="submit" class="btn btn-secondary btn-sm" style="flex: 1;">Add Task</button>
              </div>
            </form>
          </div>
        </div>

        <!-- Right: Service Log Table -->
        <div class="card">
          <div class="card-header" style="flex-wrap: wrap; gap: 10px;">
            <div>
              <h3 class="card-title">📜 Service &amp; Maintenance Log (${logs.length})</h3>
              <div class="card-subtitle">Full audit trail of completed maintenance and nozzle changes</div>
            </div>
            <div style="width: 220px;">
              <input type="search" class="input input-sm" id="inp-search-maint-logs" placeholder="Search logs..." value="${CP.util.esc(logSearchQuery)}">
            </div>
          </div>
          <div class="table-container" style="max-height: 520px; overflow-y: auto;">
            <table class="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Printer</th>
                  <th>Routine / Action</th>
                  <th>Operator</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                ${logRowsHtml}
              </tbody>
            </table>
          </div>
        </div>
      </div>`;
  }

  function renderView() {
    if (!root) return;
    let contentHtml = activeTab === 'checklist' ? renderChecklistTab() : activeTab === 'nozzles' ? renderNozzleTab() : renderTasksTab();

    root.innerHTML = `
      <div class="maintenance-container">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
          <div>
            <h1 class="page-title" style="margin: 0;">🔧 Preventive Maintenance</h1>
            <div class="page-subtitle" style="margin: 2px 0 0 0;">Machine upkeep checklists, abrasive nozzle wear tracking, and service logs</div>
          </div>
          <div>
            <button type="button" class="btn btn-secondary btn-sm" id="btn-seed-maint-quick">⚡ Seed Maintenance Demo</button>
          </div>
        </div>
        ${renderTabsHeader()}
        ${contentHtml}
      </div>`;

    bindEvents();
  }

  function bindEvents() {
    if (!root) return;

    // Tabs navigation
    root.querySelectorAll('.inventory-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        activeTab = btn.getAttribute('data-tab') || 'checklist';
        renderView();
      });
    });

    // Quick seed demo button
    root.querySelector('#btn-seed-maint-quick')?.addEventListener('click', () => {
      if (CP.maint && typeof CP.maint.seedMaintData === 'function') {
        CP.maint.seedMaintData();
        CP.ui.toast('Maintenance demo tasks & nozzle wear seeded!', 'success');
        renderView();
      }
    });

    // Tab 1: Checklist operations
    const initialsInp = root.querySelector('#maint-operator-initials');
    if (initialsInp) {
      initialsInp.addEventListener('change', (e) => {
        localStorage.setItem('cp_maint_initials', e.target.value.trim().toUpperCase());
      });
    }

    // Mark selected done
    root.querySelector('#btn-mark-selected-done')?.addEventListener('click', () => {
      const selected = Array.from(root.querySelectorAll('.chk-task-select:checked')).map(cb => cb.getAttribute('data-task-id'));
      if (selected.length === 0) {
        CP.ui.toast('Please select at least one task to mark as done.', 'warning');
        return;
      }
      const initials = (root.querySelector('#maint-operator-initials')?.value || 'SK').trim().toUpperCase() || 'OP';
      localStorage.setItem('cp_maint_initials', initials);

      selected.forEach(taskId => {
        CP.maint.markDone(taskId, initials, 'Checklist routine completed');
      });

      CP.ui.toast(`Marked ${selected.length} maintenance task${selected.length === 1 ? '' : 's'} as done.`, 'success');
      renderView();
    });

    // Mark all daily tasks done
    root.querySelector('#btn-mark-daily-done')?.addEventListener('click', () => {
      const tasks = CP.store.get('cp_maint_tasks', []);
      const initials = (root.querySelector('#maint-operator-initials')?.value || 'SK').trim().toUpperCase() || 'OP';
      localStorage.setItem('cp_maint_initials', initials);

      let marked = 0;
      tasks.forEach(t => {
        if (Number(t.intervalDays) === 1) {
          const status = CP.maint.taskStatus(t);
          if (status.state !== 'ok') {
            CP.maint.markDone(t.id, initials, 'Daily checklist batch completed');
            marked++;
          }
        }
      });

      if (marked > 0) {
        CP.ui.toast(`Marked all ${marked} daily maintenance task${marked === 1 ? '' : 's'} as done.`, 'success');
      } else {
        CP.ui.toast('No daily tasks are currently due.', 'info');
      }
      renderView();
    });

    // Tab 2: Nozzle changed button
    root.querySelectorAll('.btn-nozzle-changed').forEach(btn => {
      btn.addEventListener('click', async () => {
        const prId = Number(btn.getAttribute('data-printer-id'));
        const printers = CP.store.get('cp_printers', []);
        const printer = printers.find(p => p.id === prId);
        if (!printer) return;

        const initials = localStorage.getItem('cp_maint_initials') || 'SK';
        const operator = await CP.ui.prompt(`Confirm nozzle change on ${printer.name}. Enter operator initials:`, initials);
        if (operator !== null) {
          const cleanInitials = operator.trim().toUpperCase() || 'OP';
          localStorage.setItem('cp_maint_initials', cleanInitials);
          CP.maint.changeNozzle(prId, cleanInitials, 'Installed fresh nozzle');
          CP.ui.toast(`Nozzle counters reset for ${printer.name}.`, 'success');
          renderView();
        }
      });
    });

    // Tab 3: Editor printer selector
    root.querySelector('#sel-editor-printer')?.addEventListener('change', (e) => {
      selectedEditorPrinterId = Number(e.target.value) || 1;
      renderView();
    });

    // Tab 3: Save task interval
    root.querySelectorAll('.btn-save-interval').forEach(btn => {
      btn.addEventListener('click', () => {
        const taskId = btn.getAttribute('data-task-id');
        const inp = root.querySelector(`.inp-task-interval[data-task-id="${taskId}"]`);
        const newInterval = Math.max(1, Number(inp?.value) || 1);

        const tasks = CP.store.get('cp_maint_tasks', []);
        const task = tasks.find(t => t.id === taskId);
        if (task) {
          task.intervalDays = newInterval;
          CP.store.set('cp_maint_tasks', tasks);
          if (CP.bus) CP.bus.emit('maint:changed');
          CP.ui.toast(`Interval for "${task.label}" updated to ${newInterval} days.`, 'success');
          renderView();
        }
      });
    });

    // Tab 3: Add custom task form
    root.querySelector('#form-add-custom-task')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const label = root.querySelector('#inp-new-task-label')?.value.trim();
      const intervalDays = Math.max(1, Number(root.querySelector('#inp-new-task-interval')?.value) || 1);
      if (!label) return;

      const tasks = CP.store.get('cp_maint_tasks', []);
      const prId = Number(selectedEditorPrinterId);
      const customKey = `custom_${Date.now()}`;
      tasks.push({
        id: `task_${prId}_${customKey}`,
        printerId: prId,
        key: customKey,
        label,
        intervalDays,
        lastDone: null
      });
      CP.store.set('cp_maint_tasks', tasks);
      if (CP.bus) CP.bus.emit('maint:changed');
      CP.ui.toast(`Added custom task "${label}" (${intervalDays}d) to Printer ${String(prId).padStart(2, '0')}.`, 'success');
      renderView();
    });

    // Tab 3: Search log
    const searchInp = root.querySelector('#inp-search-maint-logs');
    if (searchInp) {
      searchInp.addEventListener('input', (e) => {
        logSearchQuery = e.target.value;
        renderView();
        const newInp = root.querySelector('#inp-search-maint-logs');
        if (newInp) {
          newInp.focus();
          newInp.selectionStart = newInp.selectionEnd = newInp.value.length;
        }
      });
    }
  }

  function render(rootElement) {
    root = rootElement;
    renderView();
  }

  function destroy() {
    root = null;
  }

  return {
    render,
    destroy
  };
})();

CP.registerModule({
  id: 'maintenance',
  route: '#/maintenance',
  title: 'Maintenance',
  icon: '🔧',
  render: CP.maintenance.render,
  destroy: CP.maintenance.destroy
});
