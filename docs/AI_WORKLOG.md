# CarbonPrints Company OS — AI Worklog & Baseline Audit

This worklog records the initial repository baseline, test commands and outcomes, identified operational risks, and progress tracking across implementation phases.

---

## 1. Baseline Git Status

- **Repository Path**: `e:\My Development\Robohatch-CarbonPrints\CarbonPrints Internal Web`
- **Active Branch**: `MZ-Main`
- **Remote Tracking**: `origin/MZ-Main` (Up to date)
- **Latest Commit**:
  - Hash: `e21cfaa9efadea16cca05ff25b0334cf67f7f9f8`
  - Author: `MasterZ1311 <thenappanmasterz1311@gmail.com>`
  - Date: `Mon Oct 5 10:38:25 2026 +0530`
  - Message: `feat(bambu-integration): add bambu lab lan telemetry, slicer handoff & hardened maintenance routines`
- **Working Tree**: Clean prior to documentation phase. No untracked files or unstaged changes modified or discarded.

---

## 2. Baseline Test Execution & Verification

### Executed Tests & Syntax Audits

| Test Suite / Command | Scope / Target | Result | Details |
|---|---|---|---|
| `python -m py_compile tools/bambu_bridge.py` | Python syntax compilation | **PASS** | Exit code 0, no syntax errors. |
| `Get-ChildItem -Path js,service-worker.js -Recurse -Filter *.js \| ForEach-Object { node --check $_.FullName }` | Full JavaScript syntax validation | **PASS** | Checked all 26 `.js` files. All passed without parse errors. |
| `node scratch/run_tests_html.js` | Quality Pass Self-Test Suite (`tests.html`) in Node sandbox | **PASS** | 27 of 27 tests passed across 14 suites. |
| `node scratch/test_task3.js` | Core store, router & initial seeders | **PASS** | All assertions passed. |
| `node scratch/test_task4.js` | Pricing calculations & order totals | **PASS** | All assertions passed. |
| `node scratch/test_task5.js` & `test_task5_complete.js` | Spool stock & material threshold logic | **PASS** | All assertions passed. |
| `node scratch/test_task6.js` | QC tolerance logic, scrap rate thresholds, failure events | **PASS** | All assertions passed. |
| `node scratch/test_task7.js` | Extrusion telemetry, nozzle wear limits, maintenance checklist | **PASS** | All assertions passed. |
| `node scratch/test_task8.js` | Dashboard KPIs, reactive updates, empty data resiliency | **PASS** | All assertions passed. |
| `node scratch/test_task9.js` | Data export/import, backup validation, Tally/Zoho CSV registers | **PASS** | 43 of 43 assertions passed. |
| `node scratch/test_task10.js` | PWA manifest, service worker precache, strict <= 600 line limit check | **PASS** | 91 of 91 assertions passed. |
| `node scratch/test_task11.js` | OctoPrint & Bambu telemetry, URL cleanup, mock server responses | **PASS** | 34 of 34 assertions passed. |

### Tests Not Executed (Identified & Deferred)
- **Live Hardware Telemetry**: Live MQTT connection to real Bambu Lab hardware on port 8883 and OctoPrint HTTP requests to physical Raspberry Pi printers were not executed (physical workshop devices). Mock server and unit isolation tests were executed instead.
- **Interactive Browser Print Dialog**: Native OS `window.print()` rendering was not dispatched to physical printers during CLI execution.
- **WhatsApp Web API Transmission**: Dispatching actual messages through `https://wa.me` was validated at the link generation level; live WhatsApp Web session routing was not performed.

---

## 3. Known Architecture & Operational Risks

