/**
 * CarbonPrints Company OS - Hash Router
 * Global namespace: window.CP.router and window.CP.registerModule
 */
window.CP = window.CP || {};

CP.router = (function () {
  const modules = new Map(); // id -> module
  const routes = new Map();  // baseRoute -> module

  let activeModule = null;
  let activeParams = {};

  /**
   * Parses the current window.location.hash.
   * Supports: #/base or #/base/id
   * @returns {{ route: string, baseRoute: string, params: Object }}
   */
  function parseHash() {
    let hash = window.location.hash || '#/dashboard';
    if (!hash.startsWith('#/')) {
      hash = '#/dashboard';
    }

    // Strip query string if any
    const [pathOnly, queryString] = hash.split('?');
    const segments = pathOnly.slice(2).split('/').filter(Boolean);

    const baseSegment = segments[0] || 'dashboard';
    const baseRoute = `#/${baseSegment}`;
    const params = {};

    if (segments.length > 1) {
      params.id = decodeURIComponent(segments[1]);
    }

    if (queryString) {
      const qParams = new URLSearchParams(queryString);
      qParams.forEach((val, key) => {
        params[key] = val;
      });
    }

    return { route: pathOnly, baseRoute, params };
  }

  /**
   * Updates sidebar active state based on current route.
   */
  function updateNavHighlight(baseRoute) {
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
      const itemRoute = item.getAttribute('data-route') || item.getAttribute('href');
      if (itemRoute === baseRoute) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });
  }

  /**
   * Dispatches route change, tearing down old module and rendering new module.
   */
  function handleRoute() {
    const { route, baseRoute, params } = parseHash();
    const root = document.getElementById('view');
    if (!root) return;

    // Find registered module for this route
    const targetModule = routes.get(baseRoute) || routes.get(route);

    // Teardown previous module
    if (activeModule && typeof activeModule.destroy === 'function') {
      try {
        activeModule.destroy();
      } catch (err) {
        console.error(`[CP.router] Error destroying module "${activeModule.id}":`, err);
      }
    }

    // Update nav active indicator
    updateNavHighlight(baseRoute);

    // Clear main view
    root.innerHTML = '';

    if (targetModule && typeof targetModule.render === 'function') {
      activeModule = targetModule;
      activeParams = params;
      try {
        targetModule.render(root, params);
      } catch (err) {
        console.error(`[CP.router] Error rendering module "${targetModule.id}":`, err);
        root.innerHTML = `
          <div class="card banner banner-danger">
            <strong>Module Error:</strong> An error occurred while rendering ${CP.util.esc(targetModule.title)}.
          </div>
        `;
      }
    } else {
      activeModule = null;
      activeParams = {};
      // Friendly 404
      root.innerHTML = `
        <div class="card empty-state">
          <div class="empty-state-icon">🧭</div>
          <h2 class="empty-state-title">Page Not Found</h2>
          <p class="empty-state-text">The requested screen <code>${CP.util.esc(route)}</code> does not exist.</p>
          <div style="margin-top: 16px;">
            <a href="#/dashboard" class="btn btn-primary">Go to Dashboard</a>
          </div>
        </div>
      `;
    }

    // Scroll to top on navigation
    window.scrollTo({ top: 0, behavior: 'instant' });

    // Announce to bus
    if (CP.bus) {
      CP.bus.emit('route:changed', { route, baseRoute, params, module: targetModule ? targetModule.id : null });
    }
  }

  return {
    /**
     * Registers a module with the router.
     * @param {Object} mod - { id, route, title, icon, render, destroy }
     */
    register(mod) {
      if (!mod || !mod.id || !mod.route) {
        console.error('[CP.router] Invalid module registration:', mod);
        return;
      }
      modules.set(mod.id, mod);
      routes.set(mod.route, mod);
    },

    /**
     * Programmatically navigates to a route hash.
     * @param {string} path - e.g. '#/order-desk' or '#/order-desk/CP-2026-0001'
     */
    navigate(path) {
      window.location.hash = path;
    },

    /**
     * Returns current active module.
     */
    getActiveModule() {
      return activeModule;
    },

    /**
     * Returns current active route params.
     */
    getParams() {
      return Object.assign({}, activeParams);
    },

    /**
     * Initializes hash routing and event listeners.
     */
    init() {
      window.addEventListener('hashchange', handleRoute);
      // If no hash present, set to default
      if (!window.location.hash) {
        window.location.hash = '#/dashboard';
      } else {
        handleRoute();
      }
    }
  };
})();

/**
 * Global shortcut per requirement:
 * CP.registerModule({ id, route, title, icon, render(rootElement, params), destroy() })
 */
CP.registerModule = function (mod) {
  CP.router.register(mod);
};
