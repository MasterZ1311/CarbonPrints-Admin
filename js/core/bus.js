/**
 * CarbonPrints Company OS - Event Bus
 * Global namespace: window.CP.bus
 * Provides a lightweight decoupled pub/sub event mechanism for modules.
 */
window.CP = window.CP || {};

CP.bus = (function () {
  const listeners = new Map();

  return {
    /**
     * Subscribes a callback to an event.
     * @param {string} event - Event name
     * @param {Function} fn - Callback receiving payload
     * @returns {Function} Unsubscribe function
     */
    on(event, fn) {
      if (typeof fn !== 'function') return () => {};
      if (!listeners.has(event)) {
        listeners.set(event, new Set());
      }
      listeners.get(event).add(fn);

      return () => {
        CP.bus.off(event, fn);
      };
    },

    /**
     * Unsubscribes a callback from an event.
     * @param {string} event - Event name
     * @param {Function} fn - Callback to remove
     */
    off(event, fn) {
      if (!listeners.has(event)) return;
      const set = listeners.get(event);
      set.delete(fn);
      if (set.size === 0) {
        listeners.delete(event);
      }
    },

    /**
     * Dispatches an event with an optional payload to all active subscribers.
     * @param {string} event - Event name
     * @param {any} payload - Event payload
     */
    emit(event, payload) {
      if (!listeners.has(event)) return;
      const set = listeners.get(event);
      // Copy to prevent mutation issues during dispatch
      const targets = Array.from(set);
      for (const fn of targets) {
        try {
          fn(payload);
        } catch (err) {
          console.error(`[CP.bus] Error in handler for event "${event}":`, err);
        }
      }
    }
  };
})();
