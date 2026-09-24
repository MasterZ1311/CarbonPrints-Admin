/**
 * CarbonPrints Company OS - Application Bootstrap
 * Global namespace: window.CP
 * Initializes persistence, routes, backup reminders, offline service worker, and connectivity telemetry.
 */
window.CP = window.CP || {};
CP.version = "0.1.0";

/**
 * Checks if a database backup reminder banner should be shown.
 * If cp_meta.lastBackupAt is null or older than 7 days, renders warning banner #backup-reminder.
 */
CP.checkBackupReminder = function () {
  if (!CP.store || typeof CP.store.get !== 'function') return;
  const meta = CP.store.get('cp_meta', null);
  const lastBackupAt = meta && meta.lastBackupAt ? meta.lastBackupAt : null;
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  const isOverdue = !lastBackupAt || (Date.now() - new Date(lastBackupAt).getTime() > sevenDaysMs);

  if (isOverdue) {
    const formattedLast = lastBackupAt
      ? (CP.util && typeof CP.util.formatDate === 'function' ? CP.util.formatDate(lastBackupAt) : lastBackupAt.slice(0, 10))
      : 'Never';
    const msg = !lastBackupAt
      ? 'No database backup created yet. CarbonPrints runs offline in this browser—create regular backups to prevent data loss.'
      : `Last database backup was ${formattedLast} (over 7 days ago). Download a fresh backup for off-site safety.`;

    if (CP.ui && typeof CP.ui.setAlerts === 'function') {
      CP.ui.setAlerts({
        id: 'backup-reminder',
        kind: 'warning',
        html: `
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;">
            <span>⚠️ <strong>Backup Reminder:</strong> ${CP.util ? CP.util.esc(msg) : msg}</span>
            <a href="#/data" class="btn btn-sm btn-primary" style="text-decoration: none; white-space: nowrap;">Backup Now 💾</a>
          </div>
        `
      });
    }
  } else {
    if (CP.ui && typeof CP.ui.removeAlert === 'function') {
      CP.ui.removeAlert('backup-reminder');
    }
  }
};

/**
 * Monitors online/offline network connectivity and updates the sidebar indicator.
 */
CP.initNetworkStatus = function () {
  function update() {
    const el = document.getElementById('connection-status');
    if (!el) return;
    const isOnline = (typeof navigator !== 'undefined' && 'onLine' in navigator) ? navigator.onLine : true;
    const textEl = el.querySelector('.status-text');

    if (isOnline) {
      el.classList.remove('offline');
      if (textEl) textEl.textContent = 'Online';
      el.setAttribute('title', 'Online - Local storage and offline cache active');
    } else {
      el.classList.add('offline');
      if (textEl) textEl.textContent = 'Offline';
      el.setAttribute('title', 'Offline - Working entirely from local cache');
    }
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
  }
  update();
};

/**
 * Registers the service worker when served over http: or https:.
 * Silently ignores file:// or unsupported environments.
 * Shows an update alert banner when an updated worker is waiting.
 */
CP.initServiceWorker = function () {
  if (typeof window === 'undefined' || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return;
  }

  // Strict protocol check: only register when served via HTTP or HTTPS (ignore file:// silently)
  const protocol = window.location && window.location.protocol;
  if (protocol !== 'http:' && protocol !== 'https:') {
    return;
  }

  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!refreshing) {
      refreshing = true;
      window.location.reload();
    }
  });

  function showUpdatePrompt(worker) {
    if (CP.ui && typeof CP.ui.setAlerts === 'function') {
      CP.ui.setAlerts({
        id: 'sw-update-available',
        kind: 'info',
        html: `
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;">
            <span>🚀 <strong>New version available:</strong> An updated version of CarbonPrints Company OS is ready.</span>
            <button class="btn btn-sm btn-primary" id="btn-sw-reload" style="white-space: nowrap;">Reload Now 🔄</button>
          </div>
        `
      });

      setTimeout(() => {
        const btn = document.getElementById('btn-sw-reload');
        if (btn) {
          btn.addEventListener('click', () => {
            btn.disabled = true;
            btn.textContent = 'Reloading...';
            if (worker) {
              worker.postMessage({ type: 'SKIP_WAITING' });
            }
            setTimeout(() => window.location.reload(), 300);
          });
        }
      }, 50);
    } else if (CP.ui && typeof CP.ui.toast === 'function') {
      CP.ui.toast('New version available. Please reload.', 'info', 10000);
    }
  }

  navigator.serviceWorker.register('./service-worker.js')
    .then(registration => {
      // Check if a worker is already waiting
      if (registration.waiting) {
        showUpdatePrompt(registration.waiting);
        return;
      }

      // Detect future workers arriving in waiting state
      registration.addEventListener('updatefound', () => {
        const installingWorker = registration.installing;
        if (!installingWorker) return;

        installingWorker.addEventListener('statechange', () => {
          if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
            showUpdatePrompt(installingWorker);
          }
        });
      });
    })
    .catch(err => {
      // Catch silently on local dev or unsupported environments
      console.warn('[ServiceWorker] Registration ignored or failed:', err);
    });
};

document.addEventListener('DOMContentLoaded', () => {
  // 1. Initialize offline store (seeds defaults on first launch, deep-merges schema)
  if (CP.store && typeof CP.store.init === 'function') {
    CP.store.init();
  }

  // 2. Initialize inventory service (subscribes to job events & updates global low-stock alerts)
  if (CP.inventory && typeof CP.inventory.init === 'function') {
    CP.inventory.init();
  }

  // 3. Initialize scrap service (subscribes to job:failed events and deduplicates scrap records)
  if (CP.scrap && typeof CP.scrap.init === 'function') {
    CP.scrap.init();
  }

  // 4. Initialize maintenance service (subscribes to job events & updates nozzle wear and overdue alerts)
  if (CP.maint && typeof CP.maint.init === 'function') {
    CP.maint.init();
  }

  // 5. Initialize backup reminder check & reactive bus subscriptions
  CP.checkBackupReminder();
  if (CP.bus && typeof CP.bus.on === 'function') {
    CP.bus.on('backup:completed', () => {
      if (CP.ui && typeof CP.ui.removeAlert === 'function') {
        CP.ui.removeAlert('backup-reminder');
      }
    });
    CP.bus.on('store:cp_meta', () => {
      CP.checkBackupReminder();
    });
  }

  // 6. Initialize connection status listener (online/offline)
  CP.initNetworkStatus();

  // 7. Initialize PWA Service Worker (only on http/https, silent on file://)
  CP.initServiceWorker();

  // 8. Initialize hash routing and mount current view
  if (CP.router && typeof CP.router.init === 'function') {
    CP.router.init();
  }

  console.log(
    `%c CarbonPrints Company OS v${CP.version} Initialized %c [Offline-First / Chennai, IN] `,
    'background: #0f766e; color: #ffffff; font-weight: bold; padding: 4px 8px; border-radius: 4px 0 0 4px;',
    'background: #f1f5f9; color: #0f172a; padding: 4px 8px; border-radius: 0 4px 4px 0;'
  );
});
