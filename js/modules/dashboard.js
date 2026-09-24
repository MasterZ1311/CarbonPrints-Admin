/**
 * CarbonPrints Company OS - Dashboard Module
 * Global namespace: window.CP
 * Operational overview: 8 Clickable KPI cards, 10-Machine Farm at a glance with live ticking countdowns,
 * Urgent Due Soon orders table, 6-Month Payment Revenue SVG chart, Orders by Category & Status breakdown,
 * Quick Action dispatchers, and resilient empty states.
 */
window.CP = window.CP || {};

CP.registerModule((function () {
  let root = null, timerId = null, unsubscribers = [];

  const PIPELINE_STATUSES = ['confirmed', 'printing', 'post', 'qc', 'ready'];
  const STATUS_ORDER = ['quote', 'confirmed', 'printing', 'post', 'qc', 'ready', 'delivered', 'cancelled'];
  const CATEGORIES = ['College Project', 'Hardware Startup R&D', 'Automotive Garage', 'Hobbyist'];
  const STATUS_KINDS = { quote: 'default', confirmed: 'info', printing: 'primary', post: 'warning', qc: 'warning', ready: 'success', delivered: 'success', cancelled: 'danger' };

  const getStatusBadgeKind = s => STATUS_KINDS[s] || 'default';
  const getPaymentBadgeKind = s => s === 'settled' ? 'success' : s === 'advance' ? 'warning' : 'danger';

  function getOrders() { return CP.store.get('cp_orders', []); }
  function getSettings() { return CP.store.get('cp_settings', CP.defaults ? CP.defaults.settings : {}); }

  function getPrinters() {
    let list = CP.store.get('cp_printers', null);
    if (!list || !Array.isArray(list) || list.length === 0) {
      list = CP.defaults ? JSON.parse(JSON.stringify(CP.defaults.printers)) : [];
      if (list.length === 0) {
        for (let i = 1; i <= 10; i++) {
          list.push({ id: i, name: `Printer ${CP.util.pad(i, 2)}`, model: 'Ender 3', status: 'idle', statusNote: '', material: 'PLA', currentJob: null, nozzle: { type: 'brass', installedAt: new Date().toISOString(), gramsExtruded: 0, abrasiveGramsExtruded: 0 }, octoprint: { url: '', apiKey: '' } });
        }
      }
    }
    return list;
  }

  function tick() {
    if (!root) return;
    const tiles = root.querySelectorAll('.glance-tile[data-status="printing"]');
    const now = Date.now();

    tiles.forEach(tile => {
      const startedAt = tile.getAttribute('data-started-at');
      const durationMin = Number(tile.getAttribute('data-duration-min')) || 0;
      if (!startedAt || durationMin <= 0) return;

      const startMs = new Date(startedAt).getTime(), totalMs = durationMin * 60000;
      const diffMs = (startMs + totalMs) - now;
      const timeEl = tile.querySelector('.glance-timer');
      const barEl = tile.querySelector('.glance-progress-bar');

      if (diffMs >= 0) {
        const totSec = Math.floor(diffMs / 1000);
        const text = `${CP.util.pad(Math.floor(totSec / 3600))}:${CP.util.pad(Math.floor((totSec % 3600) / 60))}:${CP.util.pad(totSec % 60)} left`;
        if (timeEl && timeEl.textContent !== text) timeEl.textContent = text;
        if (timeEl) timeEl.classList.remove('is-overdue');
        const pct = Math.min(100, Math.max(0, ((now - startMs) / totalMs) * 100));
        if (barEl) barEl.style.width = `${pct.toFixed(1)}%`;
      } else {
        const overdueSec = Math.floor(Math.abs(diffMs) / 1000);
        const text = `+${CP.util.pad(Math.floor(overdueSec / 3600))}:${CP.util.pad(Math.floor((overdueSec % 3600) / 60))}:${CP.util.pad(overdueSec % 60)}`;
        if (timeEl && timeEl.textContent !== text) timeEl.textContent = text;
        if (timeEl) timeEl.classList.add('is-overdue');
        if (barEl) barEl.style.width = '100%';
      }
    });
  }

  function computeKPIs(orders, printers) {
    const activeJobs = printers.filter(p => p.status === 'printing').length;
    const availablePrinters = printers.filter(p => p.status === 'idle').length;
    const totalPrinters = printers.length || 10;
    const ordersInPipeline = orders.filter(o => PIPELINE_STATUSES.includes(o.status)).length;

    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istNow = new Date(now.getTime() + (now.getTimezoneOffset() * 60 * 1000) + istOffset);
    const curYear = istNow.getFullYear(), curMonth = istNow.getMonth();

    let revenueThisMonth = 0, outstandingBalance = 0;

    orders.forEach(o => {
      if (o.status !== 'cancelled' && o.status !== 'quote') {
        const tot = Number(o.pricing?.total) || 0, paid = Number(o.payment?.paidAmount) || 0;
        if (tot > paid) outstandingBalance += (tot - paid);
      }

      const history = o.payment?.history || [];
      if (history.length > 0) {
        history.forEach(h => {
          if (h.ts) {
            const d = new Date(h.ts);
            const istD = new Date(d.getTime() + (d.getTimezoneOffset() * 60 * 1000) + istOffset);
            if (istD.getFullYear() === curYear && istD.getMonth() === curMonth) revenueThisMonth += (Number(h.amount) || 0);
          }
        });
      } else if (o.payment?.paidAmount > 0 && o.createdAt) {
        const d = new Date(o.createdAt);
        const istD = new Date(d.getTime() + (d.getTimezoneOffset() * 60 * 1000) + istOffset);
        if (istD.getFullYear() === curYear && istD.getMonth() === curMonth) revenueThisMonth += (Number(o.payment.paidAmount) || 0);
      }
    });

    const scrapStats = (CP.scrap && typeof CP.scrap.totals === 'function') ? CP.scrap.totals('30d') : { scrapPct: 0 };
    const scrapPct = scrapStats.scrapPct || 0;
    const scrapStatus = (CP.scrap && typeof CP.scrap.scrapStatus === 'function') ? CP.scrap.scrapStatus(scrapPct) : 'good';
    const lowStockAlerts = (CP.inventory && typeof CP.inventory.lowStockAlerts === 'function') ? CP.inventory.lowStockAlerts() : [];
    const overdueMaintCount = (CP.maint && typeof CP.maint.overdueCount === 'function') ? CP.maint.overdueCount() : 0;

    return {
      activeJobs, availablePrinters, totalPrinters, ordersInPipeline,
      revenueThisMonth: CP.util.round2(revenueThisMonth),
      outstandingBalance: CP.util.round2(outstandingBalance),
      scrapPct, scrapStatus,
      lowStockCount: lowStockAlerts.length, lowStockMaterials: lowStockAlerts,
      overdueMaintCount
    };
  }

  function renderFarmGlance(printers) {
    if (!printers || printers.length === 0) {
      return `<div class="card">${CP.ui.emptyState('🖨️', 'No Printers Configured', 'Printer fleet information will appear here.')}</div>`;
    }

    const tilesHtml = printers.map(p => {
      const status = p.status || 'idle', isPrinting = status === 'printing' && p.currentJob, job = p.currentJob;
      let detailHtml = '', startedAtAttr = '', durationMinAttr = '';

      if (isPrinting && job) {
        startedAtAttr = `data-started-at="${CP.util.esc(job.startedAt || '')}"`;
        durationMinAttr = `data-duration-min="${job.durationMin || 0}"`;
        detailHtml = `
          <div class="glance-part-name" title="${CP.util.esc(job.partName || 'Job')}">${CP.util.esc(job.partName || 'Part')}</div>
          <div class="glance-job-meta">${CP.util.esc(job.orderId || '')} • ${CP.util.esc(job.material || 'PLA')}</div>
          <div class="glance-timer font-mono">--:--:--</div>
          <div class="glance-progress-track"><div class="glance-progress-bar" style="width: 0%"></div></div>`;
      } else if (status === 'idle') {
        detailHtml = `<div class="glance-status-text" style="color: var(--status-idle);">Ready for job</div><div class="glance-job-meta">${CP.util.esc(p.material || 'PLA')} loaded</div>`;
      } else if (status === 'post') {
        detailHtml = `<div class="glance-status-text" style="color: var(--status-post);">Post-process</div><div class="glance-job-meta">${CP.util.esc(p.statusNote || 'Cooling / On bed')}</div>`;
      } else if (status === 'maint') {
        detailHtml = `<div class="glance-status-text" style="color: var(--status-maint);">Maintenance</div><div class="glance-job-meta">${CP.util.esc(p.statusNote || 'Routine servicing')}</div>`;
      } else {
        detailHtml = `<div class="glance-status-text" style="color: var(--status-error);">Attention Needed</div><div class="glance-job-meta">${CP.util.esc(p.statusNote || 'Machine stopped')}</div>`;
      }

      return `
        <a href="#/farm" class="glance-tile glance-status-${status}" data-status="${status}" ${startedAtAttr} ${durationMinAttr}>
          <div class="glance-tile-header">
            <span class="glance-printer-name">${CP.util.esc(p.name)}</span>
            <span class="glance-status-badge badge-${status}">${status.toUpperCase()}</span>
          </div>
          <div class="glance-tile-body">${detailHtml}</div>
        </a>`;
    }).join('');

    return `
      <div class="card">
        <div class="card-header">
          <div>
            <h3 class="card-title">🖨️ Farm at a Glance</h3>
            <div class="card-subtitle">Real-time status of 10 FDM machines • Click any tile to manage on Farm Board</div>
          </div>
          <a href="#/farm" class="btn btn-secondary btn-sm">Open Farm Board &rarr;</a>
        </div>
        <div class="glance-grid">${tilesHtml}</div>
      </div>`;
  }

  function renderDueSoonTable(orders) {
    const todayStr = CP.util.todayISO ? CP.util.todayISO() : new Date().toISOString().slice(0, 10);
    const cutoffStr = CP.util.addDays ? CP.util.addDays(todayStr, 3) : '';

    const urgentOrders = orders.filter(o => {
      if (!PIPELINE_STATUSES.includes(o.status) || !o.dueDate) return false;
      return cutoffStr ? o.dueDate.slice(0, 10) <= cutoffStr : true;
    });

    urgentOrders.sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));

    let bodyHtml = '';
    if (orders.length === 0) {
      bodyHtml = `<div style="padding: 16px;">${CP.ui.emptyState('✨', 'No Data Yet', 'No data yet - use Settings > Demo data to try the app')}</div>`;
    } else if (urgentOrders.length === 0) {
      bodyHtml = `<div style="padding: 16px;">${CP.ui.emptyState('✨', 'No Urgent Deadlines', 'All active orders in production have target dates beyond the next 3 days.')}</div>`;
    } else {
      const rows = urgentOrders.map(o => {
        const dStr = o.dueDate ? o.dueDate.slice(0, 10) : '';
        const isOverdue = dStr < todayStr, isToday = dStr === todayStr;
        const dueBadge = isOverdue ? `<span class="badge badge-danger">⚠️ Overdue (${CP.util.fmtDate(o.dueDate)})</span>`
          : isToday ? `<span class="badge badge-warning">⏰ Due Today</span>`
          : `<span class="badge badge-info">${CP.util.fmtDate(o.dueDate)}</span>`;

        const partsSummary = (o.parts || []).map(p => `${CP.util.esc(p.name)} (${p.weightG || 0}g)`).join(', ') || '—';
        const totalWeight = (o.parts || []).reduce((acc, p) => acc + ((Number(p.weightG) || 0) * (Number(p.qty) || 1)), 0);

        return `
          <tr>
            <td><a href="#/order-desk/${CP.util.esc(o.id)}" class="font-mono font-bold" style="color: var(--brand);">${CP.util.esc(o.id)}</a></td>
            <td><strong>${CP.util.esc(o.customer?.name || 'Customer')}</strong><div style="font-size: 11px; color: var(--text-muted);">${CP.util.esc(o.customer?.category || 'General')}</div></td>
            <td>${dueBadge}</td>
            <td><span class="badge badge-${getStatusBadgeKind(o.status)}">${o.status.toUpperCase()}</span></td>
            <td style="font-size: 12px; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${partsSummary}">${(o.parts || []).length} parts (${totalWeight}g)</td>
            <td><span class="badge badge-${getPaymentBadgeKind(o.payment?.status)}">${o.payment?.status || 'unpaid'}</span></td>
            <td style="text-align: right; white-space: nowrap;"><a href="#/order-desk/${CP.util.esc(o.id)}" class="btn btn-secondary btn-sm">Edit &rarr;</a></td>
          </tr>`;
      }).join('');

      bodyHtml = `
        <div class="table-wrapper">
          <table class="table">
            <thead><tr><th>Order ID</th><th>Customer</th><th>Due Date</th><th>Status</th><th>Parts (Weight)</th><th>Payment</th><th style="text-align: right;">Action</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`;
    }

    return `
      <div class="card">
        <div class="card-header">
          <div>
            <h3 class="card-title">⏰ Orders Due Soon &amp; Overdue</h3>
            <div class="card-subtitle">Production commitments due within the next 3 days or past deadline</div>
          </div>
          <a href="#/orders" class="btn btn-secondary btn-sm">View All Orders &rarr;</a>
        </div>
        ${bodyHtml}
      </div>`;
  }

  function renderRevenueChart(orders) {
    const months = [];
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istNow = new Date(now.getTime() + (now.getTimezoneOffset() * 60 * 1000) + istOffset);
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    for (let i = 5; i >= 0; i--) {
      const d = new Date(istNow.getFullYear(), istNow.getMonth() - i, 1);
      const y = d.getFullYear(), m = d.getMonth();
      months.push({ year: y, monthIdx: m, label: `${monthNames[m]} '${String(y).slice(-2)}`, revenue: 0, isCurrent: (i === 0) });
    }

    orders.forEach(o => {
      const history = o.payment?.history || [];
      if (history.length > 0) {
        history.forEach(h => {
          if (h.ts) {
            const d = new Date(h.ts);
            const istD = new Date(d.getTime() + (d.getTimezoneOffset() * 60 * 1000) + istOffset);
            const match = months.find(item => item.year === istD.getFullYear() && item.monthIdx === istD.getMonth());
            if (match) match.revenue += (Number(h.amount) || 0);
          }
        });
      } else if (o.payment?.paidAmount > 0 && o.createdAt) {
        const d = new Date(o.createdAt);
        const istD = new Date(d.getTime() + (d.getTimezoneOffset() * 60 * 1000) + istOffset);
        const match = months.find(item => item.year === istD.getFullYear() && item.monthIdx === istD.getMonth());
        if (match) match.revenue += (Number(o.payment.paidAmount) || 0);
      }
    });

    months.forEach(m => { m.revenue = CP.util.round2(m.revenue); });
    const maxVal = Math.max(...months.map(m => m.revenue), 1000);
    const ceiling = Math.ceil(maxVal / 1000) * 1000;
    const svgW = 600, svgH = 210, chartBottom = 165, chartTop = 35, barMaxH = chartBottom - chartTop, slotW = svgW / 6, barW = 42;

    const barsSvg = months.map((m, idx) => {
      const barH = ceiling > 0 ? (m.revenue / ceiling) * barMaxH : 0;
      const barX = idx * slotW + (slotW - barW) / 2, barY = chartBottom - barH, centerX = idx * slotW + slotW / 2;
      const fill = m.revenue > 0 ? (m.isCurrent ? '#0f766e' : '#0d9488') : '#e2e8f0';
      const textY = Math.max(18, barY - 8), displayVal = m.revenue > 0 ? `₹${CP.util.fmtNum(Math.round(m.revenue))}` : '₹0';
      return `
        <g class="chart-bar-group" tabindex="0">
          <title>${CP.util.esc(m.label)}: ₹${CP.util.fmtINR(m.revenue)}</title>
          <rect x="${idx * slotW + 4}" y="${chartTop - 15}" width="${slotW - 8}" height="${barMaxH + 20}" rx="4" fill="transparent" class="bar-slot-bg" />
          <rect x="${barX}" y="${barY}" width="${barW}" height="${Math.max(barH, 4)}" rx="4" ry="4" fill="${fill}" />
          <text x="${centerX}" y="${textY}" text-anchor="middle" font-size="11" font-weight="600" fill="${m.revenue > 0 ? '#0f172a' : '#94a3b8'}">${displayVal}</text>
          <text x="${centerX}" y="188" text-anchor="middle" font-size="12" font-weight="${m.isCurrent ? '700' : '500'}" fill="${m.isCurrent ? '#0f766e' : '#64748b'}">${CP.util.esc(m.label)}</text>
        </g>`;
    }).join('');

    return `
      <div class="card" style="height: 100%; display: flex; flex-direction: column;">
        <div class="card-header">
          <div>
            <h3 class="card-title">📈 Revenue, Last 6 Months</h3>
            <div class="card-subtitle">Monthly cash flow aggregated from recorded payment transactions</div>
          </div>
          <a href="#/orders" class="btn btn-secondary btn-sm">Billing Ledger &rarr;</a>
        </div>
        <div style="flex: 1; display: flex; align-items: center; justify-content: center; width: 100%; overflow-x: auto;">
          <svg viewBox="0 0 ${svgW} ${svgH}" preserveAspectRatio="xMidYMid meet" style="width: 100%; max-width: 600px; height: auto; display: block;" role="img" aria-label="Revenue chart for last 6 months">
            <line x1="15" y1="${chartTop}" x2="${svgW - 15}" y2="${chartTop}" stroke="#f1f5f9" stroke-width="1" stroke-dasharray="4,4" />
            <line x1="15" y1="${(chartTop + chartBottom) / 2}" x2="${svgW - 15}" y2="${(chartTop + chartBottom) / 2}" stroke="#f1f5f9" stroke-width="1" stroke-dasharray="4,4" />
            <line x1="15" y1="${chartBottom}" x2="${svgW - 15}" y2="${chartBottom}" stroke="#cbd5e1" stroke-width="1.5" />
            ${barsSvg}
          </svg>
        </div>
      </div>`;
  }

  function renderOrdersBreakdown(orders) {
    const totalOrders = orders.length;
    const categoryCounts = {};
    CATEGORIES.forEach(c => { categoryCounts[c] = 0; });
    orders.forEach(o => {
      const cat = o.customer?.category;
      if (cat && categoryCounts[cat] !== undefined) categoryCounts[cat]++;
    });

    if (totalOrders === 0) {
      return `
        <div class="card" style="height: 100%; display: flex; flex-direction: column;">
          <div class="card-header">
            <div>
              <h3 class="card-title">📊 Orders Distribution</h3>
              <div class="card-subtitle">Breakdown by customer segment and lifecycle status</div>
            </div>
          </div>
          <div style="padding: 16px;">
            ${CP.ui.emptyState('📊', 'No Data Yet', 'No data yet - use Settings > Demo data to try the app')}
          </div>
        </div>`;
    }

    const categoryRows = CATEGORIES.map(cat => {
      const count = categoryCounts[cat] || 0;
      const pct = totalOrders > 0 ? Math.round((count / totalOrders) * 100) : 0;
      return `
        <div class="category-stat-row">
          <div class="category-stat-header">
            <span class="category-stat-label">${CP.util.esc(cat)}</span>
            <span class="category-stat-count"><strong>${count}</strong> <span style="color:var(--text-muted); font-size:11px;">(${pct}%)</span></span>
          </div>
          <div class="stat-progress-track"><div class="stat-progress-bar" style="width: ${pct}%"></div></div>
        </div>`;
    }).join('');

    const statusCounts = {};
    STATUS_ORDER.forEach(s => { statusCounts[s] = 0; });
    orders.forEach(o => {
      if (statusCounts[o.status] !== undefined) statusCounts[o.status]++;
    });

    const statusBadges = STATUS_ORDER.map(s => `
      <a href="#/orders" class="dash-status-pill" title="Filter by ${s}">
        <span class="dash-status-pill-badge badge-${getStatusBadgeKind(s)}">${s.toUpperCase()}</span>
        <span class="dash-status-pill-count font-mono">${statusCounts[s] || 0}</span>
      </a>`).join('');

    return `
      <div class="card" style="height: 100%; display: flex; flex-direction: column;">
        <div class="card-header">
          <div>
            <h3 class="card-title">📊 Orders Distribution</h3>
            <div class="card-subtitle">Breakdown by customer segment and lifecycle status</div>
          </div>
        </div>
        <div style="flex: 1; display: flex; flex-direction: column; gap: 16px;">
          <div>
            <div style="font-size: 12px; font-weight: 600; color: var(--text-muted); margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px;">Orders by Category</div>
            <div style="display: flex; flex-direction: column; gap: 8px;">${categoryRows}</div>
          </div>
          <div style="border-top: 1px solid var(--border); padding-top: 14px;">
            <div style="font-size: 12px; font-weight: 600; color: var(--text-muted); margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px;">Orders by Status</div>
            <div class="dash-status-pills-grid">${statusBadges}</div>
          </div>
        </div>
      </div>`;
  }

  function openQuickAddSpoolModal() {
    const settings = getSettings(), materials = settings.materials || ['PLA', 'ABS', 'TPU'];
    const today = CP.util.todayISO ? CP.util.todayISO() : new Date().toISOString().split('T')[0];
    const wrapper = document.createElement('div');
    wrapper.innerHTML = `
      <div class="field"><label>Material:</label><select class="select" id="q-add-mat">${materials.map(m => `<option value="${CP.util.esc(m)}">${CP.util.esc(m)}</option>`).join('')}</select></div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
        <div class="field"><label>Color:</label><input type="text" class="input" id="q-add-color" value="Jet Black"></div>
        <div class="field"><label>Brand:</label><input type="text" class="input" id="q-add-brand" value="Numakers"></div>
      </div>
      <div class="field"><label>Supplier:</label><input type="text" class="input" id="q-add-supplier" value="Parrys Chennai"></div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
        <div class="field"><label>Initial Weight (g):</label><input type="number" class="input" id="q-add-grams" min="1" step="50" value="1000"></div>
        <div class="field"><label>Cost (INR ₹):</label><input type="number" class="input" id="q-add-cost" min="0" step="10" value="850"></div>
      </div>
      <div class="field"><label>Purchase Date:</label><input type="date" class="input" id="q-add-date" value="${today}"></div>`;

    CP.ui.modal({
      title: '🧵 Quick Add Spool',
      bodyNode: wrapper,
      buttons: [
        { label: 'Cancel', kind: 'btn-secondary' },
        {
          label: 'Save Spool', kind: 'btn-primary',
          onClick: () => {
            const material = wrapper.querySelector('#q-add-mat')?.value;
            const color = wrapper.querySelector('#q-add-color')?.value.trim();
            const brand = wrapper.querySelector('#q-add-brand')?.value.trim();
            const supplier = wrapper.querySelector('#q-add-supplier')?.value.trim();
            const initialG = Number(wrapper.querySelector('#q-add-grams')?.value);
            const costINR = Number(wrapper.querySelector('#q-add-cost')?.value);
            const purchasedAt = wrapper.querySelector('#q-add-date')?.value;
            if (isNaN(initialG) || initialG <= 0 || isNaN(costINR) || costINR < 0) { CP.ui.toast('Please check spool weight and cost values.', 'danger'); return false; }
            if (CP.inventory && typeof CP.inventory.addSpool === 'function') {
              const sp = CP.inventory.addSpool({ material, color, brand, supplier, initialG, costINR, purchasedAt });
              CP.ui.toast(`Spool ${sp.id} (${sp.material} - ${sp.color}) added to inventory!`, 'success');
              renderView();
            }
            return true;
          }
        }
      ]
    });
  }

  function openQuickLogScrapModal() {
    const settings = getSettings(), materials = settings.materials || ['PLA', 'ABS', 'TPU'];
    const printers = getPrinters(), orders = getOrders(), spools = CP.store.get('cp_spools', []).filter(s => s.status === 'active');
    const reasons = (CP.scrap && CP.scrap.FAILURE_REASONS) ? CP.scrap.FAILURE_REASONS : ['Spaghetti', 'Warping', 'Layer shift', 'Nozzle clog', 'Bed adhesion', 'Power cut', 'Other'];
    const wrapper = document.createElement('div');
    wrapper.innerHTML = `
      <div class="field"><label>Printer (Optional):</label><select class="select" id="q-scr-printer"><option value="">None / Off-machine</option>${printers.map(p => `<option value="${p.id}">${CP.util.esc(p.name)}</option>`).join('')}</select></div>
      <div class="field"><label>Order (Optional):</label><select class="select" id="q-scr-order"><option value="">None / Farm scrap</option>${orders.slice(0, 15).map(o => `<option value="${CP.util.esc(o.id)}">${CP.util.esc(o.id)} - ${CP.util.esc(o.customer?.name || '')}</option>`).join('')}</select></div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
        <div class="field"><label>Material:</label><select class="select" id="q-scr-material">${materials.map(m => `<option value="${m}">${m}</option>`).join('')}</select></div>
        <div class="field"><label>Failed Grams (g):</label><input type="number" class="input" id="q-scr-grams" min="1" step="1" value="50"></div>
      </div>
      <div class="field"><label>Failure Reason:</label><select class="select" id="q-scr-reason">${reasons.map(r => `<option value="${r}">${r}</option>`).join('')}</select></div>
      <div class="field"><label>Deduct from Spool (Optional):</label><select class="select" id="q-scr-spool"><option value="">Do not deduct from spool</option>${spools.map(s => `<option value="${s.id}">${s.id} (${s.material} - ${s.color}, ${s.remainingG}g left)</option>`).join('')}</select></div>
      <div class="field"><label>Notes (Optional):</label><input type="text" class="input" id="q-scr-notes" placeholder="e.g. Bed adhesion failure on initial layer"></div>`;

    CP.ui.modal({
      title: '🗑️ Log Scrap',
      bodyNode: wrapper,
      buttons: [
        { label: 'Cancel', kind: 'btn-secondary' },
        {
          label: 'Log Scrap Entry', kind: 'btn-danger',
          onClick: () => {
            const prVal = wrapper.querySelector('#q-scr-printer')?.value;
            const printerId = prVal ? Number(prVal) : null, orderId = wrapper.querySelector('#q-scr-order')?.value || null;
            const material = wrapper.querySelector('#q-scr-material')?.value || 'PLA', grams = Number(wrapper.querySelector('#q-scr-grams')?.value);
            const reason = wrapper.querySelector('#q-scr-reason')?.value || 'Other', spoolId = wrapper.querySelector('#q-scr-spool')?.value || null;
            const notes = wrapper.querySelector('#q-scr-notes')?.value.trim() || '';
            if (isNaN(grams) || grams <= 0) { CP.ui.toast('Please enter valid scrap grams (> 0g).', 'danger'); return false; }

            if (CP.scrap && typeof CP.scrap.add === 'function') {
              CP.scrap.add({ printerId, orderId, material, grams, reason, notes, source: 'manual' });
            }
            if (spoolId && CP.inventory && typeof CP.inventory.consume === 'function') {
              CP.inventory.consume(spoolId, grams, { reason: 'scrap', orderId, printerId, note: `Manual scrap (${reason})` });
            }
            CP.ui.toast(`Logged ${grams}g scrap for ${reason}.`, 'warning');
            renderView();
            return true;
          }
        }
      ]
    });
  }

  function renderView() {
    if (!root) return;
    const orders = getOrders(), printers = getPrinters(), kpis = computeKPIs(orders, printers);
    const scrapColorClass = kpis.scrapStatus === 'good' ? 'kpi-good' : (kpis.scrapStatus === 'warn' ? 'kpi-warn' : 'kpi-bad');
    const isStoreEmpty = orders.length === 0 && printers.every(p => p.status === 'idle' && !p.currentJob);

    root.innerHTML = `
      <div class="dashboard-module">
        ${isStoreEmpty ? `
          <div class="banner banner-info" style="margin-bottom: 20px;">
            ℹ️ <strong>Getting Started:</strong> No data yet - use <a href="#/settings" style="text-decoration: underline; font-weight: 700;">Settings &gt; Demo data</a> to try the app.
          </div>` : ''}

        <div class="dashboard-header-bar">
          <div>
            <h1 class="dashboard-title">📊 Dashboard</h1>
            <div class="dashboard-subtitle">Operational Command Center &bull; CarbonPrints Private Limited</div>
          </div>
          <div class="dashboard-quick-actions">
            <a href="#/order-desk" class="btn btn-primary" id="dash-btn-new-quote">➕ New Quote</a>
            <a href="#/orders" class="btn btn-secondary" id="dash-btn-record-payment">💳 Record Payment</a>
            <button type="button" class="btn btn-secondary" id="dash-btn-add-spool">🧵 Add Spool</button>
            <button type="button" class="btn btn-secondary" id="dash-btn-log-scrap">🗑️ Log Scrap</button>
          </div>
        </div>

        <div class="dashboard-kpi-grid">
          <a href="#/farm" class="dash-kpi-card" id="kpi-card-active-jobs">
            <div class="dash-kpi-header"><span class="dash-kpi-label">Active Jobs</span><span class="dash-kpi-icon">🖨️</span></div>
            <div class="dash-kpi-val">${kpis.activeJobs}</div>
            <div class="dash-kpi-sub">in production</div>
          </a>

          <a href="#/farm" class="dash-kpi-card" id="kpi-card-printers-available">
            <div class="dash-kpi-header"><span class="dash-kpi-label">Printers Available</span><span class="dash-kpi-icon">⚡</span></div>
            <div class="dash-kpi-val">${kpis.availablePrinters}</div>
            <div class="dash-kpi-sub">idle of ${kpis.totalPrinters} machines</div>
          </a>

          <a href="#/orders" class="dash-kpi-card" id="kpi-card-pipeline">
            <div class="dash-kpi-header"><span class="dash-kpi-label">Orders in Pipeline</span><span class="dash-kpi-icon">📦</span></div>
            <div class="dash-kpi-val">${kpis.ordersInPipeline}</div>
            <div class="dash-kpi-sub">confirmed &rarr; ready</div>
          </a>

          <a href="#/orders" class="dash-kpi-card" id="kpi-card-revenue">
            <div class="dash-kpi-header"><span class="dash-kpi-label">Revenue This Month</span><span class="dash-kpi-icon">💰</span></div>
            <div class="dash-kpi-val font-mono" style="font-size: 19px; color: var(--brand);">${CP.util.fmtINR(kpis.revenueThisMonth)}</div>
            <div class="dash-kpi-sub">collected in IST</div>
          </a>

          <a href="#/orders" class="dash-kpi-card" id="kpi-card-outstanding">
            <div class="dash-kpi-header"><span class="dash-kpi-label">Outstanding Balance</span><span class="dash-kpi-icon">⏳</span></div>
            <div class="dash-kpi-val font-mono" style="font-size: 19px; ${kpis.outstandingBalance > 0 ? 'color: var(--danger);' : ''}">${CP.util.fmtINR(kpis.outstandingBalance)}</div>
            <div class="dash-kpi-sub">unpaid &amp; advances</div>
          </a>

          <a href="#/qc" class="dash-kpi-card" id="kpi-card-scrap">
            <div class="dash-kpi-header"><span class="dash-kpi-label">Scrap % (30 Days)</span><span class="dash-kpi-icon">🗑️</span></div>
            <div class="dash-kpi-val ${scrapColorClass}">${kpis.scrapPct}%</div>
            <div class="dash-kpi-sub">target: 5.0%</div>
          </a>

          <a href="#/inventory" class="dash-kpi-card" id="kpi-card-low-stock">
            <div class="dash-kpi-header"><span class="dash-kpi-label">Low-Stock Materials</span><span class="dash-kpi-icon">🧵</span></div>
            <div class="dash-kpi-val" style="${kpis.lowStockCount > 0 ? 'color: var(--warning);' : ''}">${kpis.lowStockCount}</div>
            <div class="dash-kpi-sub">${kpis.lowStockCount > 0 ? `${kpis.lowStockMaterials.join(', ')} low` : 'all stock healthy'}</div>
          </a>

          <a href="#/maintenance" class="dash-kpi-card" id="kpi-card-overdue-maint">
            <div class="dash-kpi-header"><span class="dash-kpi-label">Overdue Maintenance</span><span class="dash-kpi-icon">🔧</span></div>
            <div class="dash-kpi-val" style="${kpis.overdueMaintCount > 0 ? 'color: var(--danger);' : ''}">${kpis.overdueMaintCount}</div>
            <div class="dash-kpi-sub">${kpis.overdueMaintCount > 0 ? `${kpis.overdueMaintCount} routine(s) due` : 'routines up to date'}</div>
          </a>
        </div>

        ${renderFarmGlance(printers)}
        ${renderDueSoonTable(orders)}

        <div class="grid grid-cols-2" style="margin-top: 20px;">
          ${renderRevenueChart(orders)}
          ${renderOrdersBreakdown(orders)}
        </div>
      </div>`;

    root.querySelector('#dash-btn-add-spool')?.addEventListener('click', openQuickAddSpoolModal);
    root.querySelector('#dash-btn-log-scrap')?.addEventListener('click', openQuickLogScrapModal);

    if (timerId) { clearInterval(timerId); timerId = null; }
    tick();
    timerId = setInterval(tick, 1000);
  }

  function setupBusListeners() {
    teardownBusListeners();
    if (CP.bus && typeof CP.bus.on === 'function') {
      unsubscribers.push(CP.bus.on('orders:changed', renderView));
      unsubscribers.push(CP.bus.on('farm:changed', renderView));
      unsubscribers.push(CP.bus.on('stock:changed', renderView));
      unsubscribers.push(CP.bus.on('scrap:changed', renderView));
      unsubscribers.push(CP.bus.on('maint:changed', renderView));
      unsubscribers.push(CP.bus.on('store:cp_orders', renderView));
      unsubscribers.push(CP.bus.on('store:cp_printers', renderView));
      unsubscribers.push(CP.bus.on('store:cp_spools', renderView));
      unsubscribers.push(CP.bus.on('store:cp_scrap', renderView));
    }
  }

  function teardownBusListeners() {
    unsubscribers.forEach(u => { if (typeof u === 'function') u(); });
    unsubscribers = [];
  }

  return {
    id: 'dashboard',
    route: '#/dashboard',
    title: 'Dashboard',
    icon: '📊',
    render(rootElement, params) {
      root = rootElement;
      setupBusListeners();
      renderView();
    },
    destroy() {
      if (timerId) { clearInterval(timerId); timerId = null; }
      teardownBusListeners();
      root = null;
    }
  };
})());
