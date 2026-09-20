/**
 * CarbonPrints Company OS - Settings Module
 * Global namespace: window.CP
 * Full implementation managing business profile, materials, pricing, and production config.
 */
window.CP = window.CP || {};

CP.registerModule((function () {
  let activeTab = 'business';
  let tempSettings = null;

  function loadSettings() {
    const raw = CP.store.get('cp_settings', CP.defaults ? CP.defaults.settings : {});
    return JSON.parse(JSON.stringify(raw));
  }

  function validate(settings) {
    const errors = [];
    if (!settings.business.name || !settings.business.name.trim()) errors.push('Business Name is required.');
    if (!settings.business.upiId || !settings.business.upiId.trim()) errors.push('UPI ID is required.');
    if (settings.pricing.gstPct < 0 || settings.pricing.gstPct > 28) errors.push('GST percentage must be 0% to 28%.');
    if (settings.pricing.minMarginPct < 0) errors.push('Minimum margin percentage cannot be negative.');

    settings.materials.forEach(mat => {
      const rate = Number(settings.pricing.ratePerGram[mat]);
      if (isNaN(rate) || rate < 0) errors.push(`Rate per gram for "${mat}" cannot be negative.`);
    });

    ['0.28', '0.20', '0.12'].forEach(layer => {
      const mult = Number(settings.pricing.layerMultiplier[layer]);
      if (isNaN(mult) || mult <= 0) errors.push(`Layer multiplier for ${layer}mm must be greater than 0.`);
    });

    for (const [cat, disc] of Object.entries(settings.pricing.categoryDiscountPct || {})) {
      if (disc < 0 || disc > 100) errors.push(`Discount for "${cat}" must be 0% to 100%.`);
    }

    if (settings.production.printHoursPerDay < 1 || settings.production.printHoursPerDay > 24) {
      errors.push('Print hours per day must be between 1 and 24.');
    }
    if (settings.production.lowStockThresholdG < 0) errors.push('Low stock threshold cannot be negative.');
    if (settings.production.scrapTargetPct < 0 || settings.production.scrapTargetPct > 100) {
      errors.push('Scrap target percentage must be 0% to 100%.');
    }
    if (settings.production.toleranceMm < 0) errors.push('Dimensional tolerance cannot be negative.');
    if (settings.production.nozzleLifeLimitG <= 0) errors.push('Nozzle life limit must be greater than 0g.');

    return errors;
  }

  function renderBusinessTab(s) {
    const b = s.business || {};
    return `
      <div class="card">
        <div class="card-header">
          <div>
            <h3 class="card-title">Business Profile &amp; Invoicing Details</h3>
            <div class="card-subtitle">Appears on invoices, delivery challans, and customer WhatsApp quotes</div>
          </div>
        </div>
        <div class="grid grid-cols-2">
          <div class="field"><label for="cfg-biz-name">Brand Display Name</label><input type="text" id="cfg-biz-name" class="input" value="${CP.util.esc(b.name)}"></div>
          <div class="field"><label for="cfg-biz-legal">Legal Entity Name</label><input type="text" id="cfg-biz-legal" class="input" value="${CP.util.esc(b.legalName)}"></div>
          <div class="field" style="grid-column: 1 / -1;"><label for="cfg-biz-addr">Registered Address</label><textarea id="cfg-biz-addr" class="textarea">${CP.util.esc(b.address)}</textarea></div>
          <div class="field"><label for="cfg-biz-phone">Phone / WhatsApp</label><input type="text" id="cfg-biz-phone" class="input" value="${CP.util.esc(b.phone)}"></div>
          <div class="field"><label for="cfg-biz-email">Email Address</label><input type="email" id="cfg-biz-email" class="input" value="${CP.util.esc(b.email)}"></div>
          <div class="field"><label for="cfg-biz-gstin">GSTIN</label><input type="text" id="cfg-biz-gstin" class="input" placeholder="33AAAAA0000A1Z5" value="${CP.util.esc(b.gstin)}"></div>
          <div class="field"><label for="cfg-biz-prefix">Invoice / Challan Prefix</label><input type="text" id="cfg-biz-prefix" class="input" value="${CP.util.esc(b.invoicePrefix)}"></div>
          <div class="field"><label for="cfg-biz-upi-id">UPI ID (VPA)</label><input type="text" id="cfg-biz-upi-id" class="input" placeholder="name@upi" value="${CP.util.esc(b.upiId)}"></div>
          <div class="field"><label for="cfg-biz-upi-name">UPI Payee Name</label><input type="text" id="cfg-biz-upi-name" class="input" value="${CP.util.esc(b.upiName)}"></div>
          <div class="field" style="grid-column: 1 / -1;"><label for="cfg-biz-footer">Invoice &amp; Quote Footer Note</label><textarea id="cfg-biz-footer" class="textarea">${CP.util.esc(b.footerNote)}</textarea></div>
        </div>
      </div>
    `;
  }

  function renderPricingTab(s) {
    const p = s.pricing || {};
    const materials = s.materials || [];

    const rateRows = materials.map(mat => {
      const rate = p.ratePerGram && p.ratePerGram[mat] !== undefined ? p.ratePerGram[mat] : 4;
      return `
        <div class="field">
          <label for="cfg-rate-${CP.util.esc(mat)}">${CP.util.esc(mat)} (₹ / gram)</label>
          <input type="number" step="0.25" min="0" id="cfg-rate-${CP.util.esc(mat)}" class="input cfg-rate-input" data-mat="${CP.util.esc(mat)}" value="${rate}">
        </div>
      `;
    }).join('');

    const catDiscounts = p.categoryDiscountPct || {
      "College Project": 0, "Hardware Startup R&D": 0, "Automotive Garage": 0, "Hobbyist": 0
    };

    const catRows = Object.entries(catDiscounts).map(([cat, val]) => `
      <div class="field">
        <label for="cfg-cat-${CP.util.esc(cat)}">${CP.util.esc(cat)} (%)</label>
        <input type="number" step="1" min="0" max="100" id="cfg-cat-${CP.util.esc(cat)}" class="input cfg-cat-input" data-cat="${CP.util.esc(cat)}" value="${val}">
      </div>
    `).join('');

    return `
      <div class="card">
        <div class="card-header">
          <div>
            <h3 class="card-title">Supported Filament Materials</h3>
            <div class="card-subtitle">Manage materials available for quoting and inventory</div>
          </div>
        </div>
        <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px;">
          ${materials.map(mat => `
            <div class="badge badge-default" style="padding: 6px 12px; font-size: 13px; display: inline-flex; align-items: center; gap: 8px;">
              <strong>${CP.util.esc(mat)}</strong>
              ${materials.length > 1 ? `<button type="button" class="btn-remove-mat" data-mat="${CP.util.esc(mat)}" style="background: none; border: none; cursor: pointer; color: var(--danger); font-weight: bold;">&times;</button>` : ''}
            </div>
          `).join('')}
        </div>
        <div style="display: flex; gap: 8px; max-width: 400px;">
          <input type="text" id="cfg-new-mat-input" class="input" placeholder="New material (e.g. PETG, Carbon-PLA)">
          <button type="button" id="cfg-add-mat-btn" class="btn btn-secondary">Add Material</button>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <div>
            <h3 class="card-title">Base Rates &amp; Layer Multipliers</h3>
            <div class="card-subtitle">Baseline selling prices and layer quality cost factors</div>
          </div>
        </div>
        <h4 style="font-size: 13px; font-weight: 600; margin-bottom: 12px; color: var(--text-muted);">RATE PER GRAM (₹ / gram)</h4>
        <div class="grid grid-cols-3" style="margin-bottom: 20px;">${rateRows}</div>

        <h4 style="font-size: 13px; font-weight: 600; margin-bottom: 12px; color: var(--text-muted);">LAYER HEIGHT MULTIPLIERS</h4>
        <div class="grid grid-cols-3">
          <div class="field"><label for="cfg-layer-028">0.28 mm (Draft)</label><input type="number" step="0.05" min="0.1" id="cfg-layer-028" class="input" value="${p.layerMultiplier ? p.layerMultiplier['0.28'] : 1}"></div>
          <div class="field"><label for="cfg-layer-020">0.20 mm (Standard)</label><input type="number" step="0.05" min="0.1" id="cfg-layer-020" class="input" value="${p.layerMultiplier ? p.layerMultiplier['0.20'] : 1}"></div>
          <div class="field"><label for="cfg-layer-012">0.12 mm (Fine)</label><input type="number" step="0.05" min="0.1" id="cfg-layer-012" class="input" value="${p.layerMultiplier ? p.layerMultiplier['0.12'] : 1}"></div>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <div>
            <h3 class="card-title">Taxation &amp; Customer Discounts</h3>
            <div class="card-subtitle">GST configuration and customer category discounts</div>
          </div>
        </div>
        <div class="grid grid-cols-3" style="margin-bottom: 16px;">
          <div class="field"><label class="checkbox-label"><input type="checkbox" id="cfg-gst-enabled" ${p.gstEnabled ? 'checked' : ''}><span>Enable GST Invoicing</span></label></div>
          <div class="field"><label for="cfg-gst-pct">GST Rate (%)</label><input type="number" step="1" min="0" max="28" id="cfg-gst-pct" class="input" value="${p.gstPct !== undefined ? p.gstPct : 18}"></div>
          <div class="field"><label class="checkbox-label"><input type="checkbox" id="cfg-gst-interstate" ${p.interState ? 'checked' : ''}><span>Interstate Order (IGST)</span></label></div>
        </div>
        <div class="field" style="max-width: 300px; margin-bottom: 24px;">
          <label for="cfg-min-margin">Minimum Safety Margin (%)</label>
          <input type="number" step="1" min="0" max="100" id="cfg-min-margin" class="input" value="${p.minMarginPct !== undefined ? p.minMarginPct : 40}">
        </div>
        <h4 style="font-size: 13px; font-weight: 600; margin-bottom: 12px; color: var(--text-muted);">CUSTOMER CATEGORY DISCOUNTS (%)</h4>
        <div class="grid grid-cols-2">${catRows}</div>
      </div>
    `;
  }

  function renderProductionTab(s) {
    const pr = s.production || {};
    const materials = s.materials || [];
    const abrasive = pr.abrasiveMaterials || [];

    return `
      <div class="card">
        <div class="card-header">
          <div>
            <h3 class="card-title">Production Speeds &amp; Operating Hours</h3>
            <div class="card-subtitle">Heuristics used by Order Desk and Farm Board to compute duration and delivery dates</div>
          </div>
        </div>
        <h4 style="font-size: 13px; font-weight: 600; margin-bottom: 12px; color: var(--text-muted);">PRINT SPEED BENCHMARKS (Grams per Hour)</h4>
        <div class="grid grid-cols-3" style="margin-bottom: 20px;">
          <div class="field"><label for="cfg-gph-028">0.28 mm Draft (g/hr)</label><input type="number" step="1" min="1" id="cfg-gph-028" class="input" value="${pr.gramsPerHour ? pr.gramsPerHour['0.28'] : 15}"></div>
          <div class="field"><label for="cfg-gph-020">0.20 mm Standard (g/hr)</label><input type="number" step="1" min="1" id="cfg-gph-020" class="input" value="${pr.gramsPerHour ? pr.gramsPerHour['0.20'] : 10}"></div>
          <div class="field"><label for="cfg-gph-012">0.12 mm Fine (g/hr)</label><input type="number" step="1" min="1" id="cfg-gph-012" class="input" value="${pr.gramsPerHour ? pr.gramsPerHour['0.12'] : 6}"></div>
        </div>
        <h4 style="font-size: 13px; font-weight: 600; margin-bottom: 12px; color: var(--text-muted);">FARM CAPACITY &amp; LEAD TIMES</h4>
        <div class="grid grid-cols-2">
          <div class="field"><label for="cfg-hours-day">Farm Operating Hours / Day</label><input type="number" step="1" min="1" max="24" id="cfg-hours-day" class="input" value="${pr.printHoursPerDay !== undefined ? pr.printHoursPerDay : 16}"></div>
          <div class="field"><label for="cfg-post-days">Post-Processing Buffer (Days)</label><input type="number" step="1" min="0" id="cfg-post-days" class="input" value="${pr.postProcessDays !== undefined ? pr.postProcessDays : 1}"></div>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <div>
            <h3 class="card-title">Quality, Scrap &amp; Hardware Limits</h3>
            <div class="card-subtitle">Safety thresholds for stock alerts, brass nozzle wear, and QC tolerances</div>
          </div>
        </div>
        <div class="grid grid-cols-2">
          <div class="field"><label for="cfg-low-stock">Low Stock Warning Threshold (Grams)</label><input type="number" step="100" min="0" id="cfg-low-stock" class="input" value="${pr.lowStockThresholdG !== undefined ? pr.lowStockThresholdG : 2000}"></div>
          <div class="field"><label for="cfg-scrap-target">Target Maximum Scrap Rate (%)</label><input type="number" step="0.5" min="0" max="100" id="cfg-scrap-target" class="input" value="${pr.scrapTargetPct !== undefined ? pr.scrapTargetPct : 5}"></div>
          <div class="field"><label for="cfg-tolerance">QC Dimensional Tolerance (± mm)</label><input type="number" step="0.05" min="0" id="cfg-tolerance" class="input" value="${pr.toleranceMm !== undefined ? pr.toleranceMm : 0.2}"></div>
          <div class="field"><label for="cfg-nozzle-life">Brass Nozzle Life Limit (Grams Extruded)</label><input type="number" step="500" min="100" id="cfg-nozzle-life" class="input" value="${pr.nozzleLifeLimitG !== undefined ? pr.nozzleLifeLimitG : 5000}"></div>
        </div>
        <div class="field" style="margin-top: 16px;">
          <label>Abrasive Materials (Accelerates Brass Nozzle Wear 3x)</label>
          <div style="display: flex; gap: 16px; flex-wrap: wrap; margin-top: 6px;">
            ${materials.map(mat => `
              <label class="checkbox-label">
                <input type="checkbox" class="cfg-abrasive-cb" data-mat="${CP.util.esc(mat)}" ${abrasive.includes(mat) ? 'checked' : ''}>
                <span>${CP.util.esc(mat)}</span>
              </label>
            `).join('')}
          </div>
        </div>
      </div>
    `;
  }

  function renderDevTab() {
    const usageBytes = CP.store.usage();
    const usageKB = (usageBytes / 1024).toFixed(2);
    const meta = CP.store.get('cp_meta', { schemaVersion: 1, lastBackupAt: null });

    return `
      <div class="card">
        <div class="card-header">
          <div>
            <h3 class="card-title">Offline Diagnostics &amp; Developer Controls</h3>
            <div class="card-subtitle">Manage local storage, seed test scenarios, or completely reset offline state</div>
          </div>
        </div>
        <div style="display: flex; gap: 24px; margin-bottom: 24px;">
          <div style="background: var(--surface-alt); padding: 16px; border-radius: var(--radius); flex: 1;">
            <div style="font-size: 12px; color: var(--text-muted); text-transform: uppercase;">Storage Usage</div>
            <div style="font-size: 20px; font-weight: 700; margin-top: 4px;">${usageKB} KB</div>
          </div>
          <div style="background: var(--surface-alt); padding: 16px; border-radius: var(--radius); flex: 1;">
            <div style="font-size: 12px; color: var(--text-muted); text-transform: uppercase;">Schema Version</div>
            <div style="font-size: 20px; font-weight: 700; margin-top: 4px;">v${meta.schemaVersion || 1}</div>
          </div>
          <div style="background: var(--surface-alt); padding: 16px; border-radius: var(--radius); flex: 1;">
            <div style="font-size: 12px; color: var(--text-muted); text-transform: uppercase;">Last Data Backup</div>
            <div style="font-size: 14px; font-weight: 600; margin-top: 8px;">${meta.lastBackupAt ? CP.util.fmtDateTime(meta.lastBackupAt) : 'Never'}</div>
          </div>
        </div>
        <div style="display: flex; gap: 12px; align-items: center; padding-top: 12px; border-top: 1px solid var(--border);">
          <button type="button" id="btn-dev-seed" class="btn btn-secondary"><span>🌱</span><span>Demo Data</span></button>
          <button type="button" id="btn-dev-reset" class="btn btn-danger"><span>⚠️</span><span>Reset All Data</span></button>
        </div>
      </div>
    `;
  }

  function readFormInputs(s) {
    const bName = document.getElementById('cfg-biz-name');
    if (bName) {
      s.business.name = bName.value.trim();
      s.business.legalName = (document.getElementById('cfg-biz-legal')?.value || '').trim();
      s.business.address = (document.getElementById('cfg-biz-addr')?.value || '').trim();
      s.business.phone = (document.getElementById('cfg-biz-phone')?.value || '').trim();
      s.business.email = (document.getElementById('cfg-biz-email')?.value || '').trim();
      s.business.gstin = (document.getElementById('cfg-biz-gstin')?.value || '').trim();
      s.business.invoicePrefix = (document.getElementById('cfg-biz-prefix')?.value || '').trim();
      s.business.upiId = (document.getElementById('cfg-biz-upi-id')?.value || '').trim();
      s.business.upiName = (document.getElementById('cfg-biz-upi-name')?.value || '').trim();
      s.business.footerNote = (document.getElementById('cfg-biz-footer')?.value || '').trim();
    }

    const gstCheck = document.getElementById('cfg-gst-enabled');
    if (gstCheck) {
      s.pricing.gstEnabled = gstCheck.checked;
      s.pricing.gstPct = Number(document.getElementById('cfg-gst-pct')?.value) || 0;
      s.pricing.interState = !!document.getElementById('cfg-gst-interstate')?.checked;
      s.pricing.minMarginPct = Number(document.getElementById('cfg-min-margin')?.value) || 0;
      s.pricing.layerMultiplier = {
        "0.28": Number(document.getElementById('cfg-layer-028')?.value) || 1,
        "0.20": Number(document.getElementById('cfg-layer-020')?.value) || 1,
        "0.12": Number(document.getElementById('cfg-layer-012')?.value) || 1
      };
      s.pricing.ratePerGram = s.pricing.ratePerGram || {};
      document.querySelectorAll('.cfg-rate-input').forEach(inp => {
        const mat = inp.getAttribute('data-mat');
        if (mat) s.pricing.ratePerGram[mat] = Number(inp.value) || 0;
      });
      s.pricing.categoryDiscountPct = s.pricing.categoryDiscountPct || {};
      document.querySelectorAll('.cfg-cat-input').forEach(inp => {
        const cat = inp.getAttribute('data-cat');
        if (cat) s.pricing.categoryDiscountPct[cat] = Number(inp.value) || 0;
      });
    }

    const gph028 = document.getElementById('cfg-gph-028');
    if (gph028) {
      s.production.gramsPerHour = {
        "0.28": Number(gph028.value) || 15,
        "0.20": Number(document.getElementById('cfg-gph-020')?.value) || 10,
        "0.12": Number(document.getElementById('cfg-gph-012')?.value) || 6
      };
      s.production.printHoursPerDay = Number(document.getElementById('cfg-hours-day')?.value) || 16;
      s.production.postProcessDays = Number(document.getElementById('cfg-post-days')?.value) || 1;
      s.production.lowStockThresholdG = Number(document.getElementById('cfg-low-stock')?.value) || 2000;
      s.production.scrapTargetPct = Number(document.getElementById('cfg-scrap-target')?.value) || 5;
      s.production.toleranceMm = Number(document.getElementById('cfg-tolerance')?.value) || 0.2;
      s.production.nozzleLifeLimitG = Number(document.getElementById('cfg-nozzle-life')?.value) || 5000;

      const abrasive = [];
      document.querySelectorAll('.cfg-abrasive-cb:checked').forEach(cb => {
        const mat = cb.getAttribute('data-mat');
        if (mat) abrasive.push(mat);
      });
      s.production.abrasiveMaterials = abrasive;
    }
  }

  function bindEvents(rootElement) {
    rootElement.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        readFormInputs(tempSettings);
        activeTab = e.target.getAttribute('data-tab');
        renderFull(rootElement);
      });
    });

    const addMatBtn = rootElement.querySelector('#cfg-add-mat-btn');
    const newMatInput = rootElement.querySelector('#cfg-new-mat-input');
    if (addMatBtn && newMatInput) {
      const handleAddMat = () => {
        const val = newMatInput.value.trim().toUpperCase();
        if (!val) return;
        if (tempSettings.materials.includes(val)) {
          CP.ui.toast(`Material "${val}" already exists.`, 'warning');
          return;
        }
        readFormInputs(tempSettings);
        tempSettings.materials.push(val);
        if (!tempSettings.pricing.ratePerGram[val]) tempSettings.pricing.ratePerGram[val] = 4;
        renderFull(rootElement);
        CP.ui.toast(`Material "${val}" added.`, 'info');
      };
      addMatBtn.addEventListener('click', handleAddMat);
      newMatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); handleAddMat(); }
      });
    }

    rootElement.querySelectorAll('.btn-remove-mat').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const mat = e.target.getAttribute('data-mat');
        if (!mat) return;
        if (tempSettings.materials.length <= 1) {
          CP.ui.toast("At least one material must remain.", "warning");
          return;
        }
        readFormInputs(tempSettings);
        tempSettings.materials = tempSettings.materials.filter(m => m !== mat);
        delete tempSettings.pricing.ratePerGram[mat];
        tempSettings.production.abrasiveMaterials = tempSettings.production.abrasiveMaterials.filter(m => m !== mat);
        renderFull(rootElement);
        CP.ui.toast(`Material "${mat}" removed.`, 'info');
      });
    });

    const saveBtn = rootElement.querySelector('#btn-save-settings');
    if (saveBtn) {
      saveBtn.addEventListener('click', () => {
        readFormInputs(tempSettings);
        const errors = validate(tempSettings);
        if (errors.length > 0) {
          CP.ui.toast(errors[0], 'danger');
          return;
        }
        CP.store.set('cp_settings', tempSettings);
        CP.ui.toast('Settings saved successfully!', 'success');
      });
    }

    const resetDefaultsBtn = rootElement.querySelector('#btn-reset-settings-defaults');
    if (resetDefaultsBtn) {
      resetDefaultsBtn.addEventListener('click', async () => {
        const ok = await CP.ui.confirm("Reset all settings to default factory values? Unsaved modifications will be lost.");
        if (!ok) return;
        tempSettings = JSON.parse(JSON.stringify(CP.defaults.settings));
        CP.store.set('cp_settings', tempSettings);
        CP.ui.toast('Settings reset to factory defaults.', 'success');
        renderFull(rootElement);
      });
    }

    const devSeedBtn = rootElement.querySelector('#btn-dev-seed');
    if (devSeedBtn) devSeedBtn.addEventListener('click', () => { if (CP.dev) CP.dev.seed(); });

    const devResetBtn = rootElement.querySelector('#btn-dev-reset');
    if (devResetBtn) devResetBtn.addEventListener('click', () => { if (CP.dev) CP.dev.reset(); });
  }

  function renderFull(rootElement) {
    if (!tempSettings) tempSettings = loadSettings();

    let tabContent = '';
    if (activeTab === 'business') tabContent = renderBusinessTab(tempSettings);
    else if (activeTab === 'pricing') tabContent = renderPricingTab(tempSettings);
    else if (activeTab === 'production') tabContent = renderProductionTab(tempSettings);
    else if (activeTab === 'dev') tabContent = renderDevTab();

    rootElement.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px;">
        <div>
          <h2 style="font-size: 20px; font-weight: 700; color: var(--text);">⚙️ System Settings &amp; Configuration</h2>
          <div style="color: var(--text-muted); font-size: 13px;">Manage company profile, rates, print heuristics, and local storage</div>
        </div>
        <div style="display: flex; gap: 8px;">
          <button type="button" id="btn-reset-settings-defaults" class="btn btn-secondary">Reset to Defaults</button>
          <button type="button" id="btn-save-settings" class="btn btn-primary">Save Settings</button>
        </div>
      </div>
      <div class="tabs">
        <button type="button" class="tab-btn ${activeTab === 'business' ? 'active' : ''}" data-tab="business">Business Profile</button>
        <button type="button" class="tab-btn ${activeTab === 'pricing' ? 'active' : ''}" data-tab="pricing">Materials &amp; Pricing</button>
        <button type="button" class="tab-btn ${activeTab === 'production' ? 'active' : ''}" data-tab="production">Production &amp; Farm</button>
        <button type="button" class="tab-btn ${activeTab === 'dev' ? 'active' : ''}" data-tab="dev">Diagnostics &amp; Dev</button>
      </div>
      <div class="tab-panel">${tabContent}</div>
    `;

    bindEvents(rootElement);
  }

  return {
    id: 'settings',
    route: '#/settings',
    title: 'Settings',
    icon: '⚙️',
    render(rootElement, params) {
      tempSettings = loadSettings();
      renderFull(rootElement);
    },
    destroy() {
      tempSettings = null;
    }
  };
})());
