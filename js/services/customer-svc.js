/**
 * CarbonPrints Company OS - Customer & Reusable Template Service
 * Global namespace: window.CP.customers
 * Handles local customer master directory, duplicate detection, order learning,
 * and reusable part/product templates.
 */
window.CP = window.CP || {};

CP.customers = (function () {
  const STORAGE_KEY = 'cp_customers';
  const TEMPLATES_KEY = 'cp_part_templates';

  function normalizePhone(p) {
    if (!p) return '';
    return CP.wa ? CP.wa.cleanPhone(p) : String(p).replace(/\D/g, '').slice(-10);
  }

  function normalizeEmail(e) {
    if (!e) return '';
    return String(e).trim().toLowerCase();
  }

  function validateCustomer(cust) {
    const errors = [];
    if (!cust || !cust.name || !String(cust.name).trim()) {
      errors.push('Customer Name is required.');
    }
    const cleanP = normalizePhone(cust?.phone);
    if (!cleanP) {
      errors.push('Customer Phone is required.');
    } else if (cleanP.length !== 10) {
      errors.push('Please enter a valid 10-digit Indian mobile number.');
    }
    return errors;
  }

  function getAll() {
    return CP.store ? CP.store.get(STORAGE_KEY, []) : [];
  }

  function getById(id) {
    if (!id) return null;
    return getAll().find(c => c && c.id === id) || null;
  }

  function findByPhone(phone) {
    const clean = normalizePhone(phone);
    if (!clean) return null;
    return getAll().find(c => c && normalizePhone(c.phone) === clean) || null;
  }

  function findDuplicates(custData, excludeId = null) {
    const cleanP = normalizePhone(custData?.phone);
    const cleanE = normalizeEmail(custData?.email);
    const customers = getAll();
    const dups = [];

    customers.forEach(c => {
      if (!c) return;
      if (excludeId && c.id === excludeId) return;
      const matchPhone = cleanP && normalizePhone(c.phone) === cleanP;
      const matchEmail = cleanE && c.email && normalizeEmail(c.email) === cleanE;
      if (matchPhone || matchEmail) {
        dups.push(c);
      }
    });
    return dups;
  }

  function save(custData, options = {}) {
    const errors = validateCustomer(custData);
    if (errors.length > 0) {
      return { ok: false, errors };
    }

    const cleanP = normalizePhone(custData.phone);
    const cleanE = normalizeEmail(custData.email);
    const customers = getAll();
    const now = new Date().toISOString();

    let targetId = custData.id;
    let existingIdx = -1;

    if (targetId) {
      existingIdx = customers.findIndex(c => c.id === targetId);
    } else {
      const dup = customers.find(c => normalizePhone(c.phone) === cleanP);
      if (dup) {
        if (!options.allowNameChange && dup.name.trim().toLowerCase() !== String(custData.name).trim().toLowerCase()) {
          return { ok: false, duplicate: dup, error: `Phone ${cleanP} is already registered to "${dup.name}".` };
        }
        targetId = dup.id;
        existingIdx = customers.findIndex(c => c.id === dup.id);
      }
    }

    const customerRecord = {
      id: targetId || (CP.util ? CP.util.uid('cust') : `cust_${Date.now()}`),
      name: String(custData.name).trim(),
      phone: cleanP,
      email: cleanE,
      category: custData.category || 'College Project',
      address: String(custData.address || '').trim(),
      gstin: String(custData.gstin || '').trim().toUpperCase(),
      createdAt: existingIdx >= 0 ? (customers[existingIdx].createdAt || now) : now,
      updatedAt: now
    };

    if (existingIdx >= 0) {
      customers[existingIdx] = customerRecord;
    } else {
      customers.push(customerRecord);
    }

    if (CP.store) CP.store.set(STORAGE_KEY, customers);
    return { ok: true, customer: customerRecord };
  }

  function remove(id) {
    const customers = getAll().filter(c => c.id !== id);
    if (CP.store) CP.store.set(STORAGE_KEY, customers);
    return true;
  }

  function search(query, maxResults = 8) {
    if (!query || typeof query !== 'string') return [];
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const cleanQ = q.replace(/\D/g, '');

    return getAll().filter(c => {
      if (!c) return false;
      const nameMatch = c.name && c.name.toLowerCase().includes(q);
      const phoneMatch = cleanQ && c.phone && c.phone.includes(cleanQ);
      const emailMatch = c.email && c.email.toLowerCase().includes(q);
      return nameMatch || phoneMatch || emailMatch;
    }).slice(0, maxResults);
  }

  function learnFromOrders() {
    const orders = CP.store ? CP.store.get('cp_orders', []) : [];
    const customers = [...getAll()];
    let importedCount = 0;

    orders.forEach(order => {
      const oc = order && order.customer;
      if (!oc || !oc.name || !oc.phone) return;
      const cleanP = normalizePhone(oc.phone);
      if (cleanP.length !== 10) return;

      // Invariant: Never silently merge two people solely because their names match.
      // Lookup is strictly by normalized 10-digit phone.
      const existing = customers.find(c => normalizePhone(c.phone) === cleanP);
      if (!existing) {
        const newCust = {
          id: CP.util ? CP.util.uid('cust') : `cust_${Date.now()}_${Math.random()}`,
          name: String(oc.name).trim(),
          phone: cleanP,
          email: normalizeEmail(oc.email),
          category: oc.category || 'College Project',
          address: String(oc.address || '').trim(),
          gstin: String(oc.gstin || '').trim().toUpperCase(),
          createdAt: order.createdAt || new Date().toISOString(),
          updatedAt: order.updatedAt || new Date().toISOString()
        };
        customers.push(newCust);
        importedCount++;
      } else {
        if (!existing.email && oc.email) existing.email = normalizeEmail(oc.email);
        if (!existing.category && oc.category) existing.category = oc.category;
      }
    });

    if (importedCount > 0 && CP.store) {
      CP.store.set(STORAGE_KEY, customers);
    }
    return { importedCount, totalCustomers: customers.length };
  }

  const DEFAULT_TEMPLATES = [
    { name: 'Calibration Cube 20mm', material: 'PLA', layer: '0.20', infillPct: 20, weightG: 12, notes: 'Standard tolerance benchmark' },
    { name: 'Functional Enclosure Shell', material: 'PETG', layer: '0.20', infillPct: 30, weightG: 45, notes: 'Snap-fit electronics enclosure' },
    { name: 'High-Strength Bracket / Arm', material: 'ABS', layer: '0.20', infillPct: 50, weightG: 65, notes: 'Structural mechanical bracket' },
    { name: 'Flexible Gasket / Bumper', material: 'TPU', layer: '0.20', infillPct: 100, weightG: 20, notes: 'Vibration dampener' }
  ];

  function getTemplates() {
    let list = CP.store ? CP.store.get(TEMPLATES_KEY, null) : null;
    if (!list || !Array.isArray(list) || list.length === 0) {
      list = DEFAULT_TEMPLATES.map(t => ({
        id: CP.util ? CP.util.uid('tmpl') : `tmpl_${Date.now()}_${Math.random()}`,
        ...t,
        createdAt: new Date().toISOString()
      }));
      if (CP.store) CP.store.set(TEMPLATES_KEY, list);
    }
    return list;
  }

  function saveTemplate(tData) {
    if (!tData || !tData.name || !String(tData.name).trim()) {
      return { ok: false, error: 'Template name is required.' };
    }
    const templates = [...getTemplates()];
    const now = new Date().toISOString();
    const id = tData.id || (CP.util ? CP.util.uid('tmpl') : `tmpl_${Date.now()}`);
    const record = {
      id,
      name: String(tData.name).trim(),
      material: tData.material || 'PLA',
      layer: tData.layer || '0.20',
      infillPct: Number(tData.infillPct) || 20,
      weightG: Number(tData.weightG) || 0,
      notes: String(tData.notes || '').trim(),
      updatedAt: now
    };
    const idx = templates.findIndex(t => t.id === id);
    if (idx >= 0) {
      templates[idx] = { ...templates[idx], ...record };
    } else {
      record.createdAt = now;
      templates.push(record);
    }
    if (CP.store) CP.store.set(TEMPLATES_KEY, templates);
    return { ok: true, template: record };
  }

  function removeTemplate(id) {
    const list = getTemplates().filter(t => t.id !== id);
    if (CP.store) CP.store.set(TEMPLATES_KEY, list);
    return true;
  }

  function getCategories(settings) {
    const s = settings || (CP.store ? CP.store.get('cp_settings', {}) : {});
    const catDiscounts = s.pricing?.categoryDiscountPct;
    if (catDiscounts && typeof catDiscounts === 'object') {
      const keys = Object.keys(catDiscounts);
      if (keys.length > 0) return keys;
    }
    return ['College Project', 'Hardware Startup R&D', 'Automotive Garage', 'Hobbyist'];
  }

  function openTemplatePicker(onSelect) {
    const templates = getTemplates();
    const rows = templates.map(t => `
      <div class="template-card" data-tmpl-id="${t.id}" style="padding:10px; border:1px solid var(--border); border-radius:var(--radius); margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;">
        <div>
          <div style="font-weight:600; color:var(--text);">${CP.util.esc(t.name)}</div>
          <div style="font-size:12px; color:var(--text-muted);">${CP.util.esc(t.material)} | ${t.layer}mm | ${t.infillPct}% | ${t.weightG}g ${t.notes ? `| ${CP.util.esc(t.notes)}` : ''}</div>
        </div>
        <div style="display:flex; gap:6px;">
          <button type="button" class="btn btn-secondary btn-sm btn-pick-tmpl" data-id="${t.id}">Select</button>
          <button type="button" class="btn btn-ghost btn-sm btn-del-tmpl" data-id="${t.id}" title="Delete template">🗑️</button>
        </div>
      </div>
    `).join('');

    CP.ui.modal({
      title: '📂 Part Blueprint Templates',
      bodyHTML: `
        <div style="margin-bottom:12px; font-size:13px; color:var(--text-muted);">Choose a standard blueprint to add to your quote:</div>
        <div id="tmpl-list-container" style="max-height:350px; overflow-y:auto;">
          ${rows || '<div style="color:var(--text-muted); padding:20px; text-align:center;">No templates found.</div>'}
        </div>
      `,
      buttons: [{ label: 'Close', kind: 'btn-secondary' }]
    });

    const container = document.getElementById('tmpl-list-container');
    if (container) {
      container.addEventListener('click', (e) => {
        const pickBtn = e.target.closest('.btn-pick-tmpl');
        if (pickBtn) {
          const t = templates.find(x => x.id === pickBtn.getAttribute('data-id'));
          if (t && onSelect) {
            onSelect(t);
            CP.ui.closeModal();
          }
          return;
        }
        const delBtn = e.target.closest('.btn-del-tmpl');
        if (delBtn) {
          const tId = delBtn.getAttribute('data-id');
          removeTemplate(tId);
          delBtn.closest('.template-card')?.remove();
          CP.ui.toast('Template removed', 'info');
        }
      });
    }
  }

  function cloneOrder(order) {
    if (!order) return null;
    const clone = JSON.parse(JSON.stringify(order));
    clone.id = null; clone.createdAt = null; clone.updatedAt = null; clone.status = 'quote';
    clone.invoiceNo = null; clone.challanNo = null;
    if (clone.pricing) clone.pricing.isSnapshotted = false;
    clone.payment = { status: 'unpaid', paidAmount: 0, history: [] };
    if (Array.isArray(clone.parts)) {
      clone.parts.forEach(p => {
        p.id = CP.util ? CP.util.uid('pt') : `pt_${Date.now()}_${Math.random()}`;
        p.status = 'pending'; p.assignedPrinterId = null; p.spoolId = null;
      });
    }
    return clone;
  }

  function createPartFromTemplate(tmpl) {
    return {
      id: CP.util ? CP.util.uid('pt') : `pt_${Date.now()}_${Math.random()}`,
      name: tmpl?.name || 'New Part', material: tmpl?.material || 'PLA',
      layer: tmpl?.layer || '0.20', infillPct: Number(tmpl?.infillPct) || 20,
      weightG: Number(tmpl?.weightG) || 0, qty: 1, printHoursOverride: null,
      status: 'pending', assignedPrinterId: null, spoolId: null, notes: tmpl?.notes || ''
    };
  }

  return {
    getAll,
    getById,
    findByPhone,
    findDuplicates,
    save,
    remove,
    search,
    learnFromOrders,
    normalizePhone,
    normalizeEmail,
    validateCustomer,
    getTemplates,
    saveTemplate,
    removeTemplate,
    openTemplatePicker,
    cloneOrder,
    createPartFromTemplate,
    getCategories
  };
})();

