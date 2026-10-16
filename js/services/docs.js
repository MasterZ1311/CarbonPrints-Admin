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
    if (order.status === 'quote') {
      return null; // Quotes must never be issued sequential Tax Invoice numbers!
    }
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

  function resolveOrder(orderOrId) {
    if (!orderOrId) return null;
    if (typeof orderOrId === 'object' && Array.isArray(orderOrId.parts)) return orderOrId;
    return getOrder(orderOrId);
  }

  function formatTaxRows(calc, isGst, pricingCfg) {
    if (!isGst || !(calc.gstAmt > 0)) return '';
    const isInterState = (calc.interState !== undefined) ? !!calc.interState : !!pricingCfg.interState;
    if (isInterState) {
      return `<tr><td colspan="5" style="text-align: right; border-top: 1px solid #cbd5e1;">IGST (${calc.gstPct}%):</td><td style="text-align: right; border-top: 1px solid #cbd5e1;">${CP.util.fmtINR(calc.igst)}</td></tr>`;
    }
    const half = (calc.gstPct / 2).toFixed(1);
    return `<tr><td colspan="5" style="text-align: right; border-top: 1px solid #cbd5e1;">CGST (${half}%):</td><td style="text-align: right; border-top: 1px solid #cbd5e1;">${CP.util.fmtINR(calc.cgst)}</td></tr>` +
      `<tr><td colspan="5" style="text-align: right;">SGST (${half}%):</td><td style="text-align: right;">${CP.util.fmtINR(calc.sgst)}</td></tr>`;
  }

  function formatDiscountRow(calc) {
    return (calc.discountAmt > 0)
      ? `<tr><td colspan="5" style="text-align: right; color: #b91c1c;">Discount (${calc.discountPct}%):</td><td style="text-align: right; color: #b91c1c;">-${CP.util.fmtINR(calc.discountAmt)}</td></tr>`
      : '';
  }

  function generateQuoteHTML(order, settings) {
    const biz = settings.business || {};
    const cust = order.customer || {};
    const pricingCfg = settings.pricing || {};
    const parts = order.parts || [];
    const isSnapshotted = !!(order.pricing && order.pricing.isSnapshotted);
    const calc = isSnapshotted ? order.pricing : CP.pricing.calcOrder(order, settings);
    const isGst = (order.pricing && order.pricing.gstEnabled !== undefined)
      ? !!order.pricing.gstEnabled
      : (isSnapshotted ? ((order.pricing?.gstAmt || 0) > 0) : !!pricingCfg.gstEnabled);

    const quoteNo = order.id || 'DRAFT-QUOTE';
    const quoteDateStr = order.createdAt ? CP.util.fmtDate(order.createdAt) : CP.util.fmtDate(CP.util.todayISO());
    const validUntilDate = order.createdAt
      ? CP.util.fmtDate(CP.util.addDays(order.createdAt.slice(0, 10), 15))
      : CP.util.fmtDate(CP.util.addDays(CP.util.todayISO(), 15));
    const targetDelivery = order.dueDate ? CP.util.fmtDate(order.dueDate) : `${calc.turnaroundDays || 2} working day(s) from approval`;

    const itemsRows = parts.map((p, i) => {
      const pPrice = (p.linePrice !== undefined) ? Number(p.linePrice) : CP.pricing.partPrice(p, settings);
      const rate = (p.ratePerGram !== undefined) ? Number(p.ratePerGram) : (pricingCfg.ratePerGram?.[p.material] ?? 4);
      const weightTotal = (Number(p.weightG) || 0) * (Number(p.qty) || 1);
      return `<tr><td style="text-align: center;">${i + 1}</td><td><strong>${CP.util.esc(p.name || 'Custom 3D Part')}</strong><div style="font-size: 11px; color: #475569;">${CP.util.esc(p.material || 'PLA')} | ${CP.util.esc(p.layer || '0.20')}mm | ${p.infillPct || 20}% infill${p.notes ? ` | ${CP.util.esc(p.notes)}` : ''}</div></td><td style="text-align: center;">${p.qty || 1}</td><td style="text-align: right;">${weightTotal.toFixed(1)} g</td><td style="text-align: right;">₹ ${rate.toFixed(2)}/g</td><td style="text-align: right; font-weight: 600;">${CP.util.fmtINR(pPrice)}</td></tr>`;
    }).join('');

    const taxRows = formatTaxRows(calc, isGst, pricingCfg);
    const discountRow = formatDiscountRow(calc);
    const advanceRow = (calc.advance > 0)
      ? `<tr><td colspan="5" style="text-align: right; color: #475569;">Advance Required:</td><td style="text-align: right; font-weight: 600;">${CP.util.fmtINR(calc.advance)}</td></tr><tr><td colspan="5" style="text-align: right; font-weight: 600; color: #0284c7;">Balance on Delivery:</td><td style="text-align: right; font-weight: 600; color: #0284c7;">${CP.util.fmtINR(calc.balance)}</td></tr>`
      : '';
    const amountInWords = CP.pricing.numberToWordsINR(calc.total);

    return `
      <div class="doc-container quote-doc">
        <!-- Letterhead Header -->
        <div class="doc-header">
          <div>
            ${biz.logoUrl ? `<img src="${CP.util.esc(biz.logoUrl)}" alt="Logo" style="max-height: 48px; margin-bottom: 6px;">` : ''}
            <h1 class="doc-biz-name">${CP.util.esc(biz.name || 'CarbonPrints')}</h1>
            ${biz.legalName ? `<div class="doc-biz-legal">${CP.util.esc(biz.legalName)}</div>` : ''}
            ${biz.address ? `<div class="doc-biz-addr">${CP.util.esc(biz.address)}</div>` : ''}
            ${(biz.phone || biz.email) ? `<div class="doc-biz-contact">${[biz.phone ? `Phone: ${CP.util.esc(biz.phone)}` : '', biz.email ? `Email: ${CP.util.esc(biz.email)}` : ''].filter(Boolean).join(' | ')}</div>` : ''}
            ${biz.gstin ? `<div class="doc-biz-gst"><strong>GSTIN:</strong> ${CP.util.esc(biz.gstin)}</div>` : ''}
          </div>
          <div style="text-align: right;">
            <div class="doc-title-badge" style="background: #0284c7;">FORMAL QUOTATION</div>
            <div class="doc-meta-item"><strong>Quote No:</strong> ${CP.util.esc(quoteNo)}</div>
            <div class="doc-meta-item"><strong>Date:</strong> ${quoteDateStr}</div>
            <div class="doc-meta-item"><strong>Valid Until:</strong> ${validUntilDate}</div>
            <div class="doc-meta-item"><strong>Lead Time:</strong> ${targetDelivery}</div>
          </div>
        </div>

        <hr class="doc-divider" style="border-top-color: #0284c7;">

        <!-- Client & Terms Grid -->
        <div class="doc-grid-2">
          <div class="doc-block">
            <div class="doc-block-title">Quotation Prepared For:</div>
            <div style="font-size: 14px; font-weight: 700;">${CP.util.esc(cust.name || 'Customer')}</div>
            ${cust.phone ? `<div>Phone: ${CP.util.esc(cust.phone)}</div>` : ''}
            ${cust.email ? `<div>Email: ${CP.util.esc(cust.email)}</div>` : ''}
            ${cust.category ? `<div>Category: <span class="doc-tag">${CP.util.esc(cust.category)}</span></div>` : ''}
            ${order.notes ? `<div style="margin-top: 4px; font-size: 11px; color: #475569;">Project Ref: ${CP.util.esc(order.notes)}</div>` : ''}
          </div>
          <div class="doc-block" style="text-align: right;">
            <div class="doc-block-title">Payment Terms &amp; Settlement:</div>
            <div><strong>Payment Mode:</strong> UPI / Direct Bank Transfer</div>
            ${biz.upiId ? `<div><strong>UPI ID:</strong> ${CP.util.esc(biz.upiId)}</div>` : ''}
            ${biz.upiName ? `<div><strong>Payee Name:</strong> ${CP.util.esc(biz.upiName)}</div>` : ''}
            <div><strong>Terms:</strong> ${calc.advance > 0 ? `${CP.util.fmtINR(calc.advance)} advance to confirm print queue` : 'Full payment prior to dispatch'}</div>
          </div>
        </div>

        <!-- Items Table -->
        <table class="doc-table">
          <thead>
            <tr>
              <th style="width: 36px; text-align: center;">#</th>
              <th>Part Description &amp; Print Specifications</th>
              <th style="width: 50px; text-align: center;">Qty</th>
              <th style="width: 80px; text-align: right;">Est. Weight</th>
              <th style="width: 80px; text-align: right;">Unit Rate</th>
              <th style="width: 100px; text-align: right;">Line Total</th>
            </tr>
          </thead>
          <tbody>
            ${itemsRows}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="5" style="text-align: right; font-weight: 600;">Subtotal:</td>
              <td style="text-align: right; font-weight: 600;">${CP.util.fmtINR(calc.subtotal)}</td>
            </tr>
            ${discountRow}
            ${taxRows}
            <tr class="doc-total-row">
              <td colspan="5" style="text-align: right; font-size: 15px; font-weight: 700;">Quotation Total:</td>
              <td style="text-align: right; font-size: 15px; font-weight: 700; color: #0284c7;">${CP.util.fmtINR(calc.total)}</td>
            </tr>
            ${advanceRow}
          </tfoot>
        </table>

        <!-- Amount In Words -->
        <div class="doc-words-box">
          <strong>Total Amount in Words:</strong> ${amountInWords}
        </div>

        <!-- Terms & Acceptance -->
        <div class="doc-footer-section">
          <div class="doc-block" style="margin-bottom: 12px; font-size: 11px; line-height: 1.5;">
            <div class="doc-block-title">Terms &amp; Conditions:</div>
            <ul style="margin-left: 16px; margin-top: 4px; display: flex; flex-direction: column; gap: 2px;">
              <li>Rates quoted above are valid for 15 days from the quote date.</li>
              <li>Production lead time begins upon final 3D file verification and receipt of advance payment.</li>
              <li>Parts are manufactured using calibrated industrial 3D printers and verified for dimensional compliance.</li>
              ${biz.footerNote ? `<li>${CP.util.esc(biz.footerNote)}</li>` : ''}
            </ul>
          </div>
          <div class="doc-signatures">
            <div>
              <div style="font-weight: 600; font-size: 12px;">Customer Approval &amp; Confirmation:</div>
              <div class="doc-sign-space"></div>
              <div style="font-size: 11px; border-top: 1px solid #94a3b8; padding-top: 4px; color: #475569;">Sign &amp; Return with Date</div>
            </div>
            <div style="text-align: right;">
              <div style="font-weight: 600; font-size: 12px;">For ${CP.util.esc(biz.legalName || biz.name || 'CarbonPrints')}</div>
              <div class="doc-sign-space"></div>
              <div style="font-size: 11px; border-top: 1px solid #94a3b8; padding-top: 4px; color: #475569;">Authorized Signatory</div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function generateInvoiceHTML(order, settings) {
    const biz = settings.business || {};
    const cust = order.customer || {};
    const pricingCfg = settings.pricing || {};
    const parts = order.parts || [];
    const isSnapshotted = !!(order.pricing && order.pricing.isSnapshotted);
    const calc = isSnapshotted ? order.pricing : CP.pricing.calcOrder(order, settings);
    const isGst = (order.pricing && order.pricing.gstEnabled !== undefined)
      ? !!order.pricing.gstEnabled
      : (isSnapshotted ? ((order.pricing?.gstAmt || 0) > 0) : !!pricingCfg.gstEnabled);

    const docTitle = isGst ? "TAX INVOICE" : "INVOICE";
    const invNo = order.invoiceNo || 'DRAFT-INV';
    const invDate = CP.util.fmtDate(order.invoiceDate || order.updatedAt || order.createdAt || CP.util.todayISO());
    const dueDateStr = order.dueDate ? CP.util.fmtDate(order.dueDate) : '-';

    const itemsRows = parts.map((p, i) => {
      const pPrice = (p.linePrice !== undefined) ? Number(p.linePrice) : CP.pricing.partPrice(p, settings);
      const rate = (p.ratePerGram !== undefined) ? Number(p.ratePerGram) : (pricingCfg.ratePerGram?.[p.material] ?? 4);
      const weightTotal = (Number(p.weightG) || 0) * (Number(p.qty) || 1);
      return `<tr><td style="text-align: center;">${i + 1}</td><td><strong>${CP.util.esc(p.name)}</strong><div style="font-size: 11px; color: #475569;">${CP.util.esc(p.material)} | ${CP.util.esc(p.layer || '0.20')}mm | ${p.infillPct || 20}% infill</div></td><td style="text-align: center;">${p.qty || 1}</td><td style="text-align: right;">${weightTotal.toFixed(1)} g</td><td style="text-align: right;">₹ ${rate.toFixed(2)}</td><td style="text-align: right; font-weight: 600;">${CP.util.fmtINR(pPrice)}</td></tr>`;
    }).join('');

    const taxRows = formatTaxRows(calc, isGst, pricingCfg);
    const discountRow = formatDiscountRow(calc);

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
              <td style="text-align: right; font-weight: 600;">${CP.util.fmtINR(calc.subtotal)}</td>
            </tr>
            ${discountRow}
            ${taxRows}
            <tr class="doc-total-row">
              <td colspan="5" style="text-align: right; font-size: 15px; font-weight: 700;">Grand Total:</td>
              <td style="text-align: right; font-size: 15px; font-weight: 700;">${CP.util.fmtINR(calc.total)}</td>
            </tr>
            <tr>
              <td colspan="5" style="text-align: right; color: #16a34a;">Amount Paid:</td>
              <td style="text-align: right; font-weight: 600; color: #16a34a;">${CP.util.fmtINR(paidAmt)}</td>
            </tr>
            <tr>
              <td colspan="5" style="text-align: right; font-weight: 700; color: #b91c1c;">Balance Due:</td>
              <td style="text-align: right; font-weight: 700; color: #b91c1c;">${CP.util.fmtINR(balanceDue)}</td>
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
      return `<tr><td style="text-align: center;">${i + 1}</td><td><strong>${CP.util.esc(p.name)}</strong><div style="font-size: 11px; color: #475569;">${CP.util.esc(p.material)} | ${CP.util.esc(p.layer || '0.20')}mm | ${p.infillPct || 20}% infill</div></td><td style="text-align: center; font-size: 14px; font-weight: 700;">${p.qty || 1}</td><td style="text-align: right;">${weightTotal.toFixed(1)} g</td></tr>`;
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
    previewQuote(orderOrId) {
      const order = resolveOrder(orderOrId);
      if (!order) { CP.ui.toast("Quotation record not found.", "danger"); return; }
      const settings = getSettings();
      const html = generateQuoteHTML(order, settings);
      CP.ui.modal({
        title: `📜 Quotation Preview - ${order.id || 'Draft Quote'}`,
        body: `<div class="paper-sheet">${html}</div>`,
        confirmText: '🖨️ Print / Save as PDF',
        cancelText: 'Close',
        onConfirm: () => { CP.docs.printQuote(order); }
      });
    },

    printQuote(orderOrId) {
      const order = resolveOrder(orderOrId);
      if (!order) { CP.ui.toast("Quotation record not found.", "danger"); return; }
      const settings = getSettings();
      const html = generateQuoteHTML(order, settings);
      printContent(html, 'printing-quote');
    },

    previewInvoice(orderId) {
      const order = getOrder(orderId);
      if (!order) { CP.ui.toast(`Order ${orderId} not found.`, 'danger'); return; }
      if (order.status === 'quote') return this.previewQuote(order);
      const settings = getSettings();
      ensureInvoiceNo(order);
      const html = generateInvoiceHTML(order, settings);
      CP.ui.modal({
        title: `📄 Invoice Preview - ${order.invoiceNo} (${order.id})`,
        body: `<div class="paper-sheet">${html}</div>`,
        confirmText: '🖨️ Print / Save as PDF',
        cancelText: 'Close',
        onConfirm: () => { CP.docs.printInvoice(orderId); }
      });
    },

    printInvoice(orderId) {
      const order = getOrder(orderId);
      if (!order) { CP.ui.toast(`Order ${orderId} not found.`, 'danger'); return; }
      if (order.status === 'quote') return this.printQuote(order);
      const settings = getSettings();
      ensureInvoiceNo(order);
      const html = generateInvoiceHTML(order, settings);
      printContent(html, 'printing-invoice');
    },

    async previewChallan(orderId) {
      const order = getOrder(orderId);
      if (!order) { CP.ui.toast(`Order ${orderId} not found.`, 'danger'); return; }
      const courier = await CP.ui.prompt("Enter Courier / Dispatch Partner:", "Hand Delivery / Customer Pickup");
      if (courier === null) return;
      const settings = getSettings();
      ensureChallanNo(order);
      const html = generateChallanHTML(order, settings, courier);
      CP.ui.modal({
        title: `🚚 Delivery Challan - ${order.challanNo} (${order.id})`,
        body: `<div class="paper-sheet">${html}</div>`,
        confirmText: '🖨️ Print / Save as PDF',
        cancelText: 'Close',
        onConfirm: () => { printContent(html, 'printing-challan'); }
      });
    },

    async printChallan(orderId) {
      const order = getOrder(orderId);
      if (!order) { CP.ui.toast(`Order ${orderId} not found.`, 'danger'); return; }
      const courier = await CP.ui.prompt("Enter Courier / Dispatch Partner:", "Hand Delivery / Customer Pickup");
      if (courier === null) return;
      const settings = getSettings();
      ensureChallanNo(order);
      const html = generateChallanHTML(order, settings, courier);
      printContent(html, 'printing-challan');
    },

    ensureInvoiceNo,
    ensureChallanNo,
    generateInvoiceHTML,
    generateQuoteHTML,
    generateChallanHTML
  };
})();