1. **Browser LocalStorage Quota (~5MB Limit)**:
   - All database collections live in browser `localStorage`. Storing full-resolution Base64 payment proof images can exhaust storage quota.
   - *Mitigation*: Canvas image resizing/downscaling in [`js/modules/orders.js`](file:///e:/My%20Development/Robohatch-CarbonPrints/CarbonPrints%20Internal%20Web/js/modules/orders.js) and quota detection toast notifications.
2. **Single-Device Offline Data Isolation**:
   - There is no background cloud database. Data is isolated to the specific browser and machine profile.
   - *Mitigation*: Staff SOP mandates daily end-of-day JSON backups (`#/data`) uploaded to company Google Drive. Pre-restore safety snapshots are automatically generated.
3. **Strict File Size Constraints (<= 600 Lines)**:
   - Modules are architecturally constrained to remain <= 600 lines to avoid monolithic bloat and ensure fast PWA startup.
   - *Mitigation*: Complex business logic is factored into `js/services/` leaving `js/modules/` focused purely on rendering and user interaction.
4. **HTTPS Mixed Content Block for Workshop Telemetry**:
   - When deployed on HTTPS (e.g., GitHub Pages), modern browsers block HTTP requests to local IP addresses (`192.168.x.x` or `127.0.0.1:5005`).
   - *Mitigation*: Clear UI alerts and SOP documentation instructing staff to use `file://` or local HTTP (`http://localhost:8000`) on workshop terminals.
5. **Aggressive Cache-First Service Worker**:
   - The PWA precaches assets aggressively for instant offline load. Unversioned updates will not appear on clients.
   - *Mitigation*: `CACHE_VERSION` in [`service-worker.js`](file:///e:/My%20Development/Robohatch-CarbonPrints/CarbonPrints%20Internal%20Web/service-worker.js) must be incremented whenever code or styles are modified.

---

## 4. Phase Checklist

- [x] **Phase 0: Codebase Mapping & Baseline Verification**
  - Git status check and preservation.
  - Project documentation review (`README.md`, `PRELAUNCH_CHECKLIST.md`, `DEPLOYMENT.md`, `STAFF_SOP.md`, `index.html`).
  - Establishment of `docs/CODE_MAP.md`, `docs/IMPLEMENTATION_PLAN.md`, and `docs/AI_WORKLOG.md`.
  - JS/Python syntax check & lightweight test baseline verification.
- [x] **Phase 1: Critical Data & Pricing Integrity**
  - Persistence errors reach callers: storage failures throw with quota metadata; callers never display false success.
  - Pricing defaults aligned with PRELAUNCH_CHECKLIST.md (PLA ₹4, ABS ₹5, TPU ₹6; layers 0.28: 0.85x, 0.20: 1.00x, 0.12: 1.40x; GST 18% enabled).
  - Snapshotting: Line item rates and order totals snapshot on save/acceptance; historical quotes/invoices preserved when Settings change; explicit reprice action provided.
  - Quote vs Invoice separation: Quotes use `CP-QT-YYYY-XXXX`; Invoices use `${prefix}/${fy}/XXXX` with custom prefix and collision prevention; viewing quotes never issues invoice numbers.
  - Numeric zero values: Legitimate `0` values preserved (buffer days, low stock alert, scrap target, category discounts) instead of falling back to defaults.
  - Reset data audit: Implemented Safe Reset (clears operational data, preserves business settings & printers) alongside Full Factory Reset (with safety backup download).
  - Schema v2 migration: Idempotent migration preserving orders, stock, payments, and settings.
- [x] **Phase 2: Quotation Documents**
  - Dedicated formal quotation HTML template with configured business letterhead/logo, quotation number, validity (+15 days), part specifications, unit rates (₹/g), line totals, subtotal, discount, taxes, quotation total, amount in words, payment terms (UPI ID, advance requirement), and customer acceptance signature blocks.
  - Clean omission of empty optional fields (notes, discount, advance, taxes, phone, email, GSTIN).
  - Use of snapshotted pricing and tax rates saved on the quotation; safe fallback for legacy orders without silent mutation.
  - Quotation preview modal and browser print flow with honest "Print / Save as PDF" labeling; quote preview/print never assigns an invoice number or alters order/payment state.
  - Added quotation preview action in Orders & Billing list (`📜`) and Order Desk (`📜 Preview Quote`).
  - Strict `<= 600` lines maintained across all files (`docs.js`: 550, `orders.js`: 529, `orderdesk.js`: 594).
- [x] **Phase 3: Customer Autofill & Reusable Items**
  - Local Customer Master (`cp_customers`) with stable IDs, phone normalization, email, category, address, GSTIN.
  - Duplicate detection by normalized phone/email with operator resolution confirmation.
  - Idempotent `learnFromOrders()` populating missing customers without deleting/rewriting order history; strictly preserves distinction between similar names.
  - Order Desk customer search/autocomplete via native `<datalist>` with conflict prompt to prevent accidental field overwrite.
  - Reusable part blueprint templates (`cp_part_templates`) with template selector modal and inline row template save (`⭐`). Templates store physical specs only and never fix or overwrite quote prices.
  - "Quick Quote" default view with `#`, `Part Name`, `Material`, `Weight`, `Qty`, `Price`, and expandable `[⚙️ Advanced Specs]` section.
  - Duplicating previous orders into fresh draft quotes (`📑`) from both Orders list and Order Desk.
  - Configurable customer categories dynamically resolved from Settings discount definitions.
- [x] **Phase 4: Expenses & Accounts**
  - Workshop operational expense tracking (`cp_expenses`) with stable sequential IDs (`CP-EXP-YYYY-XXXX`).
  - Configurable starter categories (Rent, Utilities, Material Stock, Maintenance, Packaging, Transport, Tools, Workshop Supplies, Other).
  - Monthly cash movement calculation (Payments Received minus Expenses) distinctly separated from invoiced revenue and never labeled as net profit.
  - Safe all-or-nothing CSV import/export and backward-compatible JSON backup/restore.
- [x] **Phase 5: Printer & Production Reliability**
  - Production board state machine transitions: validated assignment guards (idle printer, pending part, confirmed/printing order), `jobRunId` lifecycle tracking, completion to post-processing, and failure to reprint/maintenance error routing.
  - Truthful Bambu bridge calls: checks both HTTP status and response body (`launched: true`), surfaces actionable errors, masks LAN Access Code (`type="password"`).
  - Direct connection path: wired `testConnection` to `POST /api/connect` on bridge with validation and telemetry polling.
  - Transparent manual slicer handoff modal with copyable slicing parameters and plain-text `.txt` job ticket download (eliminated false .3mf XML claims).
  - Bridge security: restricted binding strictly to loopback (`127.0.0.1`), validated IPv4/serial/code inputs, restricted CORS to loopback origins, and supported optional token auth.
  - Exactly-once material deductions and scrap tracking per job run (`jobRunId`), cleanly supporting reprints.
- [x] **Phase 6: Final Usability & Regression Pass**
  - Accessibility & Polish: Added `aria-label` to icon-only table actions in `orders.js` and `orderdesk.js`.
  - Comprehensive end-to-end release readiness pipeline (`scratch/test_phase6.js`): Customer -> Quick Quote -> Quote PDF/Print -> Settings Change Independence -> Invoice Assignment -> Payment -> Expense Entry & Cash Movement -> JSON Export & Clean Restore -> Bridge Failure & Transparent Handoff -> Farm Assignment -> Failure / Scrap / Reprint -> Completion & QC (55 of 55 tests passed).
  - Documentation and prelaunch checklist synchronized with actual implementation (`README.md`, `PRELAUNCH_CHECKLIST.md`).
  - Strict `<= 600` line count verification across all 19 `.js` files.
  - Final readiness evaluation: **READY FOR CONTROLLED LOCAL PILOT**.

---

## 5. Phase 1 Implementation Summary & Audit Results

### Changed Files
1. [`PRELAUNCH_CHECKLIST.md`](file:///e:/My%20Development/Robohatch-CarbonPrints/CarbonPrints%20Internal%20Web/PRELAUNCH_CHECKLIST.md): Clarified Step 5 to specify "Safe Reset (Clear Operational Data)" preserving business profile and printer slots.
2. [`js/core/defaults.js`](file:///e:/My%20Development/Robohatch-CarbonPrints/CarbonPrints%20Internal%20Web/js/core/defaults.js): Reconciled pricing defaults (PLA: 4, ABS: 5, TPU: 6; layer multipliers: 0.28: 0.85, 0.20: 1.00, 0.12: 1.40; gstEnabled: true, requiresOwnerConfirmation: true, schemaVersion: 2).
3. [`js/core/store.js`](file:///e:/My%20Development/Robohatch-CarbonPrints/CarbonPrints%20Internal%20Web/js/core/store.js): `set()` throws structured `storageError` with quota metadata; non-destructive `init()`; added `has()`; idempotent `runMigrations()` for schema v2 and order snapshotting.
4. [`js/core/util.js`](file:///e:/My%20Development/Robohatch-CarbonPrints/CarbonPrints%20Internal%20Web/js/core/util.js): Separate `nextId('quote')` (`CP-QT-YYYY-XXXX`) and `nextId('invoice')` (`${prefix}/${fy}/XXXX`); custom invoice prefix support with collision prevention and backward-compatible counter lookup.
5. [`js/services/pricing.js`](file:///e:/My%20Development/Robohatch-CarbonPrints/CarbonPrints%20Internal%20Web/js/services/pricing.js): Honors snapshotted `ratePerGram`, `layerMultiplier`, `linePrice`, tax rates; tags calculations `isSnapshotted: true`; supports `forceReprice: true`.
6. [`js/services/docs.js`](file:///e:/My%20Development/Robohatch-CarbonPrints/CarbonPrints%20Internal%20Web/js/services/docs.js): `ensureInvoiceNo()` returns `null` for quotes (prevents issuing invoice numbers on quote preview/print); uses snapshotted line prices and rates in invoice HTML; exports document utilities.
7. [`js/modules/orderdesk.js`](file:///e:/My%20Development/Robohatch-CarbonPrints/CarbonPrints%20Internal%20Web/js/modules/orderdesk.js): Generates separate quote IDs; snapshots line items and totals on save; added explicit `btn-reprice-order` button; wraps storage calls in error-handling toasts; strictly <= 600 lines (590 lines).
8. [`js/modules/orders.js`](file:///e:/My%20Development/Robohatch-CarbonPrints/CarbonPrints%20Internal%20Web/js/modules/orders.js): Storage errors during payment recording or status changes catch and abort (never report false success); strictly <= 600 lines (527 lines).
9. [`js/modules/settings.js`](file:///e:/My%20Development/Robohatch-CarbonPrints/CarbonPrints%20Internal%20Web/js/modules/settings.js): Added `parseNum` helper preserving legitimate `0` values (`postProcessDays: 0`, `lowStockThresholdG: 0`, `scrapTargetPct: 0`, `categoryDiscountPct: 0`); added owner confirmation banner; separate Safe Reset and Full Factory Reset buttons; strictly <= 600 lines (596 lines).
10. [`js/core/dev.js`](file:///e:/My%20Development/Robohatch-CarbonPrints/CarbonPrints%20Internal%20Web/js/core/dev.js): Added `safeReset()` (preserves `cp_settings`, `cp_printers`, `cp_maint_tasks`; clears operational collections); updated `fullReset()` with pre-reset safety backup download.

### Tests Executed & Outcomes
- `node scratch/test_phase1.js`: **45 PASSED, 0 FAILED** (tested storage errors, payment persistence failure, historical totals preservation, quote vs invoice IDs, prefix handling, zero settings preservation, safe vs full reset, and idempotent v2 migration).
- `node scratch/test_task10.js`: **91 PASSED, 0 FAILED** (confirmed all 18 JS modules strictly comply with `<= 600 lines` limit and all PWA manifest/precache assets pass).
- `node scratch/run_tests_html.js`: **27 PASSED, 0 FAILED** (Quality Pass Self-Test Suite in `tests.html`).
- `node --check` across all JS files: **PASS** (Zero syntax errors).

### Unresolved Decisions & Confirmations Required
- **Owner & CA Rate Confirmation**: Benchmark rates (PLA ₹4/g, ABS ₹5/g, TPU ₹6/g, 18% GST) are active in defaults with `requiresOwnerConfirmation: true`. Final commercial confirmation by the business owner and Chartered Accountant remains pending before issuing live GST invoices to customers.

---

## 6. Phase 2 Implementation Summary & Dedicated Quotation Audit Results

### Changed Files
1. [`js/services/docs.js`](file:///e:/My%20Development/Robohatch-CarbonPrints/CarbonPrints%20Internal%20Web/js/services/docs.js):
   - Added `generateQuoteHTML(order, settings)` implementing dedicated formal A4 letterhead layout (business logo/details, quotation ID, date, 15-day validity, lead time, customer details, part specs, weight, unit rates in ₹/g, line prices, subtotal, discount, CGST/SGST/IGST tax splits, total, total in words, UPI ID, advance requirements, and customer approval/signature block).
   - Added `previewQuote(orderOrId)` and `printQuote(orderOrId)`.
   - Updated `previewInvoice` and `printInvoice` so quotes never receive an invoice number.
   - Preserves historical snapshotted pricing (`isSnapshotted`) and tax settings; uses non-destructive in-memory fallback for legacy orders without mutating storage.
   - Factored shared `formatTaxRows` and `formatDiscountRow` helpers and compacted HTML row interpolation to keep file size strictly `<= 600 lines` (550 lines).
2. [`js/modules/orders.js`](file:///e:/My%20Development/Robohatch-CarbonPrints/CarbonPrints%20Internal%20Web/js/modules/orders.js):
   - Added `📜` quotation preview action button (`.btn-quote-order`) in order table rows.
   - Bound click delegation to `CP.docs.previewQuote(order.id)`.
   - File size maintained strictly `<= 600 lines` (529 lines).
3. [`js/modules/orderdesk.js`](file:///e:/My%20Development/Robohatch-CarbonPrints/CarbonPrints%20Internal%20Web/js/modules/orderdesk.js):
   - Added `📜 Preview Quote` button (`#btn-preview-quote`) in header action bar.
   - Bound click event to `CP.docs.previewQuote(readFormData())`, enabling on-the-fly preview and print of unsaved quote drafts directly from active form inputs without altering storage.
   - File size maintained strictly `<= 600 lines` (594 lines).
4. [`css/print.css`](file:///e:/My%20Development/Robohatch-CarbonPrints/CarbonPrints%20Internal%20Web/css/print.css):
   - Added `.quote-doc` specific styling accents (`.doc-title-badge`, `.doc-biz-name`, `.doc-divider` in `#0284c7`).
   - Retained high-contrast monochrome overrides in `@media print` for crisp physical printing and PDF export.
5. [`tests.html`](file:///e:/My%20Development/Robohatch-CarbonPrints/CarbonPrints%20Internal%20Web/tests.html):
   - Added Suite 15: "Dedicated Quotation Documents & Snapshots" verifying quote generation, invoice number exclusion, and historical snapshotted rate preservation.
6. [`scratch/test_phase2.js`](file:///e:/My%20Development/Robohatch-CarbonPrints/CarbonPrints%20Internal%20Web/scratch/test_phase2.js):
   - Comprehensive Phase 2 test suite covering letterhead layout, quote/invoice ID separation, historical snapshot preservation against settings changes, legacy fallback without storage mutation, clean omission of empty optional fields, in-memory draft quoting, and print CSS selectors.

### Tests Executed & Outcomes
- `node scratch/test_phase2.js`: **57 PASSED, 0 FAILED** (Dedicated Quotation Documents Test Suite).
- `node scratch/test_phase1.js`: **45 PASSED, 0 FAILED** (Critical Data Integrity Regression Suite).
- `node scratch/test_task10.js`: **91 PASSED, 0 FAILED** (PWA, offline precache assets, and line count validation).
- `node scratch/run_tests_html.js`: **29 PASSED, 0 FAILED** (In-browser self-test suite including new Suite 15).
- `node --check` across modified files: **PASS** (Zero syntax errors).
- Strict line count validation:
  - `js/services/docs.js`: 550 lines (<= 600)
  - `js/modules/orders.js`: 529 lines (<= 600)
  - `js/modules/orderdesk.js`: 594 lines (<= 600)

### Unperformed Testing (Explicitly Recorded)
- **Browser Visual Layout Testing**: End-to-end visual inspection of printed paper sheet output in Chrome/Firefox/Edge print preview dialogs and physical paper printing was **marked unperformed** per test protocol guidelines. Automated DOM structure, CSS selector, and attribute validation tests were executed and passed.
- **Offline PDF Generation**: In accordance with offline-first requirements, no CDN PDF library was introduced; standard browser print with "Save as PDF" was implemented and honestly labeled.

---

## 7. Phase 3 Implementation Summary & Repetitive Data Entry Audit Results

### Changed Files
1. [`js/services/customer-svc.js`](file:///e:/My%20Development/Robohatch-CarbonPrints/CarbonPrints%20Internal%20Web/js/services/customer-svc.js) *(New - 340 lines)*:
   - Local customer master (`cp_customers`): CRUD (`getAll`, `getById`, `findByPhone`, `findDuplicates`, `save`, `remove`, `search`).
   - Normalization & validation: 10-digit Indian phone normalization via `CP.wa.cleanPhone`, email trimming and lowercasing, GSTIN uppercasing.
   - Duplicate prevention & resolution: Blocks accidental overwrite when a phone is registered to a different name unless operator confirms (`allowNameChange: true`).
   - Idempotent `learnFromOrders()`: Populates customer master from existing `cp_orders` without touching order history; strictly preserves distinct customer identities (never merges on matching names).
   - Reusable part blueprint templates (`cp_part_templates`): Full template CRUD, default seeding (Calibration Cube, Enclosure Shell, Strength Bracket, Flexible Gasket), blueprint picker modal (`openTemplatePicker`), and `createPartFromTemplate`. Invariant enforced: templates store physical specs only and never freeze or overwrite quote prices.
   - Order cloning helper (`cloneOrder`): Resets order ID, timestamps, invoices/challans, payment, and unfreezes pricing snapshots.
   - Dynamic categories: `getCategories(settings)` dynamically pulls categories from `settings.pricing.categoryDiscountPct`.
2. [`js/modules/orderdesk.js`](file:///e:/My%20Development/Robohatch-CarbonPrints/CarbonPrints%20Internal%20Web/js/modules/orderdesk.js) *(592 lines <= 600)*:
   - Autocomplete & search: Linked customer name and phone inputs to native `<datalist>` elements (`#cust-name-list`, `#cust-phone-list`) populated from `CP.customers.getAll()`.
   - Conflict-safe autofill: Detects if operator already entered conflicting data before autofilling and prompts confirmation (`CP.ui.confirm`).
   - Inline customer save: Added `[💾 Save Customer]` action (`#btn-save-cust`) with duplicate resolution prompt. Auto-saves customer record upon order confirmation.
   - Quick Quote default view: Default view displays `#`, `Part Name`, `Material`, `Weight (g)`, `Qty`, `Price`, `Actions`. Advanced specifications (`Layer Height`, `Infill %`, `Hours Override`) are placed in an expandable section toggled via `[⚡ Quick View]` / `[⚙️ Advanced Specs]`. Full access to all fields is retained.
   - Part blueprint templates: Added `[📂 Template]` modal action in parts table header, plus row-level save as template action (`⭐` `.btn-save-tmpl`).
   - Quote duplication: Added `[📑 Duplicate Quote]` button (`#btn-duplicate-order`) in header action bar.
   - Compacted HTML and event handling to maintain line count strictly `<= 600` (592 lines).
3. [`js/modules/orders.js`](file:///e:/My%20Development/Robohatch-CarbonPrints/CarbonPrints%20Internal%20Web/js/modules/orders.js) *(539 lines <= 600)*:
   - Added duplicate order action (`📑` `.btn-dup-order`) in order table rows calling `duplicateOrder(order)`. Clones order into `cp_draft_order` and navigates to `#/order-desk`.
   - Replaced hardcoded category array with dynamic `CP.customers.getCategories()`.
4. [`js/core/dev.js`](file:///e:/My%20Development/Robohatch-CarbonPrints/CarbonPrints%20Internal%20Web/js/core/dev.js) *(208 lines <= 600)*:
   - Relocated 27-line demo order seeder from `orderdesk.js` to `dev.js` (`CP.dev.seedDemoOrders`), keeping `orderdesk.js` clean and within file limits.
5. [`index.html`](file:///e:/My%20Development/Robohatch-CarbonPrints/CarbonPrints%20Internal%20Web/index.html), [`service-worker.js`](file:///e:/My%20Development/Robohatch-CarbonPrints/CarbonPrints%20Internal%20Web/service-worker.js), [`tests.html`](file:///e:/My%20Development/Robohatch-CarbonPrints/CarbonPrints%20Internal%20Web/tests.html):
   - Registered `js/services/customer-svc.js` across main application, PWA offline precache asset list, and test runners.
6. [`scratch/test_phase3.js`](file:///e:/My%20Development/Robohatch-CarbonPrints/CarbonPrints%20Internal%20Web/scratch/test_phase3.js) *(New - 245 lines)*:
   - Dedicated automated test suite covering all 7 Phase 3 requirements.

### Tests Executed & Outcomes
- `node scratch/test_phase3.js`: **54 PASSED, 0 FAILED** (Customer master CRUD, duplicate prevention & resolution, idempotent `learnFromOrders`, search/autocomplete, templates & price invariance, order duplication, dynamic categories).
- `node scratch/test_phase1.js`: **45 PASSED, 0 FAILED** (Phase 1 Data Integrity Regression Suite).
- `node scratch/test_phase2.js`: **57 PASSED, 0 FAILED** (Phase 2 Dedicated Quotations Regression Suite).
- `node scratch/test_task10.js`: **92 PASSED, 0 FAILED** (PWA offline assets, service worker, strict <= 600 line limit check).
- `node scratch/run_tests_html.js`: **32 PASSED, 0 FAILED** (In-browser self-test suite including new Suite 12).
- `node --check` across all JS files: **PASS** (Zero syntax errors).
- Strict line count verification (strictly <= 600 lines per file):
  - `js/services/customer-svc.js`: 340 lines (<= 600)
  - `js/modules/orderdesk.js`: 592 lines (<= 600)
  - `js/modules/orders.js`: 539 lines (<= 600)
  - `js/core/dev.js`: 208 lines (<= 600)
  - `js/services/docs.js`: 550 lines (<= 600)

### Unresolved Decisions & Documented Limitations
- **Customer Identity Invariant**: Identity is strictly anchored to normalized 10-digit Indian mobile numbers (`cleanPhone`). Two orders with name "Rahul" but different phone numbers are treated as distinct individuals; they are never merged by name.
- **Dynamic Customer Categories**: Customer categories are dynamically sourced from `settings.pricing.categoryDiscountPct`. Modifying categories in Settings automatically updates the dropdowns across Order Desk and Orders without requiring a generic configuration engine.
- **Local-First Autocomplete**: Native `<datalist>` elements are used for customer search and phone suggestions—providing lightweight, accessible, offline-first autocomplete without external UI libraries or CSS bloat.

---

## 8. Phase 4 Implementation Summary & Operational Expenses Audit Results

### Changed Files
1. [`js/services/expense-svc.js`](file:///e:/My%20Development/Robohatch-CarbonPrints/CarbonPrints%20Internal%20Web/js/services/expense-svc.js) *(New - 395 lines <= 600)*:
   - Full CRUD: `getAll()`, `getById(id)`, `save(expense)`, `remove(id)`.
   - Sequential ID assignment (`CP-EXP-YYYY-XXXX`) via `CP.util.nextId('expense')` with deduplication against existing records.
   - Comprehensive validation: enforces valid `YYYY-MM-DD` date, non-empty payee and description, and strictly positive numeric amount (`> 0`).
   - Starter categories: 9 practical categories (`Rent`, `Electricity & Utilities`, `Filament & Material Stock`, `Maintenance & Spares`, `Packaging & Shipping`, `Transport & Delivery`, `Tools & Software`, `Workshop Supplies`, `Other`) with extensible resolution via `getCategories(settings)`.
   - Advanced multi-criteria filtering: query across payee, description, reference, notes, and linked order ID, plus category, payment mode, and date range.
   - Metrics & Summaries: `getMonthTotal(year, monthIdx)`, `getCashMovement(year, monthIdx)` (Customer Payments Received minus Expenses), and `computeSummary(list)` (record count, total amount, category breakdown).
   - Safe All-Or-Nothing CSV Import: `validateAndImportCSV(csvText, mode)`. Validates all rows for positive amount and YYYY-MM-DD date before any write occurs. If any row is corrupt, the entire import aborts and existing records in `localStorage` remain untouched.
   - Standard RFC 4180 CSV Export: `exportCSV(expensesList, filename)`.
2. [`js/modules/expenses.js`](file:///e:/My%20Development/Robohatch-CarbonPrints/CarbonPrints%20Internal%20Web/js/modules/expenses.js) *(New - 438 lines <= 600)*:
   - Route `#/expenses`, navigation sidebar item (`💸 Expenses`).
   - KPI Banner: Displays Cash Received (Month), Expenses (Month), Cash Movement (Month) with explanatory subtext "Receipts - Expenses (not net profit)", and Filtered Total.
   - Filter Toolbar: Debounced search, category dropdown, payment mode dropdown, start/end date selectors, and clear filters action.
   - Responsive Data Table: Shows Expense ID, Date, Category badge, Payee, Description, Mode & Ref, Linked Order/Printer, Amount in ₹, and Edit/Delete actions.
   - Modal Form: Add / Edit modal with real-time validation toasts, receipt reference text input, linked order selector, and modal dismissal.
   - Native confirmation dialog (`CP.ui.confirm`) before deletion.
3. [`js/modules/dashboard.js`](file:///e:/My%20Development/Robohatch-CarbonPrints/CarbonPrints%20Internal%20Web/js/modules/dashboard.js) *(589 lines <= 600)*:
   - Factored and compacted Quick Actions and farm glance tile markup to preserve headroom.
   - Added Quick Action button: `💸 Add Expense` (`#dash-btn-record-expense`).
   - Updated KPI computation: Calculates `revenueThisMonth` (actual recorded customer payments in period), `invoicedThisMonth` (total of invoices issued in period), `expensesThisMonth`, and `cashMovement`.
   - Updated KPI card: `kpi-card-revenue` displays Cash Received (Month) with invoiced comparison; added dedicated `kpi-card-cash-movement` card with subtitle "(Receipts - Expenses, not net profit)".
   - Reactive bus subscriptions: Listens to `expenses:changed` and `store:cp_expenses` to trigger live re-renders.
4. [`js/modules/data.js`](file:///e:/My%20Development/Robohatch-CarbonPrints/CarbonPrints%20Internal%20Web/js/modules/data.js) *(577 lines <= 600)*:
   - Compacted CSV header arrays across operational exporters.
   - Updated `getCounts()` to include `expenses: (CP.store.get('cp_expenses', []) || []).length`.
   - Updated `validateBackup()` to recognize `cp_expenses`.
   - Updated `restoreBackup()`: In replace mode, defaults `cp_expenses` to `[]` if missing in legacy backup files; in merge mode, includes `'cp_expenses'` in deduplication loop.
   - Added `exportExpensesCSV(start, end)` and registered Expenses export card in operational downloads grid.
5. [`js/core/util.js`](file:///e:/My%20Development/Robohatch-CarbonPrints/CarbonPrints%20Internal%20Web/js/core/util.js) *(347 lines <= 600)*:
   - Added sequential ID generator for `kind === 'expense'` (`CP-EXP-YYYY-XXXX`) with deduplication against existing items in `cp_expenses`.
6. [`js/core/store.js`](file:///e:/My%20Development/Robohatch-CarbonPrints/CarbonPrints%20Internal%20Web/js/core/store.js) *(451 lines <= 600)*:
   - Added `safeInitKey('cp_expenses', [])` to `init()`.
7. [`js/core/dev.js`](file:///e:/My%20Development/Robohatch-CarbonPrints/CarbonPrints%20Internal%20Web/js/core/dev.js) *(209 lines <= 600)*:
   - Added `'cp_expenses'` to operational collections wiped during `safeReset()`.
8. [`index.html`](file:///e:/My%20Development/Robohatch-CarbonPrints/CarbonPrints%20Internal%20Web/index.html) & [`service-worker.js`](file:///e:/My%20Development/Robohatch-CarbonPrints/CarbonPrints%20Internal%20Web/service-worker.js):
   - Added sidebar navigation link `#/expenses`.
   - Added `<script>` tags for `js/services/expense-svc.js` and `js/modules/expenses.js`.
   - Bumped `CACHE_VERSION` to `'cp-os-v8'` and added both files to `PRECACHE_ASSETS`.
9. [`tests.html`](file:///e:/My%20Development/Robohatch-CarbonPrints/CarbonPrints%20Internal%20Web/tests.html):
   - Included `js/services/expense-svc.js`.
   - Added Suite 13: "Phase 4: Expenses & Accounts, Cash Movement & CSV Validation" with 5 automated test cases.
10. [`scratch/test_phase4.js`](file:///e:/My%20Development/Robohatch-CarbonPrints/CarbonPrints%20Internal%20Web/scratch/test_phase4.js) *(New - 337 lines)*:
    - 48 test assertions covering CRUD, validations, search/date filtering, monthly totals, cash movement, backward-compatible backup restore, all-or-nothing CSV import, and quota handling.

### Tests Executed & Outcomes
- `node scratch/test_phase4.js`: **48 PASSED, 0 FAILED** (Expenses CRUD, validation, search/filtering, monthly cash movement, legacy backup restore, all-or-nothing CSV import, quota error surfacing).
- `node scratch/run_tests_html.js`: **37 PASSED, 0 FAILED** (tests.html execution via Node sandbox including Suite 13).
- `node scratch/test_task10.js`: **94 PASSED, 0 FAILED** (PWA manifest, precache asset resolution, and strict `<= 600 lines` verification across all 19 JS files).
- `node scratch/test_phase1.js`: **45 PASSED, 0 FAILED** (Phase 1 Data Integrity Regression Suite).
- `node scratch/test_phase2.js`: **57 PASSED, 0 FAILED** (Phase 2 Dedicated Quotations Regression Suite).
- `node scratch/test_phase3.js`: **54 PASSED, 0 FAILED** (Phase 3 Customer & Template Regression Suite).
- `node --check` across all JS files: **PASS** (Zero syntax errors).
- Strict line count verification (strictly <= 600 lines per file):
  - `js/services/expense-svc.js`: 395 lines (<= 600)
  - `js/modules/expenses.js`: 438 lines (<= 600)
  - `js/modules/dashboard.js`: 589 lines (<= 600)
  - `js/modules/data.js`: 577 lines (<= 600)
  - `js/core/store.js`: 451 lines (<= 600)
  - `js/core/util.js`: 347 lines (<= 600)
  - `js/core/dev.js`: 209 lines (<= 600)

### Architectural Decisions & Documented Limitations
- **Cash Movement vs Profit Invariant**: Invoiced revenue represents billed sales, not necessarily collected money. Cash Received reflects customer payments actually recorded in `order.payments` during the period. Cash movement is calculated strictly as `Payments Received - Expenses Recorded`. It is explicitly labeled in the UI as "Cash Movement (This Month) - Receipts - Expenses (not net profit)" to prevent misleading accounting claims. Stock purchases are recorded as cash outflows when bought; they are not double-counted or treated as job-level COGS without a full inventory-consumption accounting integration.
- **Storage Safety for Receipts**: Image blobs or full-resolution photos of receipts are strictly prohibited from `localStorage` to safeguard the 5MB browser quota. A clean string `receiptRef` (e.g. invoice/bill voucher number or file path) is provided instead.
- **Safe All-Or-Nothing CSV Import**: To prevent corrupt or partial imports from contaminating the operational database, `validateAndImportCSV` runs a complete dry-run validation pass over all rows. If even a single row has an invalid date or non-positive amount, the entire import aborts with a clear descriptive error, leaving existing stored records completely untouched.
- **Backward-Compatible Backup Restores**: Older JSON backups that lack the `cp_expenses` key restore seamlessly by initializing an empty array, avoiding errors or incomplete restores.

---

## 9. Phase 5 Implementation Summary & Audit Results

### Scope & Invariants
1. **Production State Machine Integrity**:
   - Prevented impossible transitions: assigning to non-idle printers, assigning non-pending parts, or assigning parts from unconfirmed orders.
   - Assigned jobs receive a unique `jobRunId` (`${orderId}_${partId}_${Date.now()}`), uniquely identifying each physical print attempt.
   - Completion transitions printer to `'post'` (post-processing) with a clear operator action to return to `'idle'`.
   - Failure transitions part back to `'pending'` in the queue for reprint, while nozzle clogs set printer status to `'error'` requiring an operator "Clear Error" action.
2. **Truthful Bridge Communication**:
   - Bridge calls evaluate both HTTP status (`res.ok`) and JSON payload (`data.launched === true`, `data.status === 'success'`).
   - A 200 HTTP response is not treated as proof of Bambu Studio launching when the executable is missing.
   - Actionable status reporting: unauthorized MQTT connections prompt for LAN Access Code; offline bridges prompt to run the bridge script.
3. **Connection Flow Wiring**:
   - Wired `testConnection` to `POST /api/connect` on the local bridge with IP, LAN access code, and serial number.
   - Validates required fields before dispatch and parses live telemetry directly from the bridge.
   - Masked LAN Access Code input field in the UI with `type="password"`.
4. **Transparent Slicer Handoff (No Fake .3MF XML)**:
   - Eliminated dummy XML masquerading as `.3mf` files (real 3MF files are OPC ZIP packages).
   - Replaced with a transparent manual slicer handoff modal (`openSlicerHandoffModal`) displaying verified slice specifications, a one-click clipboard copy button, and a plain-text `.txt` job ticket download.
5. **Bridge Security & Input Validation**:
   - `tools/bambu_bridge.py`: Clamped `--host` strictly to loopback (`127.0.0.1`, `localhost`, `::1`). Non-loopback addresses are rejected.
   - CORS origin enforcement: dynamically restricts responses to loopback and `file://` (`null`) origins, rejecting external web origins with HTTP 403 Forbidden.
   - Added optional token authentication via `--token` and `BAMBU_BRIDGE_TOKEN` env var, verified through `X-Bridge-Token` or `Authorization: Bearer <token>`.
   - Sanitized input on `/api/connect`: validates IPv4 address format via Python `ipaddress.IPv4Address`, validates serial alphanumeric format, requires access code length >= 4, and avoids logging credentials.
6. **Exactly-Once Deductions & Reprint Support**:
   - Updated event deduplication in `inventory-svc.js`, `scrap-svc.js`, and `maint-svc.js` to key on `payload.jobRunId`.
   - Prevents duplicate deductions if a completion event is processed multiple times, while cleanly deducting additional material when an operator triggers a legitimate reprint of a failed part.

### Changed Files
1. [`tools/bambu_bridge.py`](file:///e:/My%20Development/Robohatch-CarbonPrints/CarbonPrints%20Internal%20Web/tools/bambu_bridge.py):
   - Restricted binding to loopback host.
   - Added origin CORS check, token authorization, IPv4 input validation, and verified `/api/open-studio` executable launcher.
2. [`js/services/bambu.js`](file:///e:/My%20Development/Robohatch-CarbonPrints/CarbonPrints%20Internal%20Web/js/services/bambu.js) *(546 lines <= 600)*:
   - Checks HTTP status and JSON response body (`launched: true`).
   - Added `openSlicerHandoffModal` with parameters display, clipboard copy, and `.txt` job ticket download.
   - Wired `testConnection` to dispatch `POST /api/connect`.
   - Masked LAN Access Code (`type="password"`).
3. [`js/modules/farm.js`](file:///e:/My%20Development/Robohatch-CarbonPrints/CarbonPrints%20Internal%20Web/js/modules/farm.js) *(564 lines <= 600)*:
   - Added assignment validation guards and `jobRunId` generation.
   - Added completion and failure state transition guards and next-action controls.
   - Delegated verbose mock farm seeding to `CP.dev.seedFarmData`.
4. [`js/core/dev.js`](file:///e:/My%20Development/Robohatch-CarbonPrints/CarbonPrints%20Internal%20Web/js/core/dev.js) *(273 lines <= 600)*:
   - Added `CP.dev.seedFarmData()` providing 10 demo printers, orders, and spools.
5. [`js/services/inventory-svc.js`](file:///e:/My%20Development/Robohatch-CarbonPrints/CarbonPrints%20Internal%20Web/js/services/inventory-svc.js) *(547 lines <= 600)*:
   - Updated `job:completed` event deduplication key to `payload.jobRunId`.
6. [`js/services/scrap-svc.js`](file:///e:/My%20Development/Robohatch-CarbonPrints/CarbonPrints%20Internal%20Web/js/services/scrap-svc.js) *(385 lines <= 600)*:
   - Updated `job:failed` event deduplication key to `payload.jobRunId`.
7. [`js/services/maint-svc.js`](file:///e:/My%20Development/Robohatch-CarbonPrints/CarbonPrints%20Internal%20Web/js/services/maint-svc.js) *(451 lines <= 600)*:
   - Updated `job:completed` event deduplication key to `payload.jobRunId`.
8. [`scratch/test_phase5.js`](file:///e:/My%20Development/Robohatch-CarbonPrints/CarbonPrints%20Internal%20Web/scratch/test_phase5.js) *(New - 399 lines)*:
   - 32 test assertions across 4 suites covering state machine transitions, exactly-once material deductions, reprint handling, bridge response body checks, connect flow, and transparent slicer handoffs.

### Tests Executed & Outcomes
- `python -m py_compile tools/bambu_bridge.py`: **PASS** (Zero syntax errors).
- `node scratch/test_phase5.js`: **32 PASSED, 0 FAILED**.
- `node scratch/test_task10.js`: **94 PASSED, 0 FAILED** (All 19 JS files <= 600 lines, PWA assets verified).
- `node scratch/run_tests_html.js`: **37 PASSED, 0 FAILED** (tests.html test runner).
- `node scratch/test_phase1.js`: **45 PASSED, 0 FAILED**.
- `node scratch/test_phase2.js`: **57 PASSED, 0 FAILED**.
- `node scratch/test_phase3.js`: **54 PASSED, 0 FAILED**.
- `node scratch/test_phase4.js`: **48 PASSED, 0 FAILED**.
- Total across all suites: **367 PASSED, 0 FAILED**.

### Architectural Decisions & Documented Limitations
- **Deferred Physical Hardware Testing**: Real-world Bambu Lab LAN telemetry via MQTT port 8883 and actual Bambu Studio execution require physical hardware and local machine installations. All integration flows were verified through HTTP/MQTT mock servers and isolated unit tests. Slicing jobs are never sent automatically to printers without explicit operator action.
- **Transparent Slicer Handoff**: Rather than generating a malformed `.3mf` XML archive, the application provides an honest manual workflow with slice settings and a `.txt` job ticket.
- **Strict Loopback Binding**: `tools/bambu_bridge.py` rejects binding to `0.0.0.0` or external network interfaces, restricting bridge exposure to `127.0.0.1`.

---

## 10. Phase 6 Implementation Summary & Release Readiness Audit

### Scope & Verification
1. **End-to-End Pipeline Validation**:
   - Built a comprehensive headless test suite ([`scratch/test_phase6.js`](file:///e:/My%20Development/Robohatch-CarbonPrints/CarbonPrints%20Internal%20Web/scratch/test_phase6.js)) executing all 14 steps of the complete customer lifecycle:
     - New customer registration with normalized mobile number, lowercase email, and uppercase GSTIN.
     - Returning customer autocomplete by phone and name.
     - Quick quote creation with snapshotted line item pricing and order totals.
     - Formal quotation document preview/print without assigning an invoice number or mutating order state.
     - Settings modification independence: changing rates updates new quotes while strictly preserving historical quote/invoice snapshots.
     - Confirmed order transition and sequential invoice assignment (`${prefix}/${fy}/XXXX`).
     - Payment recording across advance and settled statuses.
     - Operational expense tracking and monthly cash movement calculation (`Receipts - Expenses`, explicitly distinguished from net profit).
     - Full JSON backup export and valid structure verification.
     - Clean backup restore into test copy in replace mode with automatic pre-restore safety dump creation.
     - Bambu bridge offline failure handling with transparent manual slicer handoff modal and `.txt` job ticket.
     - Production farm assignment lock enforcing idle printer, pending part, and unique `jobRunId`.
     - Print failure event processing: scrap logging, material deduction, and part return to pending queue for reprint.
     - Reprint execution with fresh `jobRunId`, deduplicated material deduction, and dimensional QC inspection pass.
2. **Accessibility & Usability Polish**:
   - Added `aria-label` attributes to icon-only table actions in [`js/modules/orders.js`](file:///e:/My%20Development/Robohatch-CarbonPrints/CarbonPrints%20Internal%20Web/js/modules/orders.js) (`Quotation`, `Edit Order`, `Duplicate Order`, `Status`, `Record Payment`, `Tax Invoice`, `Delivery Challan`) and [`js/modules/orderdesk.js`](file:///e:/My%20Development/Robohatch-CarbonPrints/CarbonPrints%20Internal%20Web/js/modules/orderdesk.js) (`Save as template`, `Duplicate part`, `Remove part`).
3. **Documentation & Checklist Realignment**:
   - Synchronized [`README.md`](file:///e:/My%20Development/Robohatch-CarbonPrints/CarbonPrints%20Internal%20Web/README.md) and [`PRELAUNCH_CHECKLIST.md`](file:///e:/My%20Development/Robohatch-CarbonPrints/CarbonPrints%20Internal%20Web/PRELAUNCH_CHECKLIST.md) to accurately document dedicated quotation documents, customer master, part templates, expenses ledger, cash movement reporting, Bambu Lab loopback bridge, and manual slicer handoffs.
4. **File Size Compliance Verification**:
   - All 19 `.js` files remain strictly `<= 600` lines (checked via `scratch/test_task10.js`).

### Tests Executed & Outcomes
- `node scratch/test_phase6.js`: **55 PASSED, 0 FAILED** (Complete End-to-End Release Readiness Suite).
- `node scratch/test_task10.js`: **94 PASSED, 0 FAILED** (Line count compliance and PWA precache verification).
- `node scratch/run_tests_html.js`: **37 PASSED, 0 FAILED** (`tests.html` self-test suite).
- `node scratch/test_phase1.js`: **45 PASSED, 0 FAILED** (Data and pricing integrity).
- `node scratch/test_phase2.js`: **57 PASSED, 0 FAILED** (Dedicated quotation documents).
- `node scratch/test_phase3.js`: **54 PASSED, 0 FAILED** (Customer master & part templates).
- `node scratch/test_phase4.js`: **48 PASSED, 0 FAILED** (Expenses and accounts).
- `node scratch/test_phase5.js`: **32 PASSED, 0 FAILED** (Production board & hardware reliability).
- `python -m py_compile tools/bambu_bridge.py`: **PASS** (Zero syntax errors).
- Total across all test suites: **422 PASSED, 0 FAILED**.

---

## 11. Known Limitations & Operational Invariants

1. **Storage Isolation (~5MB LocalStorage Limit)**:
   - Data is stored in browser `localStorage`. No cloud database or multi-user sync is included in this phase.
   - Large binary files (e.g. high-resolution payment proof images) are downscaled or rejected if storage quota is full to prevent corruption.
   - Daily end-of-day JSON backups (`#/data`) must be downloaded and stored on company storage.
2. **Physical Hardware & Printing Telemetry**:
   - Hardware controls are never triggered automatically by test suites or without operator confirmation.
   - Real-world Bambu Lab LAN Mode telemetry requires running `tools/run_bambu_bridge.bat` on the workshop PC, strictly bound to loopback `127.0.0.1:5005`.
   - Real-world Bambu Studio launch, physical print start, and vernier caliper measurements require hands-on workshop operator execution.
3. **Cash Movement vs Accounting Profit**:
   - The system computes `Cash Movement = Customer Payments Received - Operational Expenses Recorded`.
   - This metric is explicitly labeled as cash movement and NOT net profit, as material inventory is not treated as job-level cost of goods sold.





