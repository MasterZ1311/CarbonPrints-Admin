/**
 * CarbonPrints Company OS - Dashboard Module (Stub)
 * Full implementation in Prompt 8.
 */
window.CP = window.CP || {};

CP.registerModule({
  id: 'dashboard',
  route: '#/dashboard',
  title: 'Dashboard',
  icon: '📊',
  render(rootElement, params) {
    rootElement.innerHTML = `
      <div class="card">
        <div class="card-header">
          <div>
            <h2 class="card-title">📊 Dashboard</h2>
            <div class="card-subtitle">Operational overview and farm health</div>
          </div>
        </div>
        ${CP.ui.emptyState('📊', 'Dashboard Module', 'This module is built in Prompt 8')}
      </div>
    `;
  },
  destroy() {
    // Teardown timers and bus subscriptions
  }
});
