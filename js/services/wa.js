/**
 * CarbonPrints Company OS - WhatsApp Service
 * Global namespace: window.CP.wa
 * Provides quotation message templating and direct wa.me link generation.
 */
window.CP = window.CP || {};

CP.wa = {
  /**
   * Validates whether an input string is a valid 10-digit Indian mobile number.
   * Accepts formats like: "9840012345", "+91 98400 12345", "09840012345", "98400-12345".
   * @param {string|number} phone - Phone number input
   * @returns {boolean}
   */
  isValidIndianMobile(phone) {
    if (!phone) return false;
    const clean = CP.wa.cleanPhone(phone);
    return /^[6-9]\d{9}$/.test(clean);
  },

  /**
   * Normalizes a phone number to standard 10-digit format without leading 0 or +91.
   * @param {string|number} phone
   * @returns {string} 10 digits
   */
  cleanPhone(phone) {
    if (!phone) return '';
    let digits = String(phone).replace(/\D/g, '');
    if (digits.length === 12 && digits.startsWith('91')) {
      digits = digits.slice(2);
    } else if (digits.length === 11 && digits.startsWith('0')) {
      digits = digits.slice(1);
    }
    return digits;
  },

  /**
   * Generates a direct WhatsApp link with pre-filled message text.
   * Format: https://wa.me/91XXXXXXXXXX?text=...
   * @param {string} phone - Mobile number
   * @param {string} message - Plain text message
   * @returns {string}
   */
  waLink(phone, message) {
    const cleaned = CP.wa.cleanPhone(phone);
    const encoded = encodeURIComponent(message || '');
    return `https://wa.me/91${cleaned}?text=${encoded}`;
  },

  /**
   * Builds a formatted, plain text quotation message for WhatsApp.
   * @param {Object} order - Order data
   * @param {Object} settings - cp_settings data
   * @returns {string}
   */
  buildQuoteMessage(order, settings) {
    const customer = (order && order.customer) ? order.customer : {};
    const business = (settings && settings.business) ? settings.business : {};
    const parts = (order && Array.isArray(order.parts)) ? order.parts : [];

    const calc = CP.pricing
      ? CP.pricing.calcOrder(order, settings)
      : { subtotal: 0, discountAmt: 0, gstAmt: 0, total: 0, advance: 0, turnaroundDays: 1 };

    const lines = [];

    // 1. Greeting & Business Identification
    const custName = customer.name ? customer.name.trim() : 'Customer';
    const bizName = business.name || 'CarbonPrints';
    lines.push(`Hello ${custName},`);
    lines.push(`Thank you for reaching out to *${bizName}*! Here is the quotation for your 3D printing request (*${order.id || 'Draft Quote'}*):`);
    lines.push('');

    // 2. Itemized parts list
    lines.push('*Part Specifications:*');
    parts.forEach((p, idx) => {
      const pName = p.name ? p.name.trim() : `Part ${idx + 1}`;
      const mat = p.material || 'PLA';
      const layer = p.layer ? `${p.layer}mm` : '0.20mm';
      const infill = (p.infillPct !== undefined && p.infillPct !== null && p.infillPct !== '')
        ? `${p.infillPct}% infill`
        : '20% infill';
      const weight = Number(p.weightG) || 0;
      const qty = Number(p.qty) || 1;
      const price = CP.pricing ? CP.pricing.partPrice(p, settings) : 0;

      lines.push(`${idx + 1}) ${pName} - ${mat}, ${layer}, ${infill}, ${weight}g x ${qty} = Rs ${price.toFixed(2)}`);
    });
    lines.push('');

    // 3. Financial Summary
    lines.push(`Subtotal: Rs ${calc.subtotal.toFixed(2)}`);

    if (calc.discountAmt > 0) {
      lines.push(`Discount (${calc.discountPct}%): -Rs ${calc.discountAmt.toFixed(2)}`);
    }

    if (settings && settings.pricing && settings.pricing.gstEnabled && calc.gstAmt > 0) {
      if (settings.pricing.interState) {
        lines.push(`IGST (${calc.gstPct}%): Rs ${calc.gstAmt.toFixed(2)}`);
      } else {
        const halfPct = (calc.gstPct / 2).toFixed(1);
        lines.push(`GST (${calc.gstPct}% - CGST ${halfPct}%, SGST ${halfPct}%): Rs ${calc.gstAmt.toFixed(2)}`);
      }
    }

    lines.push(`*Total: Rs ${calc.total.toFixed(2)}*`);

    if (calc.advance > 0) {
      lines.push(`Advance Required: Rs ${calc.advance.toFixed(2)}`);
    }

    // 4. Production lead time
    lines.push(`Estimated Turnaround: ${calc.turnaroundDays} day(s)`);
    lines.push('');

    // 5. Payment details
    if (business.upiId) {
      lines.push('*Payment via UPI:*');
      lines.push(`UPI ID: ${business.upiId}`);
      if (business.upiName) {
        lines.push(`Payee: ${business.upiName}`);
      }
      lines.push('');
    }

    // 6. Closing note
    const closing = business.footerNote
      ? business.footerNote
      : `Thank you for choosing ${bizName}. Please confirm your order to schedule printer allocation!`;
    lines.push(closing);

    return lines.join('\n');
  }
};
