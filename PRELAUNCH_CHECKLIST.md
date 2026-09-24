# Founder Pre-Launch Checklist
*CarbonPrints Private Limited • Go-Live Readiness Plan*

Complete these 6 steps before onboarding interns or taking live customer orders on CarbonPrints Company OS.

---

## 1. Configure Business Profile (`#/settings`)

Go to **Settings** > **Business Profile** and enter your real company credentials:
- [ ] **Trading Name**: `CarbonPrints`
- [ ] **Legal Entity Name**: `CarbonPrints Private Limited`
- [ ] **Workshop Address**: Street address, area, Chennai, Tamil Nadu, PIN code.
- [ ] **Official Contact Phone / WhatsApp**: Number used for sending quotes via WhatsApp Web.
- [ ] **Official Contact Email**: e.g., `orders@carbonprints.in`
- [ ] **GSTIN**: Enter your valid 15-digit Tamil Nadu GSTIN (e.g. `33AAAAA0000A1Z5`).
- [ ] **Company UPI ID**: Enter your business VPA (e.g. `carbonprints@icici` or `carbonprints@upi`) to ensure customers pay directly to the verified company account.
- [ ] Click **Save Settings**.

---

## 2. Verify Pricing, Multipliers & Tax with Your CA

Review your baseline pricing with your Chartered Accountant or finance lead:
- [ ] **Base Rates per Gram**: Confirm base rate (default: ₹4.00/g for PLA, ₹5.00/g for ABS, ₹6.00/g for TPU).
- [ ] **Layer Multipliers**: Confirm markup/markdown factors:
  - 0.28 mm (Draft): `0.85x`
  - 0.20 mm (Standard): `1.00x`
  - 0.12 mm (Fine): `1.40x`
- [ ] **GST Configuration**:
  - GST Enabled: Checked (`true`)
  - GST Rate: `18%`
  - Intra-State (Tamil Nadu): Split into **CGST 9%** + **SGST 9%**
  - Inter-State (Outside TN): Billed as **IGST 18%**
- [ ] **Customer Discounts**: Review customer segment discount defaults (College Project, Hardware Startup R&D, Automotive Garage, Hobbyist).

---

## 3. Print Test Invoice & Delivery Challan

Test your workshop office printer to verify A4 document formatting:
- [ ] In **Order Desk** (`#/order-desk`), build a quick 2-part dummy quote and click **Confirm Order**.
- [ ] Go to **Orders & Billing** (`#/orders`):
  - Click the `📄` icon to open the **Tax Invoice**. Press `Ctrl + P` to print. Verify company name, GSTIN, HSN code (998898), CGST/SGST amounts, and Rupee words.
  - Click the `🚚` icon to open the **Delivery Challan**. Verify "GOODS NOT FOR SALE" header, piece count checklist, and dual signature blocks.
- [ ] Confirm everything fits cleanly on single/multi-page A4 sheets without overlapping margins.

---

## 4. Enter Real Opening Filament Spool Inventory (`#/inventory`)

Take an accurate physical audit of your filament stock:
- [ ] Weigh every physical spool currently on your shelves using the digital scale.
- [ ] In **Spools & Stock** (`#/inventory`), click **+ Add Spool** for each roll:
  - Material (PLA / ABS / TPU)
  - Color & Brand (e.g., *Jet Black - Numakers*)
  - Vendor / Source (e.g., *Parrys Chennai* or *Ambattur*)
  - Net remaining filament weight in grams (subtract spool tare weight, typically ~200g)
  - Cost per spool in ₹
- [ ] Assign the active spools to their respective loaded printers (`P01` to `P10`).

---

## 5. Clear Demo Data & Initialize Farm (`#/settings`)

Wipe out all sandbox and mock records before real operations begin:
- [ ] Navigate to **Settings** > **Diagnostics & Dev** tab.
- [ ] Click **Reset All Data (Clear Database)**.
- [ ] This wipes all test orders, temporary scrap logs, and demo payments while preserving your calibrated settings and 10 printer slots.

---

## 6. Take Day-Zero Baseline Backup (`#/data`)

Protect your clean opening state:
- [ ] Go to **Data & Backup** (`#/data`).
- [ ] Click **Download Full Backup (.json)**.
- [ ] Save the file as `carbonprints-day-zero-baseline.json`.
- [ ] Upload this snapshot to your company Google Drive folder.
- [ ] **You are now ready to go live!** 🎉
