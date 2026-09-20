/**
 * CarbonPrints Company OS - Application Bootstrap
 * Global namespace: window.CP
 * Initializes persistence, routes, and exposes CP.version.
 */
window.CP = window.CP || {};
CP.version = "0.1.0";

document.addEventListener('DOMContentLoaded', () => {
  // 1. Initialize offline store (seeds defaults on first launch, deep-merges schema)
  if (CP.store && typeof CP.store.init === 'function') {
    CP.store.init();
  }

  // 2. Initialize hash routing and mount current view
  if (CP.router && typeof CP.router.init === 'function') {
    CP.router.init();
  }

  console.log(
    `%c CarbonPrints Company OS v${CP.version} Initialized %c [Offline-First / Chennai, IN] `,
    'background: #0f766e; color: #ffffff; font-weight: bold; padding: 4px 8px; border-radius: 4px 0 0 4px;',
    'background: #f1f5f9; color: #0f172a; padding: 4px 8px; border-radius: 0 4px 4px 0;'
  );
});
