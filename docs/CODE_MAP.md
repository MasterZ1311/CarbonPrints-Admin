# CarbonPrints Company OS — Code Map

A compact, reusable architectural map of the codebase to prevent repeated scanning in subsequent phases.

---

## 1. Application Shell & Routing

| File | Responsibility | Key Symbols / Entry Points | Test / Verification |
|---|---|---|---|
| [`index.html`](file:///e:/My%20Development/Robohatch-CarbonPrints/CarbonPrints%20Internal%20Web/index.html) | Single-page shell, navigation bar, modal/toast/print roots, script ordering | `#sidebar-nav`, `#view`, `#modal-container`, `#toast-container`, `#print-root` | Manual browser load; PWA link audit in `scratch/test_task10.js` |
| [`js/app.js`](file:///e:/My%20Development/Robohatch-CarbonPrints/CarbonPrints%20Internal%20Web/js/app.js) | App initialization, router start, PWA service worker registration, online/offline status | `window.addEventListener('DOMContentLoaded')`, `CP.init()`, `registerServiceWorker()` | `node --check js/app.js`, `scratch/test_task10.js` |
| [`js/core/router.js`](file:///e:/My%20Development/Robohatch-CarbonPrints/CarbonPrints%20Internal%20Web/js/core/router.js) | Hash-based router (`#/route`), route registration, active module lifecycle | `CP.router.init()`, `CP.router.navigate(route)`, `CP.router.register(pattern, handler)`, `CP.registerModule(mod)` | `tests.html` Suite 7 |
| [`service-worker.js`](file:///e:/My%20Development/Robohatch-CarbonPrints/CarbonPrints%20Internal%20Web/service-worker.js) | Cache-first offline service worker, cache versioning | `CACHE_VERSION`, `self.addEventListener('install')`, `self.addEventListener('fetch')` | `scratch/test_task10.js` |

---

## 2. Core Foundation & State Management

| File | Responsibility | Key Symbols / Entry Points | Test / Verification |
|---|---|---|---|
| [`js/core/store.js`](file:///e:/My%20Development/Robohatch-CarbonPrints/CarbonPrints%20Internal%20Web/js/core/store.js) | Offline `localStorage` persistence, in-memory sandboxing, reactivity, import/export | `CP.store.get(key, fallback)`, `CP.store.set(key, val)`, `CP.store.update(key, fn)`, `CP.store.subscribe(key, fn)`, `CP.store.useMemory(bool)`, `CP.store.exportAll()`, `CP.store.importAll(obj, mode)`, `CP.store.usage()`, `CP.store.init()` | `tests.html` in-memory harness; `scratch/run_tests_html.js` |
| [`js/core/defaults.js`](file:///e:/My%20Development/Robohatch-CarbonPrints/CarbonPrints%20Internal%20Web/js/core/defaults.js) | Initial seed data schemas (business profile, materials, default 10 printers, maintenance task templates) | `CP.defaults.settings`, `CP.defaults.printers`, `CP.defaults.maintTasks`, `CP.defaults.taskTemplates`, `CP.defaults.bambuTaskTemplates`, `CP.defaults.printerModels` | `node --check js/core/defaults.js` |
| [`js/core/bus.js`](file:///e:/My%20Development/Robohatch-CarbonPrints/CarbonPrints%20Internal%20Web/js/core/bus.js) | In-app pub/sub event bus | `CP.bus.on(event, fn)`, `CP.bus.off(event, fn)`, `CP.bus.emit(event, data)` | Used across all modules & `tests.html` |
| [`js/core/ui.js`](file:///e:/My%20Development/Robohatch-CarbonPrints/CarbonPrints%20Internal%20Web/js/core/ui.js) | Modal popups, toasts, confirm/prompt dialogs, status badges, alert banners | `CP.ui.toast(msg, kind)`, `CP.ui.modal(opts)`, `CP.ui.prompt(msg, def)`, `CP.ui.confirm(msg)`, `CP.ui.badge(txt, kind)`, `CP.ui.showAlert(...)`, `CP.ui.removeAlert(...)` | Manual UI / headless DOM checks |
| [`js/core/util.js`](file:///e:/My%20Development/Robohatch-CarbonPrints/CarbonPrints%20Internal%20Web/js/core/util.js) | Formatting, sequential IDs (FY-aware), date manipulation, string escaping | `CP.util.nextId(type, date)`, `CP.util.uid(prefix)`, `CP.util.fmtINR(num)`, `CP.util.fmtDate(iso)`, `CP.util.todayISO()`, `CP.util.addDays(iso, n)`, `CP.util.esc(str)`, `CP.util.debounce(fn, ms)`, `CP.util.isDimensionOk(...)` | `tests.html` Suites 7 & 10 |
| [`js/core/dev.js`](file:///e:/My%20Development/Robohatch-CarbonPrints/CarbonPrints%20Internal%20Web/js/core/dev.js) | Dev diagnostics, mock data seeder registry, store reset | `CP.dev.registerSeeder(fn)`, `CP.dev.seedAll()`, `CP.dev.resetAll()` | `scratch/test_task3.js` - `test_task9.js` |

---

## 3. Business Services

| File | Responsibility | Key Symbols / Entry Points | Test / Verification |
|---|---|---|---|
| [`js/services/pricing.js`](file:///e:/My%20Development/Robohatch-CarbonPrints/CarbonPrints%20Internal%20Web/js/services/pricing.js) | Pure pricing engine: part price, print hours, GST calculation (CGST/SGST/IGST), turnaround days, currency in words | `CP.pricing.partPrice(part, settings)`, `CP.pricing.partPrintHours(part, settings)`, `CP.pricing.calcOrder(order, settings)`, `CP.pricing.numberToWordsINR(n)` | `tests.html` Suites 1, 2, 3, 4 |
| [`js/services/customer-svc.js`](file:///e:/My%20Development/Robohatch-CarbonPrints/CarbonPrints%20Internal%20Web/js/services/customer-svc.js) | Local customer master directory, duplicate detection, order learning, part templates, order duplication helper | `CP.customers.getAll()`, `CP.customers.save(cust, opts)`, `CP.customers.search(q)`, `CP.customers.learnFromOrders()`, `CP.customers.getTemplates()`, `CP.customers.saveTemplate(t)`, `CP.customers.cloneOrder(o)` | `scratch/test_phase3.js`; `tests.html` Suite 12 |
| [`js/services/docs.js`](file:///e:/My%20Development/Robohatch-CarbonPrints/CarbonPrints%20Internal%20Web/js/services/docs.js) | Document HTML rendering and print triggering: Tax Invoices & Delivery Challans | `CP.docs.previewInvoice(orderId)`, `CP.docs.printInvoice(orderId)`, `CP.docs.previewChallan(orderId)`, `CP.docs.printChallan(orderId)` | Manual A4 print check / `scratch/run_tests_html.js` |
| [`js/services/wa.js`](file:///e:/My%20Development/Robohatch-CarbonPrints/CarbonPrints%20Internal%20Web/js/services/wa.js) | WhatsApp Web link generator, Indian phone normalization, message templates | `CP.wa.cleanPhone(p)`, `CP.wa.isValidIndianMobile(p)`, `CP.wa.waLink(phone, msg)`, `CP.wa.formatQuoteMessage(order, s)`, `CP.wa.formatStatusMessage(...)`, `CP.wa.formatPaymentReceiptMessage(...)` | `tests.html` Suites 5 & 6 |
| [`js/services/inventory-svc.js`](file:///e:/My%20Development/Robohatch-CarbonPrints/CarbonPrints%20Internal%20Web/js/services/inventory-svc.js) | Filament inventory ledger, spool consumption clamping, spool load/swap, margin reporting | `CP.inventory.addSpool(spool)`, `CP.inventory.consume(spoolId, grams, meta)`, `CP.inventory.loadSpool(prId, spId)`, `CP.inventory.unloadSpool(prId)`, `CP.inventory.marginReport()` | `tests.html` Suites 12 & 13 |
| [`js/services/scrap-svc.js`](file:///e:/My%20Development/Robohatch-CarbonPrints/CarbonPrints%20Internal%20Web/js/services/scrap-svc.js) | Failed print scrap tracking, reprint queueing, scrap status thresholds | `CP.scrap.logScrap(record)`, `CP.scrap.scrapStatus(pct)`, `CP.scrap.getStats()` | `tests.html` Suite 9; `scratch/test_task6.js` |
| [`js/services/maint-svc.js`](file:///e:/My%20Development/Robohatch-CarbonPrints/CarbonPrints%20Internal%20Web/js/services/maint-svc.js) | Maintenance checklist evaluation, nozzle wear tracking, Bambu 6-task routine | `CP.maint.markDone(taskId, tech, note)`, `CP.maint.changeNozzle(printerId, tech, note)`, `CP.maint.applyBambuRoutine(printerId)`, `CP.maint.getTaskStatus(task)` | `tests.html` Suites 11 & 14; `scratch/test_task7.js` |
| [`js/services/csv.js`](file:///e:/My%20Development/Robohatch-CarbonPrints/CarbonPrints%20Internal%20Web/js/services/csv.js) | RFC 4180 CSV serializer, UTF-8 BOM injection, browser file download | `CP.csv.escapeField(val)`, `CP.csv.toCSV(records, cols)`, `CP.csv.download(filename, content, mime)` | `tests.html` Suite 8; `scratch/test_task9.js` |
| [`js/services/octoprint.js`](file:///e:/My%20Development/Robohatch-CarbonPrints/CarbonPrints%20Internal%20Web/js/services/octoprint.js) | Read-only OctoPrint HTTP REST polling, temperature & progress telemetry | `CP.octo.fetchStatus(printer)`, `CP.octo.pollAll(printers, cb)`, `CP.octo.formatTimeLeft(s)`, `CP.octo.renderCardChip(p)`, `CP.octo.renderCardStrip(p)` | `scratch/test_task11.js` |
| [`js/services/bambu.js`](file:///e:/My%20Development/Robohatch-CarbonPrints/CarbonPrints%20Internal%20Web/js/services/bambu.js) | Bambu Lab LAN telemetry via local bridge (`POST /api/connect`), response body & HTTP status validation, transparent manual slicer handoff modal with copyable parameters & `.txt` job ticket, password-masked access code | `CP.bambu.fetchStatus(printer)`, `CP.bambu.testConnection(cfg)`, `CP.bambu.openInStudio(part, order, bridgeUrl)`, `CP.bambu.openSlicerHandoffModal(part, order)` | `scratch/test_phase5.js`; `tests.html` Suite 14 |
| [`tools/bambu_bridge.py`](file:///e:/My%20Development/Robohatch-CarbonPrints/CarbonPrints%20Internal%20Web/tools/bambu_bridge.py) | Local Python HTTP server (strictly loopback `127.0.0.1`), origin CORS enforcement, optional token auth, validated `/api/connect` & truthful `/api/open-studio` | `HTTPServer`, `BambuMqttClient`, `find_bambu_studio_exe()`, CLI args `--host`, `--port`, `--token`, `--mock` | `python -m py_compile tools/bambu_bridge.py`; `scratch/test_phase5.js` |
| [`js/services/expense-svc.js`](file:///e:/My%20Development/Robohatch-CarbonPrints/CarbonPrints%20Internal%20Web/js/services/expense-svc.js) | Expense ledger CRUD, input validation, category resolution, monthly aggregates, cash movement calculation, safe all-or-nothing CSV import/export | `CP.expenses.getAll()`, `CP.expenses.getById(id)`, `CP.expenses.save(exp)`, `CP.expenses.remove(id)`, `CP.expenses.filter(opts)`, `CP.expenses.getMonthTotal(y, m)`, `CP.expenses.getCashMovement(y, m)`, `CP.expenses.computeSummary(list)`, `CP.expenses.exportCSV(list, fn)`, `CP.expenses.validateAndImportCSV(txt, mode)` | `scratch/test_phase4.js`, `tests.html` Suite 13 |

---

## 4. UI Feature Modules

| File | Route | Responsibility | Key Elements & Methods |
|---|---|---|---|
| [`js/modules/dashboard.js`](file:///e:/My%20Development/Robohatch-CarbonPrints/CarbonPrints%20Internal%20Web/js/modules/dashboard.js) | `#/dashboard` | Farm at a glance, revenue KPIs, due soon orders, SVG revenue breakdown chart | `render(root)`, `destroy()`, KPI calculation, due-soon table |
| [`js/modules/orderdesk.js`](file:///e:/My%20Development/Robohatch-CarbonPrints/CarbonPrints%20Internal%20Web/js/modules/orderdesk.js) | `#/order-desk` | Quotation drafting, multi-part live pricing, discount handling, WhatsApp dispatch, order confirmation | `render(root, orderId)`, `readFormData()`, `updateSummary()`, `saveOrder()` |
| [`js/modules/orders.js`](file:///e:/My%20Development/Robohatch-CarbonPrints/CarbonPrints%20Internal%20Web/js/modules/orders.js) | `#/orders` | Order management, lifecycle state machine, search/filter, payment recording with compressed image proof, invoice/challan trigger | `CP.orders.canTransition(from, to)`, `openRecordPaymentModal()`, `openChangeStatusModal()` |
| [`js/modules/farm.js`](file:///e:/My%20Development/Robohatch-CarbonPrints/CarbonPrints%20Internal%20Web/js/modules/farm.js) | `#/farm` | 10 printer visual cards, real-time print countdown timers, job queue assignment, failure/scrap trigger, Bambu/Octo telemetry strips | `render(root)`, `tick()`, `openAssignModal()`, `openCompleteModal()`, `openFailModal()` |
| [`js/modules/inventory.js`](file:///e:/My%20Development/Robohatch-CarbonPrints/CarbonPrints%20Internal%20Web/js/modules/inventory.js) | `#/inventory` | Spool stock list, add/edit spools, load onto machine, stock ledger history, margin report | `render(root)`, spool add/edit modal, low stock warnings |
| [`js/modules/qc.js`](file:///e:/My%20Development/Robohatch-CarbonPrints/CarbonPrints%20Internal%20Web/js/modules/qc.js) | `#/qc` | Vernier caliper dimension checks against tolerance, scrap log audit, root-cause Pareto analysis | `render(root)`, `openQCModal()`, dimensional pass/fail evaluation |
| [`js/modules/maintenance.js`](file:///e:/My%20Development/Robohatch-CarbonPrints/CarbonPrints%20Internal%20Web/js/modules/maintenance.js) | `#/maintenance` | Daily operator checklist, printer maintenance task schedules, brass nozzle wear meters, reset logs | `render(root)`, task completion checkbox handler, nozzle replacement modal |
| [`js/modules/data.js`](file:///e:/My%20Development/Robohatch-CarbonPrints/CarbonPrints%20Internal%20Web/js/modules/data.js) | `#/data` | Full JSON export/restore (replace vs merge deduplication), pre-restore safety dump, Tally/Zoho sales/receipts CSVs, operational CSVs | `CP.data.exportFullBackup()`, `CP.data.validateBackup(json)`, `CP.data.restoreBackup(json, mode)`, `exportOrdersCSV()` |
| [`js/modules/expenses.js`](file:///e:/My%20Development/Robohatch-CarbonPrints/CarbonPrints%20Internal%20Web/js/modules/expenses.js) | `#/expenses` | Expense tracking, cash movement KPI banner, category breakdown summary, filter toolbar, responsive data table, create/edit modal with validation, CSV export/import | `render(root, query)`, `openModal(expenseId)`, `loadTable()`, `handleDelete(id)`, filter handlers |
| [`js/modules/settings.js`](file:///e:/My%20Development/Robohatch-CarbonPrints/CarbonPrints%20Internal%20Web/js/modules/settings.js) | `#/settings` | Business profile (GSTIN, UPI), base rates, layer multipliers, customer discounts, hardware thresholds, printer connection settings, dev wipe | `render(root)`, `validate(settings)`, tab renderers (`business`, `pricing`, `production`, `connections`, `dev`) |

---

## 5. Storage Keys & Schema References

| Storage Key | Type | Description |
|---|---|---|
| `cp_settings` | `Object` | Business details, material pricing, layer multipliers, GST config, production speeds |
| `cp_orders` | `Array<Order>` | Order records with parts, customer, pricing totals, payments, and status |
| `cp_customers` | `Array<Customer>` | Local customer master with stable IDs, normalized phone, email, category, GSTIN |
| `cp_part_templates` | `Array<Template>` | Reusable part blueprints (name, material, layer, infill %, weight, notes) |
| `cp_expenses` | `Array<Expense>` | Local operational expense records (stable ID `CP-EXP-YYYY-XXXX`, date, category, payee, description, amount, payment mode, reference, notes, linked order/printer, receipt reference) |
| `cp_printers` | `Array<Printer>` | 10 printer slots with status, active job, nozzle wear, Bambu/OctoPrint configs |
| `cp_spools` | `Array<Spool>` | Physical filament rolls, weight remaining, color, brand, loaded printer |
| `cp_ledger` | `Array<LedgerEntry>` | Transactional spool usage, scrap deductions, restocks |
| `cp_maint_tasks` | `Array<Task>` | Scheduled machine maintenance checklists and intervals |
| `cp_maint_log` | `Array<MaintLog>` | Completed maintenance logs, nozzle change history |
| `cp_scrap` | `Array<ScrapRecord>` | Failed print scrap weight, machine, spool, and failure reason |
| `cp_qc` | `Array<QCRecord>` | Dimensional inspection records with vernier caliper measurements |
| `cp_supplier_prices` | `Array<Price>` | Supplier benchmark prices per kg for margin calculation |
| `cp_counters` | `Object` | Sequential ID counters (e.g. `order:2026`, `invoice:26-27`, `challan:26-27`) |
| `cp_meta` | `Object` | App metadata: `schemaVersion`, `lastBackupAt` |
