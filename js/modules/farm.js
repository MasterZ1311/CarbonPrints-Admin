/**
 * CarbonPrints Company OS - Farm Board Module (Stub)
 * Full implementation in Prompt 4.
 */
window.CP = window.CP || {};

CP.registerModule({
  id: 'farm',
  route: '#/farm',
  title: 'Farm Board',
  icon: '🖨️',
  render(rootElement, params) {
    rootElement.innerHTML = `
      <div class="card">
        <div class="card-header">
          <div>
            <h2 class="card-title">🖨️ Farm Board</h2>
            <div class="card-subtitle">Real-time status of 10 FDM printers and job queues</div>
          </div>
        </div>
        ${CP.ui.emptyState('🖨️', 'Farm Board Module', 'This module is built in Prompt 4')}
      </div>
    `;
  },
  destroy() {
    // Teardown timers and bus subscriptions
  }
});
