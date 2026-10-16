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
        ABS: 5,
        TPU: 6
      },
      layerMultiplier: {
        "0.28": 0.85,
        "0.20": 1.00,
        "0.12": 1.40
      },
      gstEnabled: true,
      gstPct: 18,
      interState: false,
      minMarginPct: 40,
      requiresOwnerConfirmation: true,
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
      },
      integration: "none",
      bambu: {
        ip: "",
        accessCode: "",
        serial: "",
        bridgeUrl: "http://127.0.0.1:5005"
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

  const bambuTaskTemplates = [
    { key: "bambu_carbon_rod", label: "Carbon X-axis rod wipe (99% IPA, no lube)", intervalDays: 14 },
    { key: "bambu_lead_screw", label: "Z-axis lead screws clean & lube", intervalDays: 30 },
    { key: "bambu_cutter_blade", label: "Filament cutter blade inspection", intervalDays: 30 },
    { key: "bambu_wiper_sock", label: "Nozzle wiper pad & silicone sock check", intervalDays: 7 },
    { key: "bambu_ams_feeder", label: "AMS feeder funnel & gear inspection", intervalDays: 30 },
    { key: "bambu_carbon_filter", label: "Activated carbon air filter check", intervalDays: 90 }
  ];

  const printerModels = [
    "Ender 3",
    "Bambu Lab X1-Carbon",
    "Bambu Lab P1S",
    "Bambu Lab P1P",
    "Bambu Lab A1",
    "Bambu Lab A1 Mini",
    "Prusa MK4",
    "Custom FDM"
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
    schemaVersion: 2,
    lastBackupAt: null
  };

  return {
    settings,
    printers,
    maintTasks,
    taskTemplates,
    bambuTaskTemplates,
    printerModels,
    counters,
    meta
  };
})();
