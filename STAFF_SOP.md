# Staff Standard Operating Procedure (SOP)
*For Workshop Interns, Operators & Technicians • CarbonPrints Chennai*

Welcome to CarbonPrints! Follow this daily routine to keep the 10-printer farm running smoothly, maintain accurate inventory, and deliver top-quality 3D prints on time.

---

## 📋 The Daily 9-Step Routine

Follow these steps in sequence every day:

### 1. Open Farm Board (`#/farm`)
- Boot up the workshop computer, open Chrome, and open the app.
- Check which printers are active, idle, or need attention.

### 2. Check Today's Checklist (`#/maintenance`)
- Go to **Maintenance** and review **Today's Checklist**.
- Inspect build plates, verify bed leveling, wipe nozzles with a brass wire brush, and clean loose purge debris.
- Check the box for each machine task once physically done.

### 3. Assign Pending Jobs (`#/farm`)
- Scroll down to the **Pending Queue** on the Farm Board.
- Look at the earliest due parts and check required material (**PLA**, **ABS**, or **TPU**).
- Make sure the printer has the correct filament spool loaded (check the spool ID on the printer card).
- Click **Assign Machine** to start the print.

### 4. Mark Completed with Actual Grams (`#/farm`)
- When a print finishes on the machine, remove the part carefully from the build plate.
- Place the printed part on the workshop digital scale.
- Click **Complete Job** on the printer tile.
- **CRITICAL:** Enter the **Actual Grams** weighed on the scale (do not guess). This automatically updates nozzle wear telemetry and deducts filament from the spool ledger.

### 5. QC Inspection (`#/qc`)
- Take the part to the inspection table.
- Open **QC & Scrap** > **QC Inspection**.
- Using digital vernier calipers, measure length, width, and height against the nominal dimensions (tolerance is **±0.20 mm**).
- Check surface finish, ensure supports are removed cleanly, and verify part labeling.
- Enter measured values and click **Save QC Record**.

### 6. Mark Ready (`#/orders`)
- Once all parts in an order pass QC inspection, the order status automatically advances to **READY**.
- Pack the parts in protective bubble wrap and attach the order tag.

### 7. Delivery Challan / Invoice (`#/orders`)
- When the customer arrives or the courier picks up:
  - For pickup/handover: Click `🚚` to print the **Delivery Challan** (2 copies: 1 customer copy, 1 signed office copy).
  - For final billing: Click `📄` to view and print the **Tax Invoice**.

### 8. Record Payment (`#/orders`)
- Ask the customer to scan the company GPay / PhonePe QR code on the desk.
- Click the `💰` (Pay) icon on the order row.
- Enter the amount received, select mode (`UPI`), and enter the 12-digit UTR/reference number.
- Attach a photo/screenshot of the payment receipt if available, then click **Save Payment**.

### 9. End-of-Day Backup (`#/data`)
- At the end of your shift (before 7:00 PM):
- Go to **Data & Backup** (`#/data`).
- Click **Download Full Backup (.json)**.
- Upload the downloaded file into the company Google Drive folder: `CarbonPrints Shared > EOD Backups`.

---

## 🚨 What to Do If a Print Fails

Never let failed plastic go unrecorded!
1. Stop the printer immediately if you notice spaghetti, warping, layer shifts, or nozzle clogs.
2. Peel off the failed plastic and weigh it on the scale.
3. On the **Farm Board** (`#/farm`), click **Mark as Failed** on that printer (or go to **QC & Scrap** > **Scrap Log**).
4. Enter the failed grams and choose the correct failure reason:
   - *Spaghetti* • *Warping* • *Layer shift* • *Nozzle clog* • *Bed adhesion* • *Power cut*
5. Select the spool to deduct the wasted material, then click **Confirm Scrap & Queue Reprint**.
6. The part will automatically go back into the Pending Queue so another operator can reprint it!

---

## ⚠️ What to Do If the Page Looks Empty or Data Disappears

1. **DO NOT CLEAR BROWSER DATA, COOKIES, OR CACHE.**
2. Check if you are in Incognito/Private mode (the app cannot save data in Incognito). If so, switch back to standard Chrome.
3. Press `Ctrl + F5` to refresh the page.
4. If someone cleared the computer or you are on a fresh workstation:
   - Go to **Data & Backup** (`#/data`).
   - Click **Choose Backup File to Restore...**.
   - Pick the latest `.json` backup file from the Google Drive `EOD Backups` folder.
   - Click **Replace All Data**. All orders, spools, and farm records will reappear immediately!
5. Notify the workshop supervisor or founders if you encounter any unexpected issues.
