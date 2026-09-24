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
    } else if (typeof window !== 'undefined') {
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
     * Retrieves an item from storage and parses JSON.
     * In case of corrupted JSON, catches error, notifies user via toast, and returns fallback.
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
     */
    set(key, value) {
      if (isMemoryMode) {
        memStore.set(key, JSON.parse(JSON.stringify(value)));
        notify(key, value);
        return;
      }

      try {
        const raw = JSON.stringify(value);
        localStorage.setItem(key, raw);
        notify(key, value);
      } catch (err) {
        console.error(`[CP.store] Failed to save key "${key}":`, err);
        if (CP.ui && typeof CP.ui.toast === 'function') {
          CP.ui.toast("Storage quota exceeded! Please backup and clear old data.", "danger");
        } else {
          alert("Storage quota exceeded! Please backup and clear old data.");
        }
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
     * Seeds initial default collections if missing, and deep-merges settings schema.
     */
    init() {
      const defs = CP.defaults || {};

      // 1. Settings
      const existingSettings = CP.store.get('cp_settings', null);
      if (!existingSettings) {
        CP.store.set('cp_settings', defs.settings || {});
      } else {
        const mergedSettings = deepMerge(defs.settings || {}, existingSettings);
        CP.store.set('cp_settings', mergedSettings);
      }

      // 2. Printers
      if (CP.store.get('cp_printers', null) === null) {
        CP.store.set('cp_printers', defs.printers || []);
      }

      // 3. Maintenance tasks
      if (CP.store.get('cp_maint_tasks', null) === null) {
        CP.store.set('cp_maint_tasks', defs.maintTasks || []);
      }

      // 4. Counters
      if (CP.store.get('cp_counters', null) === null) {
        CP.store.set('cp_counters', defs.counters || {});
      }

      // 5. Metadata
      const meta = CP.store.get('cp_meta', null);
      if (!meta) {
        CP.store.set('cp_meta', defs.meta || { schemaVersion: 1, lastBackupAt: null });
      }

      // 6. Initialize other arrays if not present
      if (CP.store.get('cp_orders', null) === null) CP.store.set('cp_orders', []);
      if (CP.store.get('cp_spools', null) === null) CP.store.set('cp_spools', []);
      if (CP.store.get('cp_ledger', null) === null) CP.store.set('cp_ledger', []);
      if (CP.store.get('cp_supplier_prices', null) === null) CP.store.set('cp_supplier_prices', []);
      if (CP.store.get('cp_scrap', null) === null) CP.store.set('cp_scrap', []);
      if (CP.store.get('cp_qc', null) === null) CP.store.set('cp_qc', []);
      if (CP.store.get('cp_maint_log', null) === null) CP.store.set('cp_maint_log', []);
    }
  };
})();
