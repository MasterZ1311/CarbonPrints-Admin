/**
 * CarbonPrints Company OS - Developer & Demo Data Tools
 * Global namespace: window.CP.dev
 */
window.CP = window.CP || {};

CP.dev = (function () {
  const seeders = [];

  return {
    /**
     * Registers a seeding function that populates demo data.
     * @param {Function} fn - Seeder callback
     */
    registerSeeder(fn) {
      if (typeof fn === 'function') {
        seeders.push(fn);
      }
    },

    /**
     * Executes all registered demo data seeders and refreshes the current view.
     */
    seed() {
      if (seeders.length === 0) {
        if (CP.ui && typeof CP.ui.toast === 'function') {
          CP.ui.toast("No seeders registered yet. Module seeders are added in subsequent prompts.", "info");
        }
        return;
      }

      try {
        seeders.forEach(fn => fn());
        if (CP.store) {
          const meta = CP.store.get('cp_meta', { schemaVersion: 1, lastBackupAt: null });
          meta.lastBackupAt = new Date().toISOString();
          CP.store.set('cp_meta', meta);
        }

        if (CP.ui && typeof CP.ui.toast === 'function') {
          CP.ui.toast("Demo data seeded successfully!", "success");
        }

        // Re-trigger current route rendering
        if (CP.router && typeof window !== 'undefined' && window.location) {
          const currentHash = window.location.hash || '#/dashboard';
          window.location.hash = '';
          window.location.hash = currentHash;
        }
      } catch (err) {
        console.error('[CP.dev] Error seeding data:', err);
        if (CP.ui && typeof CP.ui.toast === 'function') {
          CP.ui.toast("Failed to seed demo data. Check console for details.", "danger");
        }
      }
    },

    /**
     * Confirms and clears all cp_* localStorage entries, then restores clean defaults.
     */
    async reset() {
      if (!CP.ui) return;

      const confirmed = await CP.ui.confirm(
        "Are you sure you want to reset ALL CarbonPrints data? This will clear all orders, spools, logs, and settings."
      );

      if (!confirmed) return;

      try {
        const toRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith('cp_')) {
            toRemove.push(k);
          }
        }
        toRemove.forEach(k => localStorage.removeItem(k));

        // Re-seed clean defaults
        if (CP.store && typeof CP.store.init === 'function') {
          CP.store.init();
        }

        CP.ui.toast("All data reset to clean defaults.", "success");

        // Reload page to guarantee clean state
        setTimeout(() => {
          window.location.hash = '#/dashboard';
          window.location.reload();
        }, 300);
      } catch (err) {
        console.error('[CP.dev] Error during data reset:', err);
        CP.ui.toast("Error resetting data. Check console.", "danger");
      }
    }
  };
})();
