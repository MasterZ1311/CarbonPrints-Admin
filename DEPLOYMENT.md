# GitHub Pages Hosting Guide

This guide walks you through deploying **CarbonPrints Company OS** on GitHub Pages so the team can access the web app from any desktop or tablet at the workshop.

---

## ⚠️ Security Notice: Source Code vs. Business Data

> **IMPORTANT:**
> 1. **Your customer data is NEVER stored on GitHub.** Orders, phone numbers, quotes, and payment proof images are stored locally on your machine inside your browser's `localStorage`.
> 2. **A public GitHub repository makes your application CODE public.** Anyone can see the HTML, CSS, and JS scripts. If you prefer to keep your company code private, create a **Private** repository (GitHub Pages is free on private repos for GitHub Pro/Enterprise, and free on public repos for all accounts).
> 3. **Never commit backup files or exports.** Our `.gitignore` automatically blocks `carbonprints-backup-*.json` and `*.csv` files. Ensure you never manually upload customer exports into the repository.

---

## Method 1: Beginner Guide (Using GitHub Website Only)

No command line, terminal, or git installation required:

1. **Sign in to GitHub**:
   - Go to [github.com](https://github.com) and log into your account.
2. **Create a New Repository**:
   - Click the green **New** button (or the `+` icon in the top right > **New repository**).
   - Repository name: `carbonprints-os` (or any name you like).
   - Select **Public** (or **Private** if you have GitHub Pro).
   - Leave "Add a README file" unchecked (we already have one).
   - Click **Create repository**.
3. **Upload Your Files**:
   - On the new repository page, click the **uploading an existing file** link.
   - Drag and drop the following files and folders into the upload box:
     - `index.html`
     - `manifest.webmanifest`
     - `service-worker.js`
     - `tests.html`
     - `README.md`
     - `.gitignore`
     - `css/` (entire folder)
     - `js/` (entire folder)
     - `icons/` (entire folder)
     - `tools/` (entire folder)
   - In the "Commit changes" message box at the bottom, type: `Initial CarbonPrints OS release`.
   - Click the green **Commit changes** button and wait 10–20 seconds for files to process.
4. **Enable GitHub Pages**:
   - In your repository, click the **Settings** tab (gear icon at the top).
   - In the left sidebar, click **Pages** (under the "Code and automation" section).
   - Under **Build and deployment** > **Source**, select **Deploy from a branch**.
   - Under **Branch**, choose `main` (or `master`), leave the folder as `/ (root)`, and click **Save**.
5. **Find Your Live Web App URL**:
   - Refresh the Pages settings page after 1 to 2 minutes.
   - At the top of the page, a green banner will appear:  
     `"Your site is live at https://<your-username>.github.io/carbonprints-os/"`
   - Bookmark this URL on your workshop computers or add it to the home screen of your tablet as a PWA!

---

## Method 2: Developer Guide (Using Git Command Line)

If you have Git installed on your development machine:

1. Open PowerShell or Terminal in the project root:
   ```bash
   cd "e:\My Development\Robohatch-CarbonPrints\CarbonPrints Internal Web"
   ```
2. Initialize repository and commit:
   ```bash
   git init
   git add .
   git commit -m "feat: release CarbonPrints Company OS v0.1.0"
   ```
3. Link your remote GitHub repository and push:
   ```bash
   git branch -M main
   git remote add origin https://github.com/<your-username>/carbonprints-os.git
   git push -u origin main
   ```
4. Enable Pages in GitHub:
   - Go to **Settings** > **Pages** > Select branch `main` (`/ (root)`) > **Save**.

---

## 🔄 Deploying Updates to GitHub Pages

Whenever you make improvements or fixes:
1. Update your code.
2. Increment `CACHE_VERSION` in `service-worker.js` (e.g. `'cp-os-v3'` → `'cp-os-v4'`).
3. Commit and push (or re-upload the modified files on github.com).
4. Clients will automatically receive the updated assets on their next page visit!
