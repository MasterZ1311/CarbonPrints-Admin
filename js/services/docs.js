/**
 * CarbonPrints Company OS - Document & Invoice Generation Service
 * Global namespace: window.CP.docs
 * Generates and prints Tax Invoices, Delivery Challans, and on-screen paper sheet previews.
 */
window.CP = window.CP || {};

CP.docs = (function () {
  function getSettings() {
    return CP.store.get('cp_settings', CP.defaults ? CP.defaults.settings : {});
  }

  function getOrder(orderId) {
    const orders = CP.store.get('cp_orders', []);
    return orders.find(o => o.id === orderId) || null;
  }

  function saveOrder(updatedOrder) {
    const orders = CP.store.get('cp_orders', []);
    const idx = orders.findIndex(o => o.id === updatedOrder.id);
    if (idx >= 0) {
      orders[idx] = updatedOrder;
    } else {
      orders.push(updatedOrder);
    }
    CP.store.set('cp_orders', orders);
  }

  function ensureInvoiceNo(order) {
    if (!order.invoiceNo) {
      order.invoiceNo = CP.util.nextId('invoice');
      order.invoiceDate = CP.util.todayISO();
      order.updatedAt = new Date().toISOString();
      saveOrder(order);
    }
    return order.invoiceNo;
  }

  function ensureChallanNo(order) {
    if (!order.challanNo) {
      order.challanNo = CP.util.nextId('challan');
      order.challanDate = CP.util.todayISO();
      order.updatedAt = new Date().toISOString();
      saveOrder(order);
    }
    return order.challanNo;
  }

  function generateInvoiceHTML(order, settings) {
    const biz = settings.business || {};
    const cust = order.customer || {};
    const pricingCfg = settings.pricing || {};
    const parts = order.parts || [];
    const isGst = !!pricingCfg.gstEnabled;
    const calc = CP.pricing.calcOrder(order, settings);

    const docTitle = isGst ? "TAX INVOICE" : "INVOICE";
    const invNo = order.invoiceNo || 'DRAFT-INV';
    const invDate = CP.util.fmtDate(order.invoiceDate || order.updatedAt || order.createdAt || CP.util.todayISO());
    const dueDateStr = order.dueDate ? CP.util.fmtDate(order.dueDate) : '-';

    const itemsRows = parts.map((p, i) => {
      const pPrice = CP.pricing.partPrice(p, settings);
      const rate = pricingCfg.ratePerGram?.[p.material] ?? 4;
      const weightTotal = (Number(p.weightG) || 0) * (Number(p.qty) || 1);
      const desc = `${CP.util.esc(p.name)} - ${CP.util.esc(p.material)}, ${CP.util.esc(p.layer || '0.20')}mm, ${p.infillPct || 20}% infill`;
      return `
        <tr>
          <td style="text-align: center;">${i + 1}</td>
          <td>
            <strong>${CP.util.esc(p.name)}</strong>
            <div style="font-size: 11px; color: #475569;">${CP.util.esc(p.material)} | ${CP.util.esc(p.layer || '0.20')}mm | ${p.infillPct || 20}% infill</div>
          </td>
          <td style="text-align: center;">${p.qty || 1}</td>
          <td style="text-align: right;">${weightTotal.toFixed(1)} g</td>
          <td style="text-align: right;">₹ ${rate.toFixed(2)}</td>
          <td style="text-align: right; font-weight: 600;">₹ ${CP.util.fmtINR(pPrice)}</td>
        </tr>
      `;
    }).join('');

    let taxRows = '';
    if (isGst && calc.gstAmt > 0) {
      if (pricingCfg.interState) {
        taxRows = `
          <tr>
            <td colspan="5" style="text-align: right; border-top: 1px solid #cbd5e1;">IGST (${calc.gstPct}%):</td>
            <td style="text-align: right; border-top: 1px solid #cbd5e1;">₹ ${CP.util.fmtINR(calc.igst)}</td>
          </tr>
        `;
      } else {
        const half = (calc.gstPct / 2).toFixed(1);
        taxRows = `
          <tr>
            <td colspan="5" style="text-align: right; border-top: 1px solid #cbd5e1;">CGST (${half}%):</td>
            <td style="text-align: right; border-top: 1px solid #cbd5e1;">₹ ${CP.util.fmtINR(calc.cgst)}</td>
          </tr>
          <tr>
            <td colspan="5" style="text-align: right;">SGST (${half}%):</td>
            <td style="text-align: right;">₹ ${CP.util.fmtINR(calc.sgst)}</td>
          </tr>
        `;
      }
    }

    const discountRow = (calc.discountAmt > 0) ? `
      <tr>
        <td colspan="5" style="text-align: right; color: #b91c1c;">Discount (${calc.discountPct}%):</td>
        <td style="text-align: right; color: #b91c1c;">-₹ ${CP.util.fmtINR(calc.discountAmt)}</td>
      </tr>
    ` : '';

    const paidAmt = Number(order.payment?.paidAmount) || 0;
    const balanceDue = Math.max(0, calc.total - paidAmt);
    const amountInWords = CP.pricing.numberToWordsINR(calc.total);

    return `
      <div class="doc-container invoice-doc">
        <!-- Letterhead Header -->
        <div class="doc-header">
          <div>
            <h1 class="doc-biz-name">${CP.util.esc(biz.name || 'CarbonPrints')}</h1>
            <div class="doc-biz-legal">${CP.util.esc(biz.legalName || 'CarbonPrints Private Limited')}</div>
            <div class="doc-biz-addr">${CP.util.esc(biz.address || '')}</div>
            <div class="doc-biz-contact">Phone: ${CP.util.esc(biz.phone || '')} | Email: ${CP.util.esc(biz.email || '')}</div>
            ${biz.gstin ? `<div class="doc-biz-gst"><strong>GSTIN:</strong> ${CP.util.esc(biz.gstin)}</div>` : ''}
          </div>
          <div style="text-align: right;">
            <div class="doc-title-badge">${docTitle}</div>
            <div class="doc-meta-item"><strong>Invoice No:</strong> ${CP.util.esc(invNo)}</div>
            <div class="doc-meta-item"><strong>Date:</strong> ${invDate}</div>
            <div class="doc-meta-item"><strong>Order Ref:</strong> ${CP.util.esc(order.id || '-')}</div>
            <div class="doc-meta-item"><strong>Due Date:</strong> ${dueDateStr}</div>
          </div>
        </div>

        <hr class="doc-divider">

        <!-- Bill-To Info -->
        <div class="doc-grid-2">
          <div class="doc-block">
            <div class="doc-block-title">Billed To:</div>
            <div style="font-size: 14px; font-weight: 700;">${CP.util.esc(cust.name || 'Customer')}</div>
            <div>Phone: ${CP.util.esc(cust.phone || '-')}</div>
            ${cust.email ? `<div>Email: ${CP.util.esc(cust.email)}</div>` : ''}
            <div>Category: <span class="doc-tag">${CP.util.esc(cust.category || 'Standard')}</span></div>
          </div>
          <div class="doc-block" style="text-align: right;">
            <div class="doc-block-title">Payment &amp; Bank Details:</div>
            <div><strong>Mode:</strong> UPI / Direct Bank Transfer</div>
            <div><strong>UPI ID:</strong> ${CP.util.esc(biz.upiId || 'carbonprints@icici')}</div>
            <div><strong>Payee Name:</strong> ${CP.util.esc(biz.upiName || 'CarbonPrints Private Limited')}</div>
            <div><strong>Payment Status:</strong> ${(order.payment?.status || 'unpaid').toUpperCase()}</div>
          </div>
        </div>

        <!-- Items Table -->
        <table class="doc-table">
          <thead>
            <tr>
              <th style="width: 36px; text-align: center;">S.No</th>
              <th>Description (Item &amp; Print Specs)</th>
              <th style="width: 50px; text-align: center;">Qty</th>
              <th style="width: 80px; text-align: right;">Weight</th>
              <th style="width: 80px; text-align: right;">Rate</th>
              <th style="width: 100px; text-align: right;">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${itemsRows}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="5" style="text-align: right; font-weight: 600;">Subtotal:</td>
              <td style="text-align: right; font-weight: 600;">₹ ${CP.util.fmtINR(calc.subtotal)}</td>
            </tr>
            ${discountRow}
            ${taxRows}
            <tr class="doc-total-row">
              <td colspan="5" style="text-align: right; font-size: 15px; font-weight: 700;">Grand Total:</td>
              <td style="text-align: right; font-size: 15px; font-weight: 700;">₹ ${CP.util.fmtINR(calc.total)}</td>
            </tr>
            <tr>
              <td colspan="5" style="text-align: right; color: #16a34a;">Amount Paid:</td>
              <td style="text-align: right; font-weight: 600; color: #16a34a;">₹ ${CP.util.fmtINR(paidAmt)}</td>
            </tr>
            <tr>
              <td colspan="5" style="text-align: right; font-weight: 700; color: #b91c1c;">Balance Due:</td>
              <td style="text-align: right; font-weight: 700; color: #b91c1c;">₹ ${CP.util.fmtINR(balanceDue)}</td>
            </tr>
          </tfoot>
        </table>

        <!-- Amount In Words -->
        <div class="doc-words-box">
          <strong>Amount in Words:</strong> ${amountInWords}
        </div>

        ${order.notes ? `<div style="margin-top: 12px; font-size: 12px;"><strong>Order Notes:</strong> ${CP.util.esc(order.notes)}</div>` : ''}

        <!-- Footer Note & Signatures -->
        <div class="doc-footer-section">
          <div class="doc-footer-note">${CP.util.esc(biz.footerNote || 'All 3D printed parts are inspected for dimensional accuracy.')}</div>
          <div class="doc-signatures">
            <div style="font-size: 11px; color: #64748b;">Computer generated invoice. No physical signature required for quote.</div>
            <div style="text-align: right;">
              <div style="font-weight: 600; font-size: 12px;">For ${CP.util.esc(biz.legalName || 'CarbonPrints Private Limited')}</div>
              <div class="doc-sign-space"></div>
              <div style="font-size: 12px; border-top: 1px solid #94a3b8; padding-top: 4px;">Authorised Signatory</div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function generateChallanHTML(order, settings, courier) {
    const biz = settings.business || {};
    const cust = order.customer || {};
    const parts = order.parts || [];
    const challanNo = order.challanNo || 'DRAFT-DC';
    const dateStr = CP.util.fmtDate(order.challanDate || CP.util.todayISO());

    const itemsRows = parts.map((p, i) => {
      const weightTotal = (Number(p.weightG) || 0) * (Number(p.qty) || 1);
      return `
        <tr>
          <td style="text-align: center;">${i + 1}</td>
          <td>
            <strong>${CP.util.esc(p.name)}</strong>
            <div style="font-size: 11px; color: #475569;">${CP.util.esc(p.material)} | ${CP.util.esc(p.layer || '0.20')}mm | ${p.infillPct || 20}% infill</div>
          </td>
          <td style="text-align: center; font-size: 14px; font-weight: 700;">${p.qty || 1}</td>
          <td style="text-align: right;">${weightTotal.toFixed(1)} g</td>
        </tr>
      `;
    }).join('');

    return `
      <div class="doc-container challan-doc">
        <!-- Letterhead Header -->
        <div class="doc-header">
          <div>
            <h1 class="doc-biz-name">${CP.util.esc(biz.name || 'CarbonPrints')}</h1>
            <div class="doc-biz-legal">${CP.util.esc(biz.legalName || 'CarbonPrints Private Limited')}</div>
            <div class="doc-biz-addr">${CP.util.esc(biz.address || '')}</div>
            <div class="doc-biz-contact">Phone: ${CP.util.esc(biz.phone || '')} | Email: ${CP.util.esc(biz.email || '')}</div>
          </div>
          <div style="text-align: right;">
            <div class="doc-title-badge" style="background: #1e293b;">DELIVERY CHALLAN</div>
            <div class="doc-meta-item"><strong>Challan No:</strong> ${CP.util.esc(challanNo)}</div>
            <div class="doc-meta-item"><strong>Date:</strong> ${dateStr}</div>
            <div class="doc-meta-item"><strong>Order Ref:</strong> ${CP.util.esc(order.id || '-')}</div>
            <div class="doc-meta-item"><strong>Courier / Partner:</strong> ${CP.util.esc(courier || 'Hand Delivery')}</div>
          </div>
        </div>

        <hr class="doc-divider">

        <!-- Dispatch Info Grid -->
        <div class="doc-grid-2">
          <div class="doc-block">
            <div class="doc-block-title">Consignor (Sender):</div>
            <div style="font-weight: 700;">${CP.util.esc(biz.legalName || 'CarbonPrints Private Limited')}</div>
            <div>${CP.util.esc(biz.address || '')}</div>
            <div>Phone: ${CP.util.esc(biz.phone || '')}</div>
          </div>
          <div class="doc-block">
            <div class="doc-block-title">Consignee (Deliver To):</div>
            <div style="font-weight: 700; font-size: 14px;">${CP.util.esc(cust.name || 'Customer')}</div>
            <div>Phone: ${CP.util.esc(cust.phone || '-')}</div>
            ${cust.email ? `<div>Email: ${CP.util.esc(cust.email)}</div>` : ''}
            <div>Category: ${CP.util.esc(cust.category || 'Standard')}</div>
          </div>
        </div>

        <!-- Boxed Warning -->
        <div class="doc-warning-box">
          ⚠️ FRAGILE - HANDLE WITH CARE ⚠️
          <div style="font-size: 12px; font-weight: normal; margin-top: 2px;">
            Precision custom 3D printed components inside. Do not drop, crush, or expose to temperatures above 50°C.
          </div>
        </div>

        <!-- Items Table (NO PRICES) -->
        <table class="doc-table">
          <thead>
            <tr>
              <th style="width: 36px; text-align: center;">S.No</th>
              <th>Part Description &amp; Material Specifications</th>
              <th style="width: 80px; text-align: center;">Quantity</th>
              <th style="width: 110px; text-align: right;">Total Weight (g)</th>
            </tr>
          </thead>
          <tbody>
            ${itemsRows}
          </tbody>
        </table>

        <!-- Verification Checklist -->
        <div class="doc-checklist-box">
          <div style="font-weight: 700; font-size: 12px; margin-bottom: 8px; text-transform: uppercase;">
            Pre-Dispatch Verification Checklist:
          </div>
          <div class="doc-checklist-grid">
            <div class="doc-check-item"><span class="doc-checkbox"></span> Parts count verified</div>
            <div class="doc-check-item"><span class="doc-checkbox"></span> Dimensions checked</div>
            <div class="doc-check-item"><span class="doc-checkbox"></span> Packed with padding</div>
            <div class="doc-check-item"><span class="doc-checkbox"></span> Label attached</div>
          </div>
        </div>

        <!-- Signatures -->
        <div class="doc-challan-signatures">
          <div>
            <div style="font-weight: 600; font-size: 12px;">Dispatched By:</div>
            <div class="doc-sign-space"></div>
            <div style="font-size: 12px; border-top: 1px solid #94a3b8; padding-top: 4px;">Staff Signature &amp; Time</div>
          </div>
          <div style="text-align: right;">
            <div style="font-weight: 600; font-size: 12px;">Received In Good Condition By:</div>
            <div class="doc-sign-space"></div>
            <div style="font-size: 12px; border-top: 1px solid #94a3b8; padding-top: 4px;">Receiver Signature &amp; Date</div>
          </div>
        </div>
      </div>
    `;
  }

  function printContent(html, docClass) {
    const printRoot = document.getElementById('print-root');
    if (!printRoot) {
      CP.ui.toast("Print root element #print-root not found.", "danger");
      return;
    }
    printRoot.innerHTML = html;
    document.body.classList.add(docClass);

    const cleanup = () => {
      document.body.classList.remove(docClass);
      window.removeEventListener('afterprint', cleanup);
    };

    window.addEventListener('afterprint', cleanup);
    window.print();
  }

  return {
    /**
     * Previews the Tax Invoice on screen in a paper sheet modal.
     */
    previewInvoice(orderId) {
      const order = getOrder(orderId);
      if (!order) { CP.ui.toast(`Order ${orderId} not found.`, 'danger'); return; }
      const settings = getSettings();
      ensureInvoiceNo(order);
      const html = generateInvoiceHTML(order, settings);

      CP.ui.modal({
        title: `📄 Invoice Preview - ${order.invoiceNo} (${order.id})`,
        body: `<div class="paper-sheet">${html}</div>`,
        confirmText: '🖨️ Print Invoice',
        cancelText: 'Close',
        onConfirm: () => {
          CP.docs.printInvoice(orderId);
        }
      });
    },

    /**
     * Directly triggers browser print for Tax Invoice.
     */
    printInvoice(orderId) {
      const order = getOrder(orderId);
      if (!order) { CP.ui.toast(`Order ${orderId} not found.`, 'danger'); return; }
      const settings = getSettings();
      ensureInvoiceNo(order);
      const html = generateInvoiceHTML(order, settings);
      printContent(html, 'printing-invoice');
    },

    /**
     * Prompts for courier and previews Delivery Challan on screen.
     */
    async previewChallan(orderId) {
      const order = getOrder(orderId);
      if (!order) { CP.ui.toast(`Order ${orderId} not found.`, 'danger'); return; }
      const courier = await CP.ui.prompt(
        "Enter Courier / Dispatch Partner (e.g. Porter, Swiggy Genie, Self Pickup):",
        "Hand Delivery / Customer Pickup"
      );
      if (courier === null) return;

      const settings = getSettings();
      ensureChallanNo(order);
      const html = generateChallanHTML(order, settings, courier);

      CP.ui.modal({
        title: `🚚 Delivery Challan - ${order.challanNo} (${order.id})`,
        body: `<div class="paper-sheet">${html}</div>`,
        confirmText: '🖨️ Print Challan',
        cancelText: 'Close',
        onConfirm: () => {
          printContent(html, 'printing-challan');
        }
      });
    },

    /**
     * Prompts for courier and prints Delivery Challan.
     */
    async printChallan(orderId) {
      const order = getOrder(orderId);
      if (!order) { CP.ui.toast(`Order ${orderId} not found.`, 'danger'); return; }
      const courier = await CP.ui.prompt(
        "Enter Courier / Dispatch Partner (e.g. Porter, Swiggy Genie, Self Pickup):",
        "Hand Delivery / Customer Pickup"
      );
      if (courier === null) return;

      const settings = getSettings();
      ensureChallanNo(order);
      const html = generateChallanHTML(order, settings, courier);
      printContent(html, 'printing-challan');
    }
  };
})();
