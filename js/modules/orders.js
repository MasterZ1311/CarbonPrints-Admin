/**
 * CarbonPrints Company OS - Orders & Billing Module (Stub)
 * Full implementation in Prompt 3.
 */
window.CP = window.CP || {};

CP.registerModule({
  id: 'orders',
  route: '#/orders',
  title: 'Orders & Billing',
  icon: '📦',
  render(rootElement, params) {
    rootElement.innerHTML = `
      <div class="card">
        <div class="card-header">
          <div>
            <h2 class="card-title">📦 Orders &amp; Billing</h2>
            <div class="card-subtitle">Order pipeline, payments, invoices, and delivery challans</div>
          </div>
        </div>
        ${CP.ui.emptyState('📦', 'Orders & Billing Module', 'This module is built in Prompt 3')}
      </div>
    `;
  },
  destroy() {
    // Teardown timers and bus subscriptions
  }
});
