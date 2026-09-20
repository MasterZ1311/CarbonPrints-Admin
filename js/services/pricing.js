/**
 * CarbonPrints Company OS - Pricing Engine
 * Global namespace: window.CP.pricing
 * Contains pure calculation functions with no DOM access or storage reads.
 */
window.CP = window.CP || {};

CP.pricing = {
  /**
   * Calculates line price for a single part:
   * weightG * qty * ratePerGram[material] * layerMultiplier[layer]
   * @param {Object} part - Part data
   * @param {Object} settings - cp_settings object
   * @returns {number} Rounded to 2 decimals
   */
  partPrice(part, settings) {
    if (!part) return 0;
    const weightG = Number(part.weightG) || 0;
    const qty = Number(part.qty) || 0;
    const material = part.material || 'PLA';
    const layer = String(part.layer || '0.20');

    const pricingCfg = (settings && settings.pricing) ? settings.pricing : {};
    const ratePerGramMap = pricingCfg.ratePerGram || {};
    const layerMultMap = pricingCfg.layerMultiplier || {};

    const rate = (ratePerGramMap[material] !== undefined)
      ? Number(ratePerGramMap[material])
      : 4;
    const layerMult = (layerMultMap[layer] !== undefined)
      ? Number(layerMultMap[layer])
      : 1;

    const price = weightG * qty * rate * layerMult;
    return CP.util ? CP.util.round2(price) : Math.round(price * 100) / 100;
  },

  /**
   * Calculates print duration in hours for a single part:
   * If printHoursOverride is provided as a positive number, uses it.
   * Else computes (weightG * qty) / gramsPerHour[layer].
   * @param {Object} part - Part data
   * @param {Object} settings - cp_settings object
   * @returns {number} Rounded to 2 decimals
   */
  partPrintHours(part, settings) {
    if (!part) return 0;
    if (part.printHoursOverride !== null && part.printHoursOverride !== undefined && part.printHoursOverride !== '') {
      const override = Number(part.printHoursOverride);
      if (!isNaN(override) && override > 0) {
        return CP.util ? CP.util.round2(override) : Math.round(override * 100) / 100;
      }
    }

    const weightG = Number(part.weightG) || 0;
    const qty = Number(part.qty) || 0;
    const totalWeight = weightG * qty;
    const layer = String(part.layer || '0.20');

    const prodCfg = (settings && settings.production) ? settings.production : {};
    const gramsPerHourMap = prodCfg.gramsPerHour || { "0.28": 15, "0.20": 10, "0.12": 6 };
    const speed = Number(gramsPerHourMap[layer]) || 10;

    const hours = speed > 0 ? (totalWeight / speed) : 0;
    return CP.util ? CP.util.round2(hours) : Math.round(hours * 100) / 100;
  },

  /**
   * Calculates financial totals and production estimates for an entire order.
   * @param {Object} order - Order object containing customer, parts, pricing
   * @param {Object} settings - cp_settings object
   * @returns {{
   *   subtotal: number,
   *   discountPct: number,
   *   discountAmt: number,
   *   taxable: number,
   *   gstPct: number,
   *   gstAmt: number,
   *   cgst: number,
   *   sgst: number,
   *   igst: number,
   *   total: number,
   *   advance: number,
   *   balance: number,
   *   totalPrintHours: number,
   *   longestPartHours: number,
   *   turnaroundDays: number
   * }}
   */
  calcOrder(order, settings) {
    const parts = (order && Array.isArray(order.parts)) ? order.parts : [];
    const pricingCfg = (settings && settings.pricing) ? settings.pricing : {};
    const prodCfg = (settings && settings.production) ? settings.production : {};

    // 1. Subtotal and print hours across parts
    let subtotal = 0;
    let totalPrintHours = 0;
    let longestPartHours = 0;

    parts.forEach(p => {
      const price = CP.pricing.partPrice(p, settings);
      subtotal += price;

      const hours = CP.pricing.partPrintHours(p, settings);
      totalPrintHours += hours;
      if (hours > longestPartHours) {
        longestPartHours = hours;
      }
    });

    subtotal = CP.util ? CP.util.round2(subtotal) : Math.round(subtotal * 100) / 100;
    totalPrintHours = CP.util ? CP.util.round2(totalPrintHours) : Math.round(totalPrintHours * 100) / 100;
    longestPartHours = CP.util ? CP.util.round2(longestPartHours) : Math.round(longestPartHours * 100) / 100;

    // 2. Customer category discount or explicit override
    let discountPct = 0;
    if (order && order.pricing && order.pricing.discountPct !== undefined && order.pricing.discountPct !== null && order.pricing.discountPct !== '') {
      discountPct = Number(order.pricing.discountPct) || 0;
    } else if (order && order.customer && order.customer.category) {
      const catDiscounts = pricingCfg.categoryDiscountPct || {};
      discountPct = Number(catDiscounts[order.customer.category]) || 0;
    }
    discountPct = Math.max(0, Math.min(100, discountPct));

    const discountAmt = CP.util
      ? CP.util.round2((subtotal * discountPct) / 100)
      : Math.round(((subtotal * discountPct) / 100) * 100) / 100;

    const taxable = Math.max(
      0,
      CP.util ? CP.util.round2(subtotal - discountAmt) : Math.round((subtotal - discountAmt) * 100) / 100
    );

    // 3. GST Calculation
    const gstEnabled = !!pricingCfg.gstEnabled;
    const gstPct = gstEnabled ? (Number(pricingCfg.gstPct) || 0) : 0;
    const gstAmt = gstEnabled
      ? (CP.util ? CP.util.round2((taxable * gstPct) / 100) : Math.round(((taxable * gstPct) / 100) * 100) / 100)
      : 0;

    const interState = !!pricingCfg.interState;
    let cgst = 0;
    let sgst = 0;
    let igst = 0;

    if (gstEnabled && gstAmt > 0) {
      if (interState) {
        igst = gstAmt;
      } else {
        cgst = CP.util ? CP.util.round2(gstAmt / 2) : Math.round((gstAmt / 2) * 100) / 100;
        sgst = CP.util ? CP.util.round2(gstAmt - cgst) : Math.round((gstAmt - cgst) * 100) / 100;
      }
    }

    // 4. Total, Advance & Balance
    const total = CP.util ? CP.util.round2(taxable + gstAmt) : Math.round((taxable + gstAmt) * 100) / 100;
    const advance = (order && order.pricing && order.pricing.advance !== undefined)
      ? (Number(order.pricing.advance) || 0)
      : 0;
    const balance = Math.max(
      0,
      CP.util ? CP.util.round2(total - advance) : Math.round((total - advance) * 100) / 100
    );

    // 5. Turnaround estimation
    const printHoursPerDay = Number(prodCfg.printHoursPerDay) || 16;
    const postProcessDays = Number(prodCfg.postProcessDays) || 1;
    const daySpeed = printHoursPerDay > 0 ? printHoursPerDay : 16;
    const rawDays = Math.ceil(longestPartHours / daySpeed) + postProcessDays;
    const turnaroundDays = Math.max(1, isNaN(rawDays) ? 1 : rawDays);

    return {
      subtotal,
      discountPct,
      discountAmt,
      taxable,
      gstPct,
      gstAmt,
      cgst,
      sgst,
      igst,
      total,
      advance,
      balance,
      totalPrintHours,
      longestPartHours,
      turnaroundDays
    };
  }
};
