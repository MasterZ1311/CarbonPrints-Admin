/**
 * CarbonPrints Company OS - UI Helpers & Component Utilities
 * Global namespace: window.CP.ui
 */
window.CP = window.CP || {};

CP.ui = (function () {
  /**
   * Displays a toast notification.
   * @param {string} msg - Message text
   * @param {"info"|"success"|"warning"|"danger"} type - Toast style
   * @param {number} durationMs - Auto-dismiss duration in ms
   */
  function toast(msg, type = 'info', durationMs = 3500) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.setAttribute('role', 'status');

    const msgSpan = document.createElement('span');
    msgSpan.textContent = msg;

    const closeBtn = document.createElement('button');
    closeBtn.className = 'toast-close';
    closeBtn.innerHTML = '&times;';
    closeBtn.setAttribute('aria-label', 'Close toast');

    el.appendChild(msgSpan);
    el.appendChild(closeBtn);
    container.appendChild(el);

    let timeoutId = null;
    let remaining = durationMs;
    let startTime = Date.now();

    function startTimer() {
      timeoutId = setTimeout(() => {
        dismiss();
      }, remaining);
    }

    function pauseTimer() {
      clearTimeout(timeoutId);
      remaining -= (Date.now() - startTime);
    }

    function dismiss() {
      clearTimeout(timeoutId);
      if (el.parentNode) {
        el.parentNode.removeChild(el);
      }
    }

    closeBtn.addEventListener('click', dismiss);
    el.addEventListener('mouseenter', pauseTimer);
    el.addEventListener('mouseleave', () => {
      startTime = Date.now();
      startTimer();
    });

    startTimer();
  }

  /**
   * Opens an accessible modal dialog.
   * @param {Object} options
   * @param {string} options.title - Modal title
   * @param {string} [options.bodyHTML] - Modal body HTML
   * @param {HTMLElement} [options.bodyNode] - Modal body DOM node
   * @param {Array<{ label: string, kind?: string, onClick: Function }>} [options.buttons]
   * @returns {{ close: Function }}
   */
  function modal({ title, bodyHTML, bodyNode, buttons = [] }) {
    const container = document.getElementById('modal-container');
    if (!container) return { close: () => {} };

    container.innerHTML = '';
    container.setAttribute('aria-hidden', 'false');

    const dialog = document.createElement('div');
    dialog.className = 'modal-dialog';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');

    // Header
    const header = document.createElement('div');
    header.className = 'modal-header';

    const h3 = document.createElement('h3');
    h3.className = 'modal-title';
    h3.textContent = title || '';

    const closeBtn = document.createElement('button');
    closeBtn.className = 'modal-close';
    closeBtn.innerHTML = '&times;';
    closeBtn.setAttribute('aria-label', 'Close modal');

    header.appendChild(h3);
    header.appendChild(closeBtn);
    dialog.appendChild(header);

    // Body
    const body = document.createElement('div');
    body.className = 'modal-body';
    if (bodyNode) {
      body.appendChild(bodyNode);
    } else if (bodyHTML) {
      body.innerHTML = bodyHTML;
    }
    dialog.appendChild(body);

    // Footer
    const footer = document.createElement('div');
    footer.className = 'modal-footer';

    let isClosed = false;
    function close() {
      if (isClosed) return;
      isClosed = true;
      document.removeEventListener('keydown', onKeyDown);
      container.removeEventListener('click', onBackdropClick);
      container.innerHTML = '';
      container.setAttribute('aria-hidden', 'true');
    }

    function onKeyDown(e) {
      if (e.key === 'Escape') {
        close();
      }
    }

    function onBackdropClick(e) {
      if (e.target === container) {
        close();
      }
    }

    closeBtn.addEventListener('click', close);
    document.addEventListener('keydown', onKeyDown);
    container.addEventListener('click', onBackdropClick);

    if (buttons && buttons.length > 0) {
      buttons.forEach(btnConfig => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `btn ${btnConfig.kind || 'btn-secondary'}`;
        btn.textContent = btnConfig.label;
        btn.addEventListener('click', () => {
          if (typeof btnConfig.onClick === 'function') {
            const result = btnConfig.onClick(close);
            if (result !== false) {
              close();
            }
          } else {
            close();
          }
        });
        footer.appendChild(btn);
      });
      dialog.appendChild(footer);
    }

    container.appendChild(dialog);

    // Focus first actionable element
    setTimeout(() => {
      const focusable = dialog.querySelector('input, button.btn-primary, button:not(.modal-close)');
      if (focusable) focusable.focus();
    }, 50);

    return { close };
  }

  /**
   * Prompts the user with a confirm modal.
   * @param {string} message - Message text
   * @returns {Promise<boolean>}
   */
  function confirm(message) {
    return new Promise(resolve => {
      modal({
        title: 'Confirm Action',
        bodyHTML: `<p style="margin: 8px 0;">${CP.util.esc(message)}</p>`,
        buttons: [
          {
            label: 'Cancel',
            kind: 'btn-secondary',
            onClick: () => resolve(false)
          },
          {
            label: 'Confirm',
            kind: 'btn-danger',
            onClick: () => resolve(true)
          }
        ]
      });
    });
  }

  /**
   * Prompts the user with a single text input modal.
   * @param {string} message - Prompt label
   * @param {string} defaultValue - Initial input value
   * @returns {Promise<string|null>}
   */
  function prompt(message, defaultValue = '') {
    return new Promise(resolve => {
      const wrapper = document.createElement('div');
      wrapper.className = 'field';

      const label = document.createElement('label');
      label.textContent = message;

      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'input';
      input.value = defaultValue;

      wrapper.appendChild(label);
      wrapper.appendChild(input);

      modal({
        title: 'Input Required',
        bodyNode: wrapper,
        buttons: [
          {
            label: 'Cancel',
            kind: 'btn-secondary',
            onClick: () => resolve(null)
          },
          {
            label: 'OK',
            kind: 'btn-primary',
            onClick: () => resolve(input.value.trim())
          }
        ]
      });
    });
  }

  /**
   * Generates badge HTML string.
   * @param {string} text - Badge label
   * @param {string} kind - Badge type/kind
   * @returns {string}
   */
  function badge(text, kind = 'default') {
    return `<span class="badge badge-${CP.util.esc(kind)}">${CP.util.esc(text)}</span>`;
  }

  /**
   * Returns empty state HTML string.
   * @param {string} icon - Emoji or icon
   * @param {string} title - Title text
   * @param {string} text - Description text
   * @returns {string}
   */
  function emptyState(icon, title, text) {
    return `
      <div class="empty-state">
        <div class="empty-state-icon" aria-hidden="true">${icon}</div>
        <h3 class="empty-state-title">${CP.util.esc(title)}</h3>
        <p class="empty-state-text">${CP.util.esc(text)}</p>
      </div>
    `;
  }

  /**
   * Renders global alert banners into #global-alerts.
   * @param {Array<{ id: string, kind: "info"|"warning"|"danger"|"success", html: string }>} alerts
   */
  function setAlerts(alerts = []) {
    const container = document.getElementById('global-alerts');
    if (!container) return;
    if (!alerts || alerts.length === 0) {
      container.innerHTML = '';
      return;
    }

    container.innerHTML = alerts.map(a => `
      <div class="banner banner-${CP.util.esc(a.kind || 'info')}" data-alert-id="${CP.util.esc(a.id)}">
        <div style="flex: 1;">${a.html}</div>
      </div>
    `).join('');
  }

  /**
   * Helper that builds an escaped HTML table string.
   * @param {Array<{ key: string, label: string, render?: Function }>} columns
   * @param {Array<Object>} rows
   * @returns {string}
   */
  function table(columns = [], rows = []) {
    const headerCols = columns.map(c => `<th>${CP.util.esc(c.label || c.key)}</th>`).join('');

    let bodyRows = '';
    if (!rows || rows.length === 0) {
      bodyRows = `
        <tr>
          <td colspan="${columns.length}" style="text-align: center; color: var(--text-muted); padding: 32px 16px;">
            No records found.
          </td>
        </tr>
      `;
    } else {
      bodyRows = rows.map(r => {
        const cells = columns.map(c => {
          if (typeof c.render === 'function') {
            return `<td>${c.render(r)}</td>`;
          }
          return `<td>${CP.util.esc(r[c.key] !== undefined ? r[c.key] : '')}</td>`;
        }).join('');
        return `<tr>${cells}</tr>`;
      }).join('');
    }

    return `
      <div class="table-wrapper">
        <table class="table">
          <thead>
            <tr>${headerCols}</tr>
          </thead>
          <tbody>
            ${bodyRows}
          </tbody>
        </table>
      </div>
    `;
  }

  return {
    toast,
    modal,
    confirm,
    prompt,
    badge,
    emptyState,
    setAlerts,
    table
  };
})();
