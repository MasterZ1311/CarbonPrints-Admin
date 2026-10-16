/**
 * CarbonPrints Company OS - Persistence Store
 * Global namespace: window.CP.store
 * Wraps localStorage with reactive subscriptions, quota error handling, migrations,
 * corrupted JSON recovery with toast warning, and in-memory sandboxing (useMemory).
 */
window.CP = window.CP || {};

CP.store = (function () {
  const subscribers = new Map();
  let isMemoryMode = false;
  const memStore = new Map();

  /**
   * Helper to perform a deep merge of nested objects.
   * Ensures default schema keys are populated into existing records.
   */
  function deepMerge(target, source) {
    if (typeof target !== 'object' || target === null) return source;
    if (typeof source !== 'object' || source === null) return target;
    if (Array.isArray(target) || Array.isArray(source)) {
      return source !== undefined ? source : target;
    }

    const output = Object.assign({}, target);
    for (const key of Object.keys(source)) {
      if (typeof source[key] === 'object' && source[key] !== null && !Array.isArray(source[key])) {
        if (!(key in output)) {
          output[key] = source[key];
        } else {
          output[key] = deepMerge(output[key], source[key]);
        }
      } else {
        output[key] = source[key];
      }
    }
    return output;
  }

  function notify(key, newVal) {
    if (subscribers.has(key)) {
      const listeners = Array.from(subscribers.get(key));
      listeners.forEach(fn => {
        try {
          fn(newVal);
        } catch (e) {
          console.error(`[CP.store] Error in subscriber for ${key}:`, e);
        }
      });
    }
    if (CP.bus && typeof CP.bus.emit === 'function') {
      CP.bus.emit(`store:${key}`, newVal);
    }
  }

  function notifyCorrupted(key) {
    const msg = `Data error: Storage for "${key}" was corrupted. Recovered using fallback.`;
    if (typeof window !== 'undefined' && window.CP && window.CP.ui && typeof window.CP.ui.toast === 'function' && document.getElementById('toast-container')) {
      window.CP.ui.toast(msg, 'warning');
    } else if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('DOMContentLoaded', () => {
        if (window.CP && window.CP.ui && typeof window.CP.ui.toast === 'function') {
          window.CP.ui.toast(msg, 'warning');
        }
      }, { once: true });
    }
  }

  return {
    deepMerge,

    /**
     * Toggles in-memory sandboxing mode. When enabled, all get/set/remove
     * operations operate on an isolated in-memory Map without touching localStorage.
     * @param {boolean} [enable=true]
     */
    useMemory(enable = true) {
      isMemoryMode = !!enable;
      if (isMemoryMode) {
        memStore.clear();
      }
    },

    /**
     * Returns true if currently operating in in-memory sandboxed mode.
     * @returns {boolean}
     */
    isMemory() {
      return isMemoryMode;
    },

    /**
     * Checks if key exists in storage (even if falsy or unparsed).
     * @param {string} key
     * @returns {boolean}
     */
    has(key) {
      if (isMemoryMode) return memStore.has(key);
      try {
        return localStorage.getItem(key) !== null;
      } catch (e) {
        return false;
      }
    },

    /**
     * Retrieves an item from storage and parses JSON.
     * In case of corrupted JSON, catches error, notifies user via toast, and returns fallback.
     * Preserves raw data in localStorage without deleting it.
     * @param {string} key - localStorage key
     * @param {any} fallback - Fallback if key does not exist or parse fails
     * @returns {any}
     */
    get(key, fallback = null) {
      if (isMemoryMode) {
        if (!memStore.has(key)) return fallback;
        try {
          return JSON.parse(JSON.stringify(memStore.get(key)));
        } catch (e) {
          return memStore.get(key);
        }
      }

      try {
        const raw = localStorage.getItem(key);
        if (raw === null || raw === undefined) return fallback;
        return JSON.parse(raw);
      } catch (err) {
        console.warn(`[CP.store] Corrupted JSON detected for key "${key}":`, err);
        notifyCorrupted(key);
        return fallback;
      }
    },

    /**
     * Stores an item as JSON in storage.
     * @param {string} key - localStorage key
     * @param {any} value - Value to persist
     * @returns {boolean} true on success
     * @throws {Error} QuotaExceededError or StorageError on write failure
     */
    set(key, value) {
      if (isMemoryMode) {
        memStore.set(key, JSON.parse(JSON.stringify(value)));
        notify(key, value);
        return true;
      }

      try {
        const raw = JSON.stringify(value);
        localStorage.setItem(key, raw);
        notify(key, value);
        return true;
      } catch (err) {
        console.error(`[CP.store] Failed to save key "${key}":`, err);
        const isQuota = err && (
          err.name === 'QuotaExceededError' ||
          err.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
          err.code === 22 ||
          err.code === 1014
        );
        const msg = isQuota
          ? `Storage quota exceeded while saving "${key}". Please backup and clear old data.`
          : `Storage write failed for "${key}": ${err.message || err}`;

        if (CP.ui && typeof CP.ui.toast === 'function') {
          CP.ui.toast(msg, "danger");
        }

        const storageError = new Error(msg);
        storageError.isQuota = isQuota;
        storageError.originalError = err;
        storageError.storageKey = key;
        throw storageError;
      }
    },

    /**
     * Updates an existing key using an updater function.
     * @param {string} key - localStorage key
     * @param {Function} fn - Receives current value, returns updated value
     */
    update(key, fn) {
      const current = CP.store.get(key, null);
      const updated = fn(current);
      CP.store.set(key, updated);
      return updated;
    },

    /**
     * Removes an item from storage.
     * @param {string} key - localStorage key
     */
    remove(key) {
      if (isMemoryMode) {
        memStore.delete(key);
        notify(key, null);
        return;
      }

      try {
        localStorage.removeItem(key);
        notify(key, null);
      } catch (err) {
        console.error(`[CP.store] Failed to remove key "${key}":`, err);
      }
    },

    /**
     * Subscribes to changes for a specific key.
     * @param {string} key - storage key
     * @param {Function} fn - Callback receiving new value
     * @returns {Function} Unsubscribe function
     */
    subscribe(key, fn) {
      if (typeof fn !== 'function') return () => {};
      if (!subscribers.has(key)) {
        subscribers.set(key, new Set());
      }
      subscribers.get(key).add(fn);

      return () => {
        if (!subscribers.has(key)) return;
        const set = subscribers.get(key);
        set.delete(fn);
        if (set.size === 0) subscribers.delete(key);
      };
    },

    /**
     * Exports all keys prefixed with "cp_".
     * @returns {Object}
     */
    exportAll() {
      const dump = {};
      if (isMemoryMode) {
        for (const [k, v] of memStore.entries()) {
          if (k.startsWith('cp_')) {
            dump[k] = JSON.parse(JSON.stringify(v));
          }
        }
        return dump;
      }

      try {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith('cp_')) {
            dump[k] = CP.store.get(k);
          }
        }
      } catch (err) {
        console.error('[CP.store] Error exporting data:', err);
      }
      return dump;
    },

    /**
     * Imports a data dump into storage.
     * @param {Object} obj - Object containing cp_* keys
     * @param {"replace"|"merge"} mode - Import mode
     */
    importAll(obj, mode = 'replace') {
      if (!obj || typeof obj !== 'object') return;

      if (isMemoryMode) {
        if (mode === 'replace') {
          const toDelete = [];
          for (const k of memStore.keys()) {
            if (k.startsWith('cp_')) toDelete.push(k);
          }
          toDelete.forEach(k => memStore.delete(k));
        }
        for (const [k, v] of Object.entries(obj)) {
          if (k.startsWith('cp_')) {
            CP.store.set(k, v);
          }
        }
        return;
      }

      if (mode === 'replace') {
        const toDelete = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith('cp_')) {
            toDelete.push(k);
          }
        }
        toDelete.forEach(k => localStorage.removeItem(k));
      }

      for (const [k, v] of Object.entries(obj)) {
        if (k.startsWith('cp_')) {
          CP.store.set(k, v);
        }
      }
    },

    /**
     * Estimates the current storage byte usage for cp_ keys.
     * @returns {number} Approximate bytes used
     */
    usage() {
      let bytes = 0;
      if (isMemoryMode) {
        for (const [k, v] of memStore.entries()) {
          if (k.startsWith('cp_')) {
            const val = JSON.stringify(v) || '';
            bytes += (k.length + val.length) * 2;
          }
        }
        return bytes;
      }

      try {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith('cp_')) {
            const val = localStorage.getItem(k) || '';
            bytes += (k.length + val.length) * 2;
          }
        }
      } catch (err) {
        console.warn('[CP.store] Error calculating storage usage:', err);
      }
      return bytes;
    },

    /**
     * Executes versioned, idempotent data migrations.
     */
    runMigrations() {
      const meta = CP.store.get('cp_meta', { schemaVersion: 1 });
      const currentVer = Number(meta.schemaVersion) || 1;

      if (currentVer < 2) {
        // Migration v1 -> v2: Ensure existing orders have snapshotted pricing and line totals
        try {
          const orders = CP.store.get('cp_orders', []);
          let changed = false;
          if (Array.isArray(orders) && orders.length > 0) {
            const settings = CP.store.get('cp_settings', {});
            const pricingCfg = settings.pricing || {};
            orders.forEach(order => {
              if (!order) return;
              order.pricing = order.pricing || {};
              if (!order.pricing.isSnapshotted) {
                changed = true;
                order.pricing.isSnapshotted = true;
                if (order.pricing.gstEnabled === undefined) {
                  order.pricing.gstEnabled = (Number(order.pricing.gstAmt) > 0);
                }
                if (order.pricing.gstPct === undefined) {
                  order.pricing.gstPct = Number(pricingCfg.gstPct) || 18;
                }
              }
              (order.parts || []).forEach(p => {
                if (p) {
                  if (p.ratePerGram === undefined) {
                    p.ratePerGram = pricingCfg.ratePerGram?.[p.material] ?? 4;
                    changed = true;
                  }
                  if (p.layerMultiplier === undefined) {
                    p.layerMultiplier = pricingCfg.layerMultiplier?.[p.layer] ?? 1;
                    changed = true;
                  }
                  if (p.linePrice === undefined) {
                    const w = Number(p.weightG) || 0;
                    const q = Number(p.qty) || 1;
                    p.linePrice = Math.round(w * q * p.ratePerGram * p.layerMultiplier * 100) / 100;
                    changed = true;
                  }
                }
              });
            });
            if (changed) {
              CP.store.set('cp_orders', orders);
            }
          }
          meta.schemaVersion = 2;
          CP.store.set('cp_meta', meta);
        } catch (mErr) {
          console.error('[CP.store] Migration to v2 failed:', mErr);
        }
      }
    },

    /**
     * Seeds initial default collections if missing, deep-merges settings schema,
     * avoids destructive recovery on corrupted files, and executes idempotent migrations.
     */
    init() {
      const defs = CP.defaults || {};

      const safeInitKey = (key, defaultVal) => {
        if (!CP.store.has(key)) {
          CP.store.set(key, defaultVal);
        } else {
          // Key exists. If it parses as null, verify it isn't corrupted non-empty data before overwriting!
          try {
            const parsed = CP.store.get(key, null);
            if (parsed === null) {
              console.warn(`[CP.store] Key "${key}" exists with unparseable data. Preserving raw data to avoid silent loss.`);
            }
          } catch (e) {
            console.error(`[CP.store] Parse check failed on "${key}":`, e);
          }
        }
      };

      // 1. Settings (preserve user settings via deepMerge)
      const existingSettings = CP.store.get('cp_settings', null);
      if (!existingSettings) {
        if (!CP.store.has('cp_settings')) {
          CP.store.set('cp_settings', defs.settings || {});
        }
      } else {
        const mergedSettings = deepMerge(defs.settings || {}, existingSettings);
        CP.store.set('cp_settings', mergedSettings);
      }

      // 2. Printers
      safeInitKey('cp_printers', defs.printers || []);

      // 3. Maintenance tasks
      safeInitKey('cp_maint_tasks', defs.maintTasks || []);

      // 4. Counters
      safeInitKey('cp_counters', defs.counters || {});

      // 5. Metadata
      safeInitKey('cp_meta', defs.meta || { schemaVersion: 2, lastBackupAt: null });

      // 6. Other collections
      safeInitKey('cp_orders', []);
      safeInitKey('cp_expenses', []);
      safeInitKey('cp_customers', []);
      safeInitKey('cp_part_templates', []);
      safeInitKey('cp_spools', []);
      safeInitKey('cp_ledger', []);
      safeInitKey('cp_supplier_prices', []);
      safeInitKey('cp_scrap', []);
      safeInitKey('cp_qc', []);
      safeInitKey('cp_maint_log', []);

      // 7. Run idempotent migrations
      CP.store.runMigrations();
    }
  };
})();
