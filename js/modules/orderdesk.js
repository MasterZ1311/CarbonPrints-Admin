/**
 * CarbonPrints Company OS - Order Desk Module (Stub)
 * Full implementation in Prompt 2.
 */
window.CP = window.CP || {};

CP.registerModule({
  id: 'orderdesk',
  route: '#/order-desk',
  title: 'Order Desk',
  icon: '📝',
  render(rootElement, params) {
    rootElement.innerHTML = `
      <div class="card">
        <div class="card-header">
          <div>
            <h2 class="card-title">📝 Order Desk (Quotation Builder)</h2>
            <div class="card-subtitle">Fast quoting, slicing calculations, and WhatsApp dispatch</div>
          </div>
        </div>
        ${CP.ui.emptyState('📝', 'Order Desk Module', 'This module is built in Prompt 2')}
      </div>
    `;
  },
  destroy() {
    // Teardown timers and bus subscriptions
  }
});
