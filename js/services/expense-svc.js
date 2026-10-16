/**
 * CarbonPrints Company OS - Expenses & Accounts Service
 * Global namespace: window.CP.expenses
 * Handles local operational expenses ledger, categories, monthly summaries,
 * cash movement calculations, CSV export, and safe validated CSV import.
 */
window.CP = window.CP || {};

CP.expenses = (function () {
  const STORAGE_KEY = 'cp_expenses';

  const DEFAULT_CATEGORIES = [
    'Rent',
    'Electricity & Utilities',
    'Filament & Material Stock',
    'Maintenance & Spares',
    'Packaging & Shipping',
    'Transport & Delivery',
    'Tools & Software',
    'Workshop Supplies',
    'Other'
  ];

  function getCategories(settings) {
    const s = settings || (CP.store ? CP.store.get('cp_settings', {}) : {});
    const customCats = s.expenses?.categories;
    if (Array.isArray(customCats) && customCats.length > 0) {
      return customCats;
    }
    return [...DEFAULT_CATEGORIES];
  }

  function validateExpense(exp) {
    const errors = [];
    if (!exp) {
      errors.push('Expense payload is required.');
      return errors;
    }
    if (!exp.date || !/^\d{4}-\d{2}-\d{2}$/.test(String(exp.date).trim())) {
      errors.push('A valid expense date (YYYY-MM-DD) is required.');
    }
    if (!exp.payee || !String(exp.payee).trim()) {
      errors.push('Payee / Vendor name is required.');
    }
    if (!exp.description || !String(exp.description).trim()) {
      errors.push('Expense description is required.');
    }
    const amt = Number(exp.amount);
    if (isNaN(amt) || amt <= 0) {
      errors.push('Expense amount must be a positive number greater than ₹0.');
    }
    if (!exp.category || !String(exp.category).trim()) {
      errors.push('Expense category is required.');
    }
    return errors;
  }

  function getAll() {
    return (CP.store && typeof CP.store.get === 'function') ? CP.store.get(STORAGE_KEY, []) : [];
  }

  function getById(id) {
    if (!id) return null;
    return getAll().find(e => e && e.id === id) || null;
  }

  function save(expData) {
    const errors = validateExpense(expData);
    if (errors.length > 0) {
      const err = new Error(errors[0]);
      err.errors = errors;
      throw err;
    }

    const expenses = getAll();
    const nowISO = new Date().toISOString();
    let targetId = expData.id;
    let existingIdx = -1;

    if (targetId) {
      existingIdx = expenses.findIndex(e => e && e.id === targetId);
    }

    if (!targetId || existingIdx < 0) {
      targetId = targetId || (CP.util?.nextId ? CP.util.nextId('expense', expData.date) : `CP-EXP-${Date.now()}`);
      let disambig = 1;
      const baseId = targetId;
      while (expenses.some(e => e && e.id === targetId)) {
        targetId = `${baseId}-${disambig++}`;
      }
    }

    const mode = expData.paymentMode || expData.mode || 'UPI';
    const txnRef = String(expData.referenceNo || expData.txnRef || '').trim();
    const linkedOrder = String(expData.linkedOrderId || expData.linkedOrder || '').trim();
    const linkedPrinter = expData.linkedPrinterId || expData.linkedPrinter || '';

    const record = {
      id: targetId,
      date: String(expData.date).trim(),
      category: String(expData.category || 'Other').trim(),
      payee: String(expData.payee).trim(),
      description: String(expData.description).trim(),
      amount: CP.util ? CP.util.round2(Number(expData.amount)) : Math.round(Number(expData.amount) * 100) / 100,
      mode,
      paymentMode: mode,
      txnRef,
      referenceNo: txnRef,
      notes: String(expData.notes || '').trim(),
      linkedOrder,
      linkedOrderId: linkedOrder,
      linkedPrinter,
      linkedPrinterId: linkedPrinter,
      receiptRef: String(expData.receiptRef || '').trim(),
      createdAt: existingIdx >= 0 ? (expenses[existingIdx].createdAt || nowISO) : nowISO,
      updatedAt: nowISO
    };
    if (existingIdx >= 0) {
      expenses[existingIdx] = record;
    } else {
      expenses.push(record);
    }

    try {
      if (CP.store) CP.store.set(STORAGE_KEY, expenses);
    } catch (saveErr) {
      const err = new Error(saveErr.name === 'QuotaExceededError' || saveErr.message?.includes('Quota')
        ? 'Cannot save expense: Browser storage quota is full (QuotaExceededError).'
        : `Storage write failed: ${saveErr.message}`);
      err.name = saveErr.name;
      throw err;
    }

    return { ...record, ok: true, expense: record };
  }

  function remove(id) {
    if (!id) return false;
    const expenses = getAll().filter(e => e && e.id !== id);
    try {
      if (CP.store) CP.store.set(STORAGE_KEY, expenses);
      return true;
    } catch (err) {
      console.error('[CP.expenses.remove] Storage write failed:', err);
      return false;
    }
  }

  function filter(opts = {}) {
    let list = getAll();
    const q = (opts.query || opts.q || '').trim().toLowerCase();
    const cat = opts.category || '';
    const mode = opts.mode || opts.paymentMode || '';
    const from = opts.startDate || opts.dateFrom || opts.start || '';
    const to = opts.endDate || opts.dateTo || opts.end || '';

    return list.filter(e => {
      if (!e) return false;
      const d = (e.date || '').slice(0, 10);
      if (from && d < from) return false;
      if (to && d > to) return false;
      if (cat && cat !== 'all' && e.category !== cat) return false;
      if (mode && mode !== 'all' && e.mode !== mode && e.paymentMode !== mode) return false;
      if (q) {
        const mPayee = (e.payee || '').toLowerCase().includes(q);
        const mDesc = (e.description || '').toLowerCase().includes(q);
        const mRef = (e.txnRef || e.referenceNo || '').toLowerCase().includes(q);
        const mNotes = (e.notes || '').toLowerCase().includes(q);
        const mId = (e.id || '').toLowerCase().includes(q);
        const mOrder = (e.linkedOrder || e.linkedOrderId || '').toLowerCase().includes(q);
        if (!mPayee && !mDesc && !mRef && !mNotes && !mId && !mOrder) return false;
      }
      return true;
    }).sort((a, b) => {
      const dateA = a.date || '', dateB = b.date || '';
      if (dateA !== dateB) return dateA > dateB ? -1 : 1;
      return (a.id || '') > (b.id || '') ? -1 : 1;
    });
  }

  function getMonthTotal(year, monthIdx) {
    const list = getAll();
    let total = 0;
    list.forEach(e => {
      if (!e || !e.date) return;
      const parts = e.date.split('-');
      if (parts.length >= 2) {
        const y = Number(parts[0]);
        const m = Number(parts[1]) - 1; // 0-based month
        if (y === year && m === monthIdx) {
          total += (Number(e.amount) || 0);
        }
      }
    });
    return CP.util ? CP.util.round2(total) : total;
  }

  function getCashMovement(year, monthIdx) {
    // 1. Calculate recorded cash payments received from customers in the period
    const orders = (CP.store && typeof CP.store.get === 'function') ? CP.store.get('cp_orders', []) : [];
    let cashReceived = 0;

    orders.forEach(o => {
      const history = o.payment?.history || [];
      if (history.length > 0) {
        history.forEach(h => {
          if (h && h.ts) {
            const d = new Date(h.ts);
            if (d.getFullYear() === year && d.getMonth() === monthIdx) {
              cashReceived += (Number(h.amount) || 0);
            }
          }
        });
      } else if (o.payment?.paidAmount > 0 && o.createdAt) {
        const d = new Date(o.createdAt);
        if (d.getFullYear() === year && d.getMonth() === monthIdx) {
          cashReceived += (Number(o.payment.paidAmount) || 0);
        }
      }
    });

    // 2. Calculate recorded operational expenses for the period
    const expenses = getMonthTotal(year, monthIdx);

    // 3. Net Cash Movement (Receipts - Expenses) — NOT labelled as net profit
    const cashMovement = (CP.util ? CP.util.round2(cashReceived - expenses) : (cashReceived - expenses));

    return {
      paymentsReceived: CP.util ? CP.util.round2(cashReceived) : cashReceived,
      cashReceived: CP.util ? CP.util.round2(cashReceived) : cashReceived,
      expensesRecorded: expenses,
      expenses,
      cashMovement
    };
  }

  function computeSummary(expensesList) {
    const list = expensesList || getAll();
    let total = 0;
    const byCategory = {};

    list.forEach(e => {
      const amt = Number(e.amount) || 0;
      total += amt;
      const cat = e.category || 'Other';
      byCategory[cat] = (byCategory[cat] || 0) + amt;
    });

    return {
      count: list.length,
      total: CP.util ? CP.util.round2(total) : total,
      totalAmount: CP.util ? CP.util.round2(total) : total,
      byCategory
    };
  }

  function exportCSV(expensesList, filename) {
    const list = expensesList || getAll();
    const cols = [
      { key: 'date', label: 'Date', render: e => (e.date || '').slice(0, 10) },
      { key: 'id', label: 'Expense ID' },
      { key: 'category', label: 'Category' },
      { key: 'payee', label: 'Payee / Vendor' },
      { key: 'description', label: 'Description' },
      { key: 'amount', label: 'Amount (₹)', render: e => (Number(e.amount) || 0).toFixed(2) },
      { key: 'mode', label: 'Payment Mode' },
      { key: 'txnRef', label: 'Txn Ref / UTR', render: e => e.txnRef || '' },
      { key: 'linkedOrder', label: 'Linked Order', render: e => e.linkedOrder || '' },
      { key: 'linkedPrinter', label: 'Linked Machine', render: e => e.linkedPrinter || '' },
      { key: 'receiptRef', label: 'Receipt Ref', render: e => e.receiptRef || '' },
      { key: 'notes', label: 'Notes', render: e => e.notes || '' }
    ];

    if (!CP.csv || typeof CP.csv.toCSV !== 'function') {
      throw new Error('CSV service is not available.');
    }
    const csvContent = CP.csv.toCSV(list, cols);
    const fname = filename || `carbonprints-expenses-${CP.util?.todayISO ? CP.util.todayISO() : new Date().toISOString().slice(0, 10)}.csv`;
    CP.csv.download(fname, csvContent);
    return csvContent;
  }

  function validateAndImportCSV(csvText, mode = 'merge') {
    if (!csvText || typeof csvText !== 'string' || !csvText.trim()) {
      return { ok: false, error: 'CSV file is empty or unreadable.', importedCount: 0 };
    }

    const lines = csvText.trim().split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length <= 1) {
      return { ok: false, error: 'CSV contains no data rows.', importedCount: 0 };
    }

    const headers = lines[0].split(',').map(h => h.replace(/^["']|["']$/g, '').trim().toLowerCase());
    const dateIdx = headers.findIndex(h => h.includes('date'));
    const payeeIdx = headers.findIndex(h => h.includes('payee') || h.includes('vendor'));
    const descIdx = headers.findIndex(h => h.includes('description') || h.includes('desc'));
    const amtIdx = headers.findIndex(h => h.includes('amount') || h.includes('cost'));
    const catIdx = headers.findIndex(h => h.includes('category'));
    const idIdx = headers.findIndex(h => h === 'id' || h.includes('expense id'));
    const modeIdx = headers.findIndex(h => h.includes('mode'));
    const refIdx = headers.findIndex(h => h.includes('ref') || h.includes('utr'));

    if (dateIdx < 0 || payeeIdx < 0 || descIdx < 0 || amtIdx < 0) {
      return {
        ok: false,
        error: 'CSV missing required column headers (Date, Payee, Description, Amount). Live data untouched.',
        importedCount: 0
      };
    }

    const parsedRecords = [];
    for (let i = 1; i < lines.length; i++) {
      // Basic CSV field parser handling quotes
      const rawCols = [];
      let inQuote = false, cur = '';
      for (const char of lines[i]) {
        if (char === '"') inQuote = !inQuote;
        else if (char === ',' && !inQuote) { rawCols.push(cur); cur = ''; }
        else cur += char;
      }
      rawCols.push(cur);
      const cols = rawCols.map(c => c.replace(/^["']|["']$/g, '').trim());

      const date = cols[dateIdx] || '';
      const payee = cols[payeeIdx] || '';
      const description = cols[descIdx] || '';
      const amount = Number(cols[amtIdx]);
      const category = (catIdx >= 0 ? cols[catIdx] : '') || 'Other';
      const id = idIdx >= 0 ? cols[idIdx] : '';
      const modeVal = (modeIdx >= 0 ? cols[modeIdx] : '') || 'UPI';
      const txnRef = (refIdx >= 0 ? cols[refIdx] : '') || '';

      // Validate row
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return { ok: false, error: `Row ${i + 1}: Invalid date "${date}". Expected YYYY-MM-DD. Live data untouched.`, importedCount: 0 };
      }
      if (!payee) {
        return { ok: false, error: `Row ${i + 1}: Payee name is empty. Live data untouched.`, importedCount: 0 };
      }
      if (!description) {
        return { ok: false, error: `Row ${i + 1}: Description is empty. Live data untouched.`, importedCount: 0 };
      }
      if (isNaN(amount) || amount <= 0) {
        return { ok: false, error: `Row ${i + 1}: Invalid amount "${cols[amtIdx]}". Live data untouched.`, importedCount: 0 };
      }

      parsedRecords.push({
        id: id || (CP.util?.nextId ? CP.util.nextId('expense', date) : `CP-EXP-${Date.now()}-${i}`),
        date, payee, description, amount, category, mode: modeVal, txnRef,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
      });
    }

    // Validation succeeded for ALL rows. Now write to storage safely.
    let finalExpenses = [];
    let addedCount = 0;
    let skippedCount = 0;
    if (mode === 'replace') {
      finalExpenses = parsedRecords;
      addedCount = parsedRecords.length;
    } else {
      const existing = getAll();
      const existingIds = new Set(existing.map(e => e && e.id).filter(Boolean));
      const toAdd = parsedRecords.filter(r => !existingIds.has(r.id));
      addedCount = toAdd.length;
      skippedCount = parsedRecords.length - addedCount;
      finalExpenses = existing.concat(toAdd);
    }

    try {
      if (CP.store) CP.store.set(STORAGE_KEY, finalExpenses);
    } catch (writeErr) {
      return { ok: false, success: false, error: writeErr.message || 'Storage write failed', importedCount: 0 };
    }

    return { ok: true, success: true, importedCount: addedCount, skippedCount };
  }

  return {
    DEFAULT_CATEGORIES,
    getCategories,
    validateExpense,
    getAll,
    getById,
    save,
    remove,
    filter,
    getMonthTotal,
    getCashMovement,
    computeSummary,
    exportCSV,
    validateAndImportCSV
  };
})();
