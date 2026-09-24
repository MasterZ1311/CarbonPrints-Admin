# CarbonPrints Company OS

**CarbonPrints Company OS** is a lightweight, offline-first internal operating system for **CarbonPrints Private Limited**, a 3D printing service hub based in Chennai, India. It manages a 10-printer FDM print farm, quotation generation, WhatsApp dispatch, GST invoicing, spool inventory, QC inspection, and machine maintenance without requiring cloud backends or subscriptions.

---

## 📁 Folder Structure

```text
├── index.html               # Main single-page application shell
├── manifest.webmanifest     # PWA manifest for desktop/tablet installation
├── service-worker.js        # Offline-first caching service worker
├── tests.html               # Zero-dependency browser self-test suite
├── css/
│   ├── styles.css           # Global typography, dark/light themes, badges, UI tokens
│   └── print.css            # Clean A4 print stylesheets for Tax Invoices & Delivery Challans
├── js/
│   ├── app.js               # Application bootstrap, PWA registration, and global telemetry
│   ├── core/                # Core foundation (store, bus, router, ui, util, defaults, dev)
│   ├── services/            # Business domain services (pricing, wa, docs, inventory, scrap, maint, csv, octo)
│   └── modules/             # UI views (dashboard, farm, orderdesk, orders, inventory, qc, maint, data, settings)
├── icons/                   # PWA application icons (192px and 512px)
└── tools/                   # Browser utilities (icon generator canvas)
```

---

## 🚀 How to Run Locally

### Option 1: Direct File Launch (Easiest)
- Double-click `index.html` in your file explorer.
- The entire system runs directly in your browser via `file://` with full offline database support.
- *Note: Service Workers and PWA install prompts are automatically bypassed on `file://` URLs per browser security standards.*

### Option 2: Local Web Server (Full PWA & Service Worker Support)
If you want to test PWA installation, offline service worker caching, or OctoPrint network status:
1. Open PowerShell or Terminal in the project folder.
2. Start a lightweight HTTP server:
   ```bash
   python -m http.server 8000
   ```
   *(or with Node.js: `npx serve .`)*
3. Open your browser and navigate to:
   ```text
   http://localhost:8000
   ```

---

## 🔄 How to Update Code & Styles

Because the application uses an aggressive **cache-first service worker** for instant offline loading:
1. Make your code changes in `js/`, `css/`, or `index.html`.
2. Open `service-worker.js` and **increment `CACHE_VERSION`** (e.g. from `'cp-os-v3'` to `'cp-os-v4'`).
3. Reload the application in your browser. The new service worker will activate, purge stale cached assets, and precache the updated files.
4. Verify tests by loading `tests.html` to confirm all 23 test suites pass green.

---

## 💾 How to Back Up and Restore Data

1. **Daily Backup**:
   - Open the app and navigate to **Data & Backup** (`#/data`).
   - Click **Download Full Backup (.json)**.
   - Save the file to your company Google Drive or local storage.
2. **Restore**:
   - Click **Choose Backup File to Restore...** and select a verified `.json` backup.
   - Choose **Merge Missing Records** (safe: preserves existing data and adds new records) or **Replace All Data** (overwrites with backup state).
   - An automatic safety snapshot of your current state is downloaded before any restore takes place.

---

## ⚠️ Known Limitations & Operational Rules

- **Browser-Local Storage**: All orders, spools, payments, and settings are stored locally in the browser's HTML5 `localStorage`.
- **No Automatic Cloud Sync**: Data does NOT automatically sync across multiple computers or phones. To move your database to another computer, export a backup from Computer A and restore it on Computer B.
- **Do Not Clear Browser Cookies/Site Data**: Clearing browser website data or using incognito mode will wipe your local database unless a recent JSON backup has been saved.
- **OctoPrint Mixed-Content Rules**: Due to standard browser security policies, local HTTP OctoPrint instances cannot be fetched from HTTPS-hosted websites (e.g., GitHub Pages) unless OctoPrint has SSL configured. When running locally via `file://` or `http://localhost`, OctoPrint connections work without restrictions.
