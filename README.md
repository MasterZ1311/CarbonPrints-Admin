# CarbonPrints-Admin

CarbonPrints Company OS - Internal offline-first web application for CarbonPrints Private Limited, a 3D printing service based in Chennai, India.

## Features
- **10-Printer Farm Management**: Live status tracking, extrusion counters, maintenance scheduling, and OctoPrint bridge.
- **Order Desk (Quote Builder)**: Real-time part pricing, layer multiplier calculations, instant WhatsApp quotation dispatch, and draft autosave.
- **Orders & Billing**: Pipeline tracking (quote → confirmed → printing → post → qc → ready → delivered), payment recording with canvas image downscaling, GST Tax Invoices & Delivery Challans with A4 print formatting.
- **Spools & Inventory**: 1kg spool tracking, batch QR code stickers, Parrys/Ambattur supplier pricing comparisons, and low-stock alerts.
- **QC & Scrap Tracking**: Dimensional inspections, scrap analysis, and cause logging.
- **Offline-First**: Zero external build steps, vanilla JS, persistent `localStorage` database with full JSON export/import and schema upgrades.
