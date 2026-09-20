/**
 * CarbonPrints Company OS - Default Schemas & Initial Seed Data
 * Global namespace: window.CP.defaults
 */
window.CP = window.CP || {};

CP.defaults = (function () {
  const nowISO = new Date().toISOString();

  // 1. Settings Schema
  const settings = {
    business: {
      name: "CarbonPrints",
      legalName: "CarbonPrints Private Limited",
      address: "No. 14, Industrial Estate, Guindy, Chennai, Tamil Nadu - 600032",
      phone: "+91 98400 12345",
      email: "orders@carbonprints.in",
      gstin: "33AAAAA0000A1Z5",
      upiId: "carbonprints@icici",
      upiName: "CarbonPrints Private Limited",
      invoicePrefix: "CP",
      footerNote: "All 3D printed parts are inspected for dimensional accuracy. Reach out on WhatsApp for re-orders or queries."
    },
    materials: ["PLA", "ABS", "TPU"],
    pricing: {
      ratePerGram: {
        PLA: 4,
        ABS: 4,
        TPU: 4
      },
      layerMultiplier: {
        "0.28": 1,
        "0.20": 1,
        "0.12": 1
      },
      gstEnabled: false,
      gstPct: 18,
      interState: false,
      minMarginPct: 40,
      categoryDiscountPct: {
        "College Project": 0,
        "Hardware Startup R&D": 0,
        "Automotive Garage": 0,
        "Hobbyist": 0
      }
    },
    production: {
      gramsPerHour: {
        "0.28": 15,
        "0.20": 10,
        "0.12": 6
      },
      printHoursPerDay: 16,
      postProcessDays: 1,
      lowStockThresholdG: 2000,
      scrapTargetPct: 5,
      toleranceMm: 0.2,
      nozzleLifeLimitG: 5000,
      abrasiveMaterials: ["ABS"]
    }
  };

  // 2. Default 10 Printers
  const printers = [];
  for (let i = 1; i <= 10; i++) {
    const numStr = String(i).padStart(2, '0');
    printers.push({
      id: i,
      name: `Printer ${numStr}`,
      model: "Ender 3",
      status: "idle",
      statusNote: "",
      currentJob: null,
      nozzle: {
        type: "brass",
        installedAt: nowISO,
        gramsExtruded: 0,
        abrasiveGramsExtruded: 0
      },
      octoprint: {
        url: "",
        apiKey: ""
      }
    });
  }

  // 3. Default Maintenance Tasks for all 10 printers
  const maintTasks = [];
  const taskTemplates = [
    { key: "bed_level", label: "Bed leveling check", intervalDays: 1 },
    { key: "lead_screw_lube", label: "Lead screw lubrication (white lithium grease)", intervalDays: 7 },
    { key: "belt_tension", label: "Belt tension check", intervalDays: 30 }
  ];

  for (let p = 1; p <= 10; p++) {
    taskTemplates.forEach(t => {
      maintTasks.push({
        id: `task_${p}_${t.key}`,
        printerId: p,
        key: t.key,
        label: t.label,
        intervalDays: t.intervalDays,
        lastDone: null
      });
    });
  }

  // 4. Counters, Metadata & Empty collections
  const counters = {};
  const meta = {
    schemaVersion: 1,
    lastBackupAt: null
  };

  return {
    settings,
    printers,
    maintTasks,
    counters,
    meta
  };
})();
