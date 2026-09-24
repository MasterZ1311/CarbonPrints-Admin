/**
 * CarbonPrints Company OS - OctoPrint Integration Service
 * Global namespace: window.CP
 * Provides read-only telemetry, connection diagnostics, and status polling.
 * Never sends G-code or machine control commands.
 */
window.CP = window.CP || {};

CP.octo = (function () {
  const TIMEOUT_MS = 5000;
  const POLL_INTERVAL_MS = 15000;
  const MAX_CONSECUTIVE_FAILURES = 3;

  const failureCounts = {};
  const statusCache = {};
  let pollTimer = null;
  let updateCallback = null;

  function cleanUrl(rawUrl) {
    if (!rawUrl || typeof rawUrl !== 'string') return '';
    let url = rawUrl.trim();
    if (!url) return '';
    url = url.replace(/\/+$/, '');
    if (!/^https?:\/\//i.test(url)) {
      url = 'http://' + url;
    }
    return url;
  }

  function checkMixedContent(url) {
    if (typeof window !== 'undefined' && window.location && window.location.protocol === 'https:') {
      if (url.startsWith('http:')) {
        return 'Mixed Content: HTTPS blocks HTTP requests. Run app locally via http:// or file://';
      }
    }
    return null;
  }

  function formatTimeLeft(seconds) {
    if (seconds == null || isNaN(seconds) || seconds < 0) return null;
    const s = Math.round(seconds);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    if (h > 0) return `${h}h ${m}m left`;
    if (m > 0) return `${m}m left`;
    return `${s}s left`;
  }

  async function fetchStatus(printer) {
    const cfg = (printer && printer.octoprint) ? printer.octoprint : (printer || {});
    const url = cleanUrl(cfg.url);
    const apiKey = (cfg.apiKey || '').trim();

    if (!url) {
      return { online: false, configured: false, error: 'OctoPrint URL not configured' };
    }

    const mixedErr = checkMixedContent(url);
    if (mixedErr) {
      return { online: false, configured: true, error: mixedErr };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const headers = { 'X-Api-Key': apiKey };
      const opts = { method: 'GET', headers, signal: controller.signal };

      const [printerRes, jobRes] = await Promise.all([
        fetch(`${url}/api/printer`, opts).catch(err => ({ error: err })),
        fetch(`${url}/api/job`, opts).catch(err => ({ error: err }))
      ]);

      clearTimeout(timer);

      if (printerRes.error || jobRes.error) {
        const err = printerRes.error || jobRes.error;
        if (err.name === 'AbortError') {
          return { online: false, configured: true, error: 'Connection timed out (5s). OctoPrint server unreachable.' };
        }
        return { online: false, configured: true, error: 'Unreachable (Network or CORS error. Check OctoPrint CORS setting).' };
      }

      if (printerRes.status === 401 || printerRes.status === 403 || jobRes.status === 401 || jobRes.status === 403) {
        const code = (printerRes.status === 401 || printerRes.status === 403) ? printerRes.status : jobRes.status;
        return { online: false, configured: true, error: `Invalid or unauthorized API key (HTTP ${code}).` };
      }

      if (printerRes.status === 404 && jobRes.status === 404) {
        return { online: false, configured: true, error: 'OctoPrint endpoints not found (HTTP 404). Check base URL.' };
      }

      let printerData = null;
      let jobData = null;

      if (printerRes.ok) {
        try { printerData = await printerRes.json(); } catch (e) {}
      }
      if (jobRes.ok) {
        try { jobData = await jobRes.json(); } catch (e) {}
      }

      if (!printerData && !jobData) {
        if (printerRes.status === 409) {
          return {
            online: true, configured: true, state: 'Firmware Disconnected (409)',
            bedTemp: null, toolTemp: null, progressPct: null, timeLeftSec: null,
            fileName: null, isFinished: false
          };
        }
        return { online: false, configured: true, error: `OctoPrint error (HTTP ${printerRes.status || jobRes.status})` };
      }

      const bedActual = printerData?.temperature?.bed?.actual;
      const toolActual = printerData?.temperature?.tool0?.actual;
      const bedTemp = typeof bedActual === 'number' ? Math.round(bedActual * 10) / 10 : null;
      const toolTemp = typeof toolActual === 'number' ? Math.round(toolActual * 10) / 10 : null;

      const pState = printerData?.state?.text || '';
      const jState = jobData?.state || '';
      const state = (printerRes.status === 409) ? 'Firmware Disconnected (409)' : (jState || pState || 'Operational');

      const completion = jobData?.progress?.completion;
      const progressPct = typeof completion === 'number' ? Math.round(completion * 10) / 10 : null;
      const timeLeft = jobData?.progress?.printTimeLeft;
      const timeLeftSec = typeof timeLeft === 'number' ? Math.round(timeLeft) : null;
      const fileName = jobData?.job?.file?.name || null;

      const isFinished = (progressPct != null && progressPct >= 100) ||
                         (state === 'Operational' && jobData?.progress?.printTime > 0) ||
                         state === 'Finishing';

      const result = {
        online: true,
        configured: true,
        state,
        bedTemp,
        toolTemp,
        progressPct,
        timeLeftSec,
        timeLeftFormatted: formatTimeLeft(timeLeftSec),
        fileName,
        isFinished
      };

      if (printer && printer.id != null) {
        statusCache[printer.id] = result;
      }
      return result;
    } catch (err) {
      clearTimeout(timer);
      if (err.name === 'AbortError') {
        return { online: false, configured: true, error: 'Connection timed out (5s). OctoPrint server unreachable.' };
      }
      return { online: false, configured: true, error: err.message || 'Connection failed' };
    }
  }

  async function pollPrinters() {
    if (!CP.store) return;
    const printers = CP.store.get('cp_printers', []);
    const configured = printers.filter(p => p.octoprint && p.octoprint.url && p.octoprint.url.trim());

    if (configured.length === 0) return;

    for (const p of configured) {
      const fails = failureCounts[p.id] || 0;
      if (fails >= MAX_CONSECUTIVE_FAILURES) continue;

      const status = await fetchStatus(p);
      statusCache[p.id] = status;

      if (status.online) {
        failureCounts[p.id] = 0;
      } else {
        failureCounts[p.id] = fails + 1;
      }

      if (typeof updateCallback === 'function') {
        updateCallback(p.id, status, failureCounts[p.id]);
      }
    }
  }

  function startPolling(cb) {
    updateCallback = cb;
    if (pollTimer) clearInterval(pollTimer);
    pollPrinters();
    pollTimer = setInterval(pollPrinters, POLL_INTERVAL_MS);
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    updateCallback = null;
  }

  function retry(printerId, cb) {
    failureCounts[printerId] = 0;
    if (!CP.store) return;
    const printers = CP.store.get('cp_printers', []);
    const printer = printers.find(p => p.id === printerId);
    if (printer && printer.octoprint && printer.octoprint.url) {
      fetchStatus(printer).then(status => {
        statusCache[printerId] = status;
        if (status.online) {
          failureCounts[printerId] = 0;
        } else {
          failureCounts[printerId] = 1;
        }
        const handler = cb || updateCallback;
        if (typeof handler === 'function') {
          handler(printerId, status, failureCounts[printerId]);
        }
      });
    }
  }

  function getStatus(printerId) {
    return statusCache[printerId] || null;
  }

  function getFailureCount(printerId) {
    return failureCounts[printerId] || 0;
  }

  function testConnection(cfg) {
    return fetchStatus({ octoprint: cfg });
  }

  function renderCardChip(printer) {
    if (!printer.octoprint || !printer.octoprint.url || !printer.octoprint.url.trim()) return '';
    const status = statusCache[printer.id];
    const fails = failureCounts[printer.id] || 0;

    if (!status) {
      return `<span class="badge badge-octo badge-octo-connecting" title="Checking OctoPrint...">● OctoPrint</span>`;
    }
    if (status.online) {
      const stateTitle = CP.util ? CP.util.esc(status.state) : status.state;
      return `<span class="badge badge-octo badge-octo-online" title="${stateTitle}">● OctoPrint</span>`;
    }
    if (fails >= MAX_CONSECUTIVE_FAILURES) {
      const errTitle = CP.util ? CP.util.esc(status.error) : 'Unreachable';
      return `<span class="badge badge-octo badge-octo-offline" title="${errTitle}">● OctoPrint Unreachable</span> <button type="button" class="btn-octo-retry" data-printer-id="${printer.id}" title="Retry connection">Retry</button>`;
    }
    const errTitle = CP.util ? CP.util.esc(status.error) : 'Connecting';
    return `<span class="badge badge-octo badge-octo-offline" title="${errTitle}">● OctoPrint</span>`;
  }

  function renderCardStrip(printer) {
    if (!printer.octoprint || !printer.octoprint.url || !printer.octoprint.url.trim()) return '';
    const status = statusCache[printer.id];
    const fails = failureCounts[printer.id] || 0;

    if (!status) {
      return `<div class="octo-live-strip"><div class="octo-strip-msg">Connecting to OctoPrint...</div></div>`;
    }
    if (status.online) {
      const bed = status.bedTemp != null ? `${status.bedTemp}°C` : '--';
      const tool = status.toolTemp != null ? `${status.toolTemp}°C` : '--';
      const pct = status.progressPct != null ? `${status.progressPct}%` : null;
      const timeLeft = status.timeLeftFormatted;
      const stateText = CP.util ? CP.util.esc(status.state) : status.state;

      return `
        <div class="octo-live-strip">
          <div class="octo-telemetry-row">
            <span class="octo-temps">🛏️ ${bed} &bull; 🎯 ${tool}</span>
            <span class="octo-state-text">${stateText}</span>
          </div>
          ${pct !== null ? `
            <div class="octo-progress-row">
              <span>OctoPrint: <strong>${pct}</strong></span>
              ${timeLeft ? `<span>${timeLeft}</span>` : ''}
            </div>
            <div class="octo-progress-track">
              <div class="octo-progress-bar" style="width:${Math.min(100, Math.max(0, status.progressPct))}%;"></div>
            </div>
          ` : ''}
        </div>
      `;
    }

    if (fails >= MAX_CONSECUTIVE_FAILURES) {
      return `
        <div class="octo-live-strip is-unreachable">
          <div class="octo-strip-msg">OctoPrint unreachable &bull; <button type="button" class="btn-octo-retry-link" data-printer-id="${printer.id}">Retry</button></div>
        </div>
      `;
    }

    const errMsg = CP.util ? CP.util.esc(status.error || 'Connection failed') : 'Connection failed';
    return `
      <div class="octo-live-strip is-error">
        <div class="octo-strip-msg">${errMsg}</div>
      </div>
    `;
  }

  function renderSuggestion(printer) {
    if (!printer.octoprint || !printer.octoprint.url || !printer.octoprint.url.trim()) return '';
    if (printer.status !== 'printing') return '';

    const status = statusCache[printer.id];
    if (status && status.online && status.isFinished) {
      return `
        <div class="octo-suggest-wrap">
          <button type="button" class="btn-octo-suggest-complete" data-printer-id="${printer.id}" title="OctoPrint reports job finished">
            🎉 Looks finished - Mark completed?
          </button>
        </div>
      `;
    }
    return '';
  }

  return {
    fetchStatus,
    startPolling,
    stopPolling,
    retry,
    getStatus,
    getFailureCount,
    testConnection,
    renderCardChip,
    renderCardStrip,
    renderSuggestion,
    cleanUrl,
    formatTimeLeft
  };
})();
