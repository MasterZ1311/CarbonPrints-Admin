/**
 * CarbonPrints Company OS - Core Utilities
 * Global namespace: window.CP.util
 */
window.CP = window.CP || {};

CP.util = {
  /**
   * Escapes HTML entities to prevent XSS.
   * Every piece of user text inserted into HTML must pass through this.
   * @param {any} str - Input text
   * @returns {string} Escaped text
   */
  esc(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  },

  /**
   * Generates a random unique ID with an optional prefix.
   * @param {string} prefix - Optional prefix (e.g., 'part', 'spool')
   * @returns {string}
   */
  uid(prefix = 'id') {
    const rnd = Math.random().toString(36).substring(2, 8);
    const ts = Date.now().toString(36);
    return `${prefix}_${ts}_${rnd}`;
  },

  /**
   * Zero-pads a number to the given length.
   * @param {number|string} n - Number to pad
   * @param {number} len - Required total length
   * @returns {string}
   */
  pad(n, len = 2) {
    return String(n).padStart(len, '0');
  },

  /**
   * Rounds a number to exactly two decimal places.
   * @param {number|string} n - Input number
   * @returns {number}
   */
  round2(n) {
    const num = Number(n);
    if (isNaN(num)) return 0;
    return Math.round((num + Number.EPSILON) * 100) / 100;
  },

  /**
   * Formats a number in Indian currency (INR) with Indian digit grouping
   * and the Indian Rupee symbol (₹).
   * @param {number|string} n - Amount in rupees
   * @returns {string} e.g. "₹1,23,456.00"
   */
  fmtINR(n) {
    const val = Number(n) || 0;
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(CP.util.round2(val));
  },

  /**
   * Formats a raw number using Indian digit grouping without currency symbol.
   * @param {number|string} n - Input number
   * @returns {string} e.g. "1,23,456"
   */
  fmtNum(n) {
    const val = Number(n) || 0;
    return new Intl.NumberFormat('en-IN').format(val);
  },

  /**
   * Formats an ISO string or Date into "20 Sep 2026" (IST timezone).
   * @param {string|Date} iso - Date to format
   * @returns {string} e.g. "20 Sep 2026"
   */
  fmtDate(iso) {
    if (!iso) return '';
    const d = iso instanceof Date ? iso : new Date(iso);
    if (isNaN(d.getTime())) return '';

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    // IST offset: UTC + 5:30
    const istOffset = 5.5 * 60 * 60 * 1000;
    const ist = new Date(d.getTime() + (d.getTimezoneOffset() * 60 * 1000) + istOffset);

    const day = String(ist.getDate()).padStart(2, '0');
    const month = months[ist.getMonth()];
    const year = ist.getFullYear();
    return `${day} ${month} ${year}`;
  },

  /**
   * Formats an ISO string or Date into "20 Sep 2026, 03:30 PM" (IST timezone).
   * @param {string|Date} iso - Date to format
   * @returns {string}
   */
  fmtDateTime(iso) {
    if (!iso) return '';
    const d = iso instanceof Date ? iso : new Date(iso);
    if (isNaN(d.getTime())) return '';

    const dateStr = CP.util.fmtDate(d);
    const istOffset = 5.5 * 60 * 60 * 1000;
    const ist = new Date(d.getTime() + (d.getTimezoneOffset() * 60 * 1000) + istOffset);

    let hours = ist.getHours();
    const minutes = String(ist.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12; // 0 hour is 12 AM
    const hourStr = String(hours).padStart(2, '0');

    return `${dateStr}, ${hourStr}:${minutes} ${ampm}`;
  },

  /**
   * Returns today's date in IST formatted as "YYYY-MM-DD".
   * @returns {string}
   */
  todayISO() {
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const ist = new Date(now.getTime() + (now.getTimezoneOffset() * 60 * 1000) + istOffset);
    const y = ist.getFullYear();
    const m = String(ist.getMonth() + 1).padStart(2, '0');
    const d = String(ist.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  },

  /**
   * Adds N days to a YYYY-MM-DD or ISO date string and returns YYYY-MM-DD.
   * @param {string} iso - Base date
   * @param {number} n - Number of days to add
   * @returns {string}
   */
  addDays(iso, n) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    d.setDate(d.getDate() + Number(n));
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  },

  /**
   * Returns Indian financial year label like "26-27" (April 1 to March 31).
   * E.g.: "2026-03-31" -> "25-26", "2026-04-01" -> "26-27"
   * @param {Date|string} dateInput - Date to evaluate
   * @returns {string}
   */
  fyLabel(dateInput) {
    const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
    if (isNaN(d.getTime())) return '';

    const istOffset = 5.5 * 60 * 60 * 1000;
    const ist = new Date(d.getTime() + (d.getTimezoneOffset() * 60 * 1000) + istOffset);

    const year = ist.getFullYear();
    const month = ist.getMonth(); // 0-indexed: 2 is March, 3 is April

    if (month >= 3) {
      // April to December: current year to next year
      const start = String(year).slice(-2);
      const end = String(year + 1).slice(-2);
      return `${start}-${end}`;
    } else {
      // January to March: previous year to current year
      const start = String(year - 1).slice(-2);
      const end = String(year).slice(-2);
      return `${start}-${end}`;
    }
  },

  /**
   * Triggers a browser download of a text string as a file.
   * @param {string} filename - Target filename
   * @param {string} text - Content of the file
   * @param {string} mime - MIME type
   */
  download(filename, text, mime = 'text/plain') {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  /**
   * Creates a debounced version of a function.
   * @param {Function} fn - Function to debounce
   * @param {number} ms - Milliseconds delay
   * @returns {Function}
   */
  debounce(fn, ms = 250) {
    let timer = null;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), ms);
    };
  },

  /**
   * Clamps a number between min and max.
   * @param {number} n - Input value
   * @param {number} min - Minimum value
   * @param {number} max - Maximum value
   * @returns {number}
   */
  clamp(n, min, max) {
    const num = Number(n) || 0;
    return Math.min(Math.max(num, min), max);
  },

  /**
   * Increments the appropriate cp_counters and returns the formatted ID.
   * - order -> "CP-2026-0001" (calendar-year counter)
   * - invoice -> "CP/26-27/0001" (financial-year counter)
   * - challan -> "DC/26-27/0001" (financial-year counter)
   * @param {"order"|"invoice"|"challan"|string} kind - Kind of ID
   * @returns {string}
   */
  nextId(kind) {
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const ist = new Date(now.getTime() + (now.getTimezoneOffset() * 60 * 1000) + istOffset);
    const year = ist.getFullYear();
    const fy = CP.util.fyLabel(ist);

    let counterKey = '';
    let prefix = '';

    if (kind === 'order') {
      counterKey = `order:${year}`;
      prefix = `CP-${year}-`;
    } else if (kind === 'invoice') {
      counterKey = `invoice:${fy}`;
      prefix = `CP/${fy}/`;
    } else if (kind === 'challan') {
      counterKey = `challan:${fy}`;
      prefix = `DC/${fy}/`;
    } else {
      counterKey = `${kind}:${year}`;
      prefix = `${kind.toUpperCase()}-${year}-`;
    }

    const counters = (CP.store && typeof CP.store.get === 'function')
      ? CP.store.get('cp_counters', {})
      : {};

    const currentVal = Number(counters[counterKey]) || 0;
    const nextVal = currentVal + 1;
    counters[counterKey] = nextVal;

    if (CP.store && typeof CP.store.set === 'function') {
      CP.store.set('cp_counters', counters);
    }

    return `${prefix}${CP.util.pad(nextVal, 4)}`;
  }
};
