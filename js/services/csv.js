/**
 * CarbonPrints Company OS - CSV Import/Export Service
 * Global namespace: window.CP.csv
 * Formats CSV with UTF-8 BOM, CRLF line endings, and proper RFC 4180 quote escaping.
 */
window.CP = window.CP || {};

CP.csv = (function () {
  const UTF8_BOM = '\uFEFF';

  /**
   * Escapes a single value according to RFC 4180:
   * Wraps in double quotes and doubles inner quotes if it contains commas, quotes, or newlines.
   * @param {any} val
   * @returns {string}
   */
  function escapeField(val) {
    if (val === null || val === undefined) {
      return '';
    }
    const str = String(val);
    if (/[",\r\n]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }

  /**
   * Converts an array of row objects into a CSV string.
   * Prepends a UTF-8 BOM so Excel and Google Sheets correctly parse UTF-8 symbols (like ₹).
   * Uses CRLF (\r\n) line endings.
   *
   * @param {Array<Object>} rows - Array of data row objects
   * @param {Array<string|{ key: string, label?: string, render?: Function }>} [columns] - Column definitions
   * @returns {string} UTF-8 BOM prefixed CSV string with CRLF endings
   */
  function toCSV(rows = [], columns = null) {
    const list = Array.isArray(rows) ? rows : [];

    // Derive columns if not provided
    let colDefs = [];
    if (Array.isArray(columns) && columns.length > 0) {
      colDefs = columns.map(c => {
        if (typeof c === 'string') {
          return { key: c, label: c, render: null };
        }
        return {
          key: c.key || '',
          label: c.label !== undefined ? c.label : (c.key || ''),
          render: typeof c.render === 'function' ? c.render : null
        };
      });
    } else if (list.length > 0 && typeof list[0] === 'object' && list[0] !== null) {
      colDefs = Object.keys(list[0]).map(k => ({ key: k, label: k, render: null }));
    }

    if (colDefs.length === 0) {
      return UTF8_BOM;
    }

    // Build header row
    const headerLine = colDefs.map(c => escapeField(c.label)).join(',');

    // Build data rows
    const dataLines = list.map(row => {
      if (!row || typeof row !== 'object') return '';
      return colDefs.map(c => {
        let val;
        if (c.render) {
          try {
            val = c.render(row);
          } catch (e) {
            console.error(`[CP.csv] Error rendering column ${c.key}:`, e);
            val = '';
          }
        } else if (c.key) {
          val = row[c.key];
        } else {
          val = '';
        }
        return escapeField(val);
      }).join(',');
    });

    const lines = [headerLine, ...dataLines];
    return UTF8_BOM + lines.join('\r\n') + '\r\n';
  }

  /**
   * Robust RFC 4180 CSV parser.
   * Handles quoted fields, doubled quotes (""), and embedded linebreaks.
   *
   * @param {string} text - Raw CSV text
   * @returns {{ headers: string[], rows: Array<Object> }}
   */
  function parse(text = '') {
    if (!text || typeof text !== 'string') {
      return { headers: [], rows: [] };
    }

    // Strip BOM if present
    let raw = text;
    if (raw.charCodeAt(0) === 0xFEFF) {
      raw = raw.slice(1);
    }

    const grid = [];
    let currentRow = [];
    let currentCell = '';
    let insideQuotes = false;
    let i = 0;
    const len = raw.length;

    while (i < len) {
      const char = raw[i];
      const nextChar = raw[i + 1];

      if (char === '"') {
        if (insideQuotes && nextChar === '"') {
          // Escaped quote
          currentCell += '"';
          i += 2;
          continue;
        }
        insideQuotes = !insideQuotes;
        i++;
        continue;
      }

      if (char === ',' && !insideQuotes) {
        currentRow.push(currentCell);
        currentCell = '';
        i++;
        continue;
      }

      if ((char === '\r' || char === '\n') && !insideQuotes) {
        currentRow.push(currentCell);
        currentCell = '';
        if (char === '\r' && nextChar === '\n') {
          i++; // Skip LF in CRLF
        }
        if (currentRow.length > 1 || currentRow[0] !== '') {
          grid.push(currentRow);
        }
        currentRow = [];
        i++;
        continue;
      }

      currentCell += char;
      i++;
    }

    if (currentCell.length > 0 || currentRow.length > 0) {
      currentRow.push(currentCell);
      grid.push(currentRow);
    }

    if (grid.length === 0) {
      return { headers: [], rows: [] };
    }

    const headers = grid[0].map(h => (h !== undefined ? h.trim() : ''));
    const rows = [];
    for (let r = 1; r < grid.length; r++) {
      const rowArr = grid[r];
      const rowObj = {};
      for (let c = 0; c < headers.length; c++) {
        rowObj[headers[c]] = rowArr[c] !== undefined ? rowArr[c] : '';
      }
      rows.push(rowObj);
    }

    return { headers, rows };
  }

  /**
   * Helper to trigger a browser file download using a Blob.
   * @param {string} filename - Target filename (e.g. carbonprints-orders.csv)
   * @param {string} content - String content (CSV or JSON)
   * @param {string} [mimeType='text/csv;charset=utf-8;'] - Blob MIME type
   */
  function download(filename, content, mimeType = 'text/csv;charset=utf-8;') {
    if (typeof window === 'undefined' || !window.Blob) return;

    try {
      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => {
        try {
          URL.revokeObjectURL(url);
        } catch (e) {
          // ignore cleanup errors
        }
      }, 1000);
    } catch (err) {
      console.error('[CP.csv] Download error:', err);
      if (CP.ui && typeof CP.ui.toast === 'function') {
        CP.ui.toast('Failed to trigger download. Please check browser permissions.', 'danger');
      }
    }
  }

  return {
    toCSV,
    parse,
    download,
    escapeField
  };
})();
