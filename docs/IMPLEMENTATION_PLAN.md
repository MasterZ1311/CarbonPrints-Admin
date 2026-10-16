# CarbonPrints Company OS — Implementation Plan

This document outlines the ordered roadmap of upcoming feature enhancements, stability hardening, and architectural refinements for CarbonPrints Company OS.

---

## Phase 1: Critical Data & Pricing Integrity

### Primary Objective
Ensure financial figures, GST calculations, sequential numbering counters, and storage operations are mathematically sound, persistent, and safeguarded against data loss or corruption.

### Key Components & Scope
- **Pricing Calculation Accuracy**:
  - Audit [`js/services/pricing.js`](file:///e:/My%20Development/Robohatch-CarbonPrints/CarbonPrints%20Internal%20Web/js/services/pricing.js) (`calcOrder`, `partPrice`) to guarantee consistent rounding across subtotal, discounts, taxable amounts, and tax splits.
  - Verify strict adherence to Indian GST rounding and split rules (CGST + SGST vs. IGST).
  - Verify negative or zero values, empty parts list, and NaN prevention across all calculations.
- **Sequential Counters & Financial Year Resets**:
  - Audit [`js/core/util.js`](file:///e:/My%20Development/Robohatch-CarbonPrints/CarbonPrints%20Internal%20Web/js/core/util.js) (`nextId`) for April 1 fiscal year boundaries (`YY-YY+1`).
  - Ensure order, invoice, and delivery challan counters cannot collide or regress during concurrent tabs or restores.
- **Storage Safety & Quota Handling**:
  - Review [`js/core/store.js`](file:///e:/My%20Development/Robohatch-CarbonPrints/CarbonPrints%20Internal%20Web/js/core/store.js) for handling `QuotaExceededError` gracefully (e.g. stripping or warning about large Base64 payment images).
  - Ensure deep-merge logic in `init()` and `deepMerge()` preserves custom user settings without overwriting with defaults.
- **Order Save & State Transition Consistency**:
  - Review [`js/modules/orderdesk.js`](file:///e:/My%20Development/Robohatch-CarbonPrints/CarbonPrints%20Internal%20Web/js/modules/orderdesk.js) and [`js/modules/orders.js`](file:///e:/My%20Development/Robohatch-CarbonPrints/CarbonPrints%20Internal%20Web/js/modules/orders.js) to verify that saved orders always contain valid pricing snapshots that do not retroactively mutate if settings change later.

### Verification Strategy
- Self-test suite: `node scratch/run_tests_html.js` (Suites 1, 2, 4, 7).
- Specialized edge-case scripts for decimal rounding and financial year boundary simulation.

---

## Phase 2: Quotation Documents

### Primary Objective
Provide standardized, professional quotation documents (both screen preview and clean A4 printable layouts) in addition to the existing Tax Invoices and Delivery Challans.

### Key Components & Scope
- **Quotation Generator**:
  - Implement quotation preview and printing in [`js/services/docs.js`](file:///e:/My%20Development/Robohatch-CarbonPrints/CarbonPrints%20Internal%20Web/js/services/docs.js) (`previewQuote`, `printQuote`, `generateQuoteHTML`).
  - Include company branding, validity period (e.g., 7 or 14 days), payment terms (advance requested), bank/UPI details, and quotation footer notes.
- **Order Desk & Orders Integration**:
  - Add print/preview quotation action in [`js/modules/orderdesk.js`](file:///e:/My%20Development/Robohatch-CarbonPrints/CarbonPrints%20Internal%20Web/js/modules/orderdesk.js) directly while composing.
  - Surface a Quote Document action icon in [`js/modules/orders.js`](file:///e:/My%20Development/Robohatch-CarbonPrints/CarbonPrints%20Internal%20Web/js/modules/orders.js) alongside invoice (`📄`) and challan (`🚚`).
- **Print Stylesheet Harmonization**:
  - Validate and refine [`css/print.css`](file:///e:/My%20Development/Robohatch-CarbonPrints/CarbonPrints%20Internal%20Web/css/print.css) to ensure quotes fit cleanly onto single A4 pages without orphaned headers or cut-off tables.

### Verification Strategy
- Visual verification in browser print preview.
- Assertion checks on generated quote HTML structure, HSN codes, and UPI QR code rendering.

---

## Phase 3: Customer Autofill & Reusable Items

### Primary Objective
Speed up quote creation at the Order Desk by allowing rapid search/selection of returning customers and catalog parts.

### Key Components & Scope
- **Customer Directory & Autofill**:
  - Extract unique past customers from `cp_orders` or a dedicated customer registry.
  - Provide an inline search/autocomplete in [`js/modules/orderdesk.js`](file:///e:/My%20Development/Robohatch-CarbonPrints/CarbonPrints%20Internal%20Web/js/modules/orderdesk.js) for customer name, phone, email, and preferred category.
  - Automatically populate category discounts based on customer selection.
- **Reusable Part Templates / Catalog**:
  - Allow saving standard or recurring print jobs (e.g., standard calibration cubes, drone arms, common brackets) into a reusable template list.
  - Quick-add reusable items into the Order Desk parts table with preset material, layer height, and estimated weight.

### Verification Strategy
- Component testing of autocomplete dropdown keyboard and mouse interactions.
- Integrity test verifying that modifying an autofilled order does not corrupt historical orders for the same customer.

---

## Phase 4: Expenses & Accounts

### Primary Objective
Track workshop operational expenditures (electricity, replacement parts, maintenance supplies, rent, intern stipends) alongside revenue to provide real cash flow and net margin visibility.

### Key Components & Scope
- **Expense Store & Schema**:
  - Create `cp_expenses` storage collection with fields: `id`, `date`, `category` (Utilities, Hardware, Consumables, Rent, Misc), `amount`, `vendor`, `paymentMode`, `note`.
- **Accounts & Financial Summary**:
  - Expand [`js/modules/dashboard.js`](file:///e:/My%20Development/Robohatch-CarbonPrints/CarbonPrints%20Internal%20Web/js/modules/dashboard.js) and [`js/modules/data.js`](file:///e:/My%20Development/Robohatch-CarbonPrints/CarbonPrints%20Internal%20Web/js/modules/data.js) to incorporate expense totals into monthly P&L summaries.
  - Export Expense Register CSVs compatible with Tally / Zoho Books payment vouchers.
- **Margin Analysis Hardening**:
  - Update [`js/services/inventory-svc.js`](file:///e:/My%20Development/Robohatch-CarbonPrints/CarbonPrints%20Internal%20Web/js/services/inventory-svc.js) margin reports to reflect real material purchase costs vs. loaded operational overheads.

### Verification Strategy
- Automated unit test verifying expense addition, category filtering, and P&L balance calculation.
- CSV export formatting verification matching Tally format standards.

---

## Phase 5: Printer & Production Reliability

### Primary Objective
Strengthen farm orchestration, real-time machine telemetry, job scheduling, and failure recovery across the 10-printer fleet.

### Key Components & Scope
- **Bambu Lab LAN Bridge & OctoPrint Telemetry**:
  - Harden [`js/services/bambu.js`](file:///e:/My%20Development/Robohatch-CarbonPrints/CarbonPrints%20Internal%20Web/js/services/bambu.js), [`tools/bambu_bridge.py`](file:///e:/My%20Development/Robohatch-CarbonPrints/CarbonPrints%20Internal%20Web/tools/bambu_bridge.py), and [`js/services/octoprint.js`](file:///e:/My%20Development/Robohatch-CarbonPrints/CarbonPrints%20Internal%20Web/js/services/octoprint.js).
  - Graceful reconnection handling when network bridges or machines drop offline.
  - Automatic print completion prompts when telemetry reaches 100% or idle post-print.
- **Farm Board Workflows**:
  - Refine [`js/modules/farm.js`](file:///e:/My%20Development/Robohatch-CarbonPrints/CarbonPrints%20Internal%20Web/js/modules/farm.js) drag/assign flow and quick spool swapping.
  - Ensure scrap/failure logging properly returns items to the pending queue with reprint tags.
- **Preventative Maintenance Triggers**:
  - Ensure nozzle wear thresholds and periodic maintenance intervals in [`js/services/maint-svc.js`](file:///e:/My%20Development/Robohatch-CarbonPrints/CarbonPrints%20Internal%20Web/js/services/maint-svc.js) trigger high-visibility alerts on the farm board before prints fail.

### Verification Strategy
- Mock telemetry integration tests via `scratch/test_task11.js`.
- Bambu bridge python syntax & mock mode verification.

---

## Phase 6: Final Usability & Regression Pass

### Primary Objective
Execute complete end-to-end regression validation, PWA cache verification, file line-count compliance checks, and user experience polish.

### Key Components & Scope
- **File Length & Clean Code Compliance**:
  - Verify every JavaScript and CSS file remains within sustainable architectural limits (<= 600 lines per module).
- **Offline & PWA Verification**:
  - Increment `CACHE_VERSION` in [`service-worker.js`](file:///e:/My%20Development/Robohatch-CarbonPrints/CarbonPrints%20Internal%20Web/service-worker.js) and verify asset precache lists.
  - Confirm complete offline functionality on fresh browser profiles.
- **End-to-End Regression Suite**:
  - Run all 14 test suites in [`tests.html`](file:///e:/My%20Development/Robohatch-CarbonPrints/CarbonPrints%20Internal%20Web/tests.html).
  - Run all scratch verification suites (`test_task3.js` through `test_task11.js`).
  - Conduct full simulated workflow: Quote -> Confirm -> Farm Assign -> Print Complete -> QC -> Delivery Challan -> Payment -> Daily Backup.

### Verification Strategy
- Zero test failures across all test suites.
- Clean browser console without errors or unhandled promise rejections.
