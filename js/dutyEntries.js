import { DB } from "./db.js";
import {
  newDutyEntry, TIMELINE_STEPS,
  ACStatus, UICStatus, LOCOMOTIVE_TYPE_OPTIONS, CAB_OPTIONS,
  PT_TYPE_OPTIONS, MAJOR_SCHEDULE_OPTIONS, MINOR_SCHEDULE_TYPE_OPTIONS,
  SR_BUR_MAKE_OPTIONS, HOG_MAKE_OPTIONS, HOG_STATUS_OPTIONS,
  COMPONENT_UIC_OPTIONS, CABLE_CONNECTED_OPTIONS,
  FITTED_OPTIONS, RTIS_COMPONENT_STATUS_OPTIONS, AC_COMPONENT_STATUS_OPTIONS,
  KAVACH_MAKE_OPTIONS, KAVACH_STATUS_OPTIONS, BRAKE_SYSTEM_OPTIONS, SPM_MAKE_OPTIONS,
  newAdditionalLocomotive, newMinorSchedule, UICCableOption,
} from "./models.js";
import { AutosaveController, wireLifecycleFlush } from "./autosave.js";
import { el, formatDate, formatTime, createTimeField, createDropdown, todayDateInputValue } from "./util.js";
import { openExportCard } from "./exportCard.js";
import { openRangeReport } from "./rangeReport.js";
import { showToast } from "./toast.js";

let currentUnwireLifecycle = null;

function isEntryEmpty(entry) {
  if (entry.trainNumber || entry.trainName || entry.remarks) return false;
  if (entry.locomotiveId || entry.locomotiveNumberSnapshot || entry.locomotiveType || entry.locomotiveShed) return false;
  if (entry.locomotivePTType && entry.locomotivePTType !== PT_TYPE_OPTIONS[0]) return false;
  if ((entry.additionalLocomotives || []).some((loco) =>
    loco.locomotiveNumberSnapshot || loco.locomotiveType || loco.locomotiveShed || loco.cabSelection ||
    (loco.ptType && loco.ptType !== PT_TYPE_OPTIONS[0])
  )) return false;
  if (entry.majorScheduleDate || (entry.majorScheduleTypeCode && entry.majorScheduleTypeCode !== MAJOR_SCHEDULE_OPTIONS[0])) return false;
  if ((entry.minorSchedules || []).some((schedule) =>
    schedule.date || schedule.km !== null && schedule.km !== undefined ||
    (schedule.type && schedule.type !== MINOR_SCHEDULE_TYPE_OPTIONS[0])
  )) return false;
  if (entry.srMakeOther || entry.burMakeOther || entry.hogMakeOther || entry.spmMakeOther) return false;
  if (entry.srMake && entry.srMake !== SR_BUR_MAKE_OPTIONS[0]) return false;
  if (entry.burMake && entry.burMake !== SR_BUR_MAKE_OPTIONS[0]) return false;
  if (entry.hogMake && entry.hogMake !== HOG_MAKE_OPTIONS[0]) return false;
  if (entry.hogStatus && entry.hogStatus !== HOG_STATUS_OPTIONS[0]) return false;
  if (entry.uicCableConnected && entry.uicCableConnected !== CABLE_CONNECTED_OPTIONS[0]) return false;
  if (entry.rtisFitted && entry.rtisFitted !== FITTED_OPTIONS[0]) return false;
  if (entry.rtisStatus && entry.rtisStatus !== RTIS_COMPONENT_STATUS_OPTIONS[0]) return false;
  if (entry.acFitted && entry.acFitted !== FITTED_OPTIONS[0]) return false;
  if (entry.acStatus && entry.acStatus !== AC_COMPONENT_STATUS_OPTIONS[0]) return false;
  if (entry.kavachMake && entry.kavachMake !== KAVACH_MAKE_OPTIONS[0]) return false;
  if (entry.kavachStatus && entry.kavachStatus !== KAVACH_STATUS_OPTIONS[0]) return false;
  if (entry.brakeSystem && entry.brakeSystem !== BRAKE_SYSTEM_OPTIONS[0]) return false;
  if (entry.spmMake && entry.spmMake !== SPM_MAKE_OPTIONS[0]) return false;
  if (entry.mcStatus || entry.ubaDjOpen || entry.ubaDjClosed) return false;
  if (entry.spareItems && (
    entry.spareItems.otherText ||
    Object.entries(entry.spareItems).some(([key, value]) => key !== "otherText" && value === true)
  )) return false;
  for (const step of TIMELINE_STEPS) {
    if (entry[step.key]) return false;
  }
  return true;
}

function normalizeLocomotiveNumber(value) {
  return String(value || "").replace(/\D/g, "");
}

function sanitizeShedCode(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4);
}

function canonicalLocomotiveType(value) {
  const normalized = String(value || "").trim().toUpperCase();
  return LOCOMOTIVE_TYPE_OPTIONS.find((option) => option.toUpperCase() === normalized) || "";
}

function buildLocomotiveHistory(entries, locomotives, currentEntryId) {
  const history = new Map();
  const legacyById = new Map(locomotives.map((loco) => [loco.id, loco]));
  const newestFirst = entries
    .filter((candidate) => candidate.id !== currentEntryId)
    .sort((a, b) => (b.lastModified || "").localeCompare(a.lastModified || "") || (b.date || "").localeCompare(a.date || ""));

  for (const candidate of newestFirst) {
    const legacy = legacyById.get(candidate.locomotiveId);
    const candidateLocomotives = [
      {
        number: candidate.locomotiveNumberSnapshot || (legacy && legacy.number),
        type: candidate.locomotiveType || (legacy && legacy.locoClass),
        shed: candidate.locomotiveShed || (legacy && legacy.shed),
      },
      ...(candidate.additionalLocomotives || []).map((loco) => ({
        number: loco.locomotiveNumberSnapshot,
        type: loco.locomotiveType,
        shed: loco.locomotiveShed,
      })),
    ];

    for (const locomotive of candidateLocomotives) {
      const number = normalizeLocomotiveNumber(locomotive.number);
      if (!number || history.has(number)) continue;
      const type = canonicalLocomotiveType(locomotive.type);
      const shed = sanitizeShedCode(locomotive.shed);
      if (type || shed) history.set(number, { type, shed });
    }
  }

  for (const loco of locomotives) {
    const number = normalizeLocomotiveNumber(loco.number);
    if (number && !history.has(number) && (loco.locoClass || loco.shed)) {
      history.set(number, { type: canonicalLocomotiveType(loco.locoClass), shed: sanitizeShedCode(loco.shed) });
    }
  }
  return history;
}

export async function mountDutyTab(container, setHeaderTitle) {
  await showList(container, setHeaderTitle);
}

function openMovementTypePicker(container, setHeaderTitle) {
  const overlay = el("div", { class: "overlay" });
  const closeButton = el("button", {
    class: "icon-btn",
    type: "button",
    "aria-label": "Close movement selection",
    onclick: () => overlay.remove(),
  }, "×");

  const departureButton = el("button", {
    class: "primary-btn",
    type: "button",
    style: "width:100%;",
    onclick: async () => {
      overlay.remove();
      const entry = newDutyEntry();
      entry.movementType = "departure";
      await DB.put("dutyEntries", entry);
      showForm(container, setHeaderTitle, entry.id);
    },
  }, "Departure Movement");

  const arrivalButton = el("button", {
    class: "secondary-btn",
    type: "button",
    style: "width:100%;",
    onclick: () => {
      overlay.remove();
      showToast("Arrival Movement form will be added later.");
    },
  }, "Arrival Movement");

  const card = el("div", { class: "overlay-card" }, [
    el("div", { style: "display:flex;align-items:center;justify-content:space-between;gap:12px;" }, [
      el("h2", {}, "Add Movement"),
      closeButton,
    ]),
    el("p", {}, "Choose the movement record you want to add."),
    el("div", { style: "display:grid;gap:10px;margin-top:14px;" }, [departureButton, arrivalButton]),
  ]);

  overlay.appendChild(card);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) overlay.remove();
  });
  document.body.appendChild(overlay);
}

async function showList(container, setHeaderTitle) {
  if (currentUnwireLifecycle) { currentUnwireLifecycle(); currentUnwireLifecycle = null; }
  setHeaderTitle("Duty Log");
  container.innerHTML = "";

  let allEntries = await DB.getAll("dutyEntries");
  allEntries.sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.lastModified || "").localeCompare(a.lastModified || ""));

  const toolbar = el("div", { class: "toolbar-row" }, [
    el("button", { class: "secondary-btn", onclick: () => openRangeReport(allEntries) }, "Export range report"),
  ]);
  container.appendChild(toolbar);

  const filterCard = el("div", { class: "card" });
  const fromInput = el("input", { type: "date" });
  const toInput = el("input", { type: "date" });
  const searchInput = el("input", { type: "text", placeholder: "Search train no. / name / loco" });
  filterCard.appendChild(el("div", { class: "form-row" }, [el("label", {}, "From"), fromInput]));
  filterCard.appendChild(el("div", { class: "form-row" }, [el("label", {}, "To"), toInput]));
  filterCard.appendChild(el("div", { class: "form-row" }, [el("label", {}, "Search"), searchInput]));
  container.appendChild(filterCard);

  const listWrap = el("div", {});
  container.appendChild(listWrap);

  function applyFilterAndRender() {
    let filtered = allEntries;
    if (fromInput.value) filtered = filtered.filter((e) => e.date >= fromInput.value);
    if (toInput.value) filtered = filtered.filter((e) => e.date <= toInput.value);
    const q = searchInput.value.trim().toLowerCase();
    if (q) {
      filtered = filtered.filter((e) =>
        (e.trainNumber || "").toLowerCase().includes(q) ||
        (e.trainName || "").toLowerCase().includes(q) ||
        (e.locomotiveNumberSnapshot || "").toLowerCase().includes(q)
      );
    }
    renderRows(filtered);
  }

  function renderRows(entries) {
    listWrap.innerHTML = "";
    if (entries.length === 0) {
      listWrap.appendChild(el("div", { class: "empty-state" }, "No duty entries yet. Tap + to add one."));
      return;
    }
    for (const entry of entries) {
      const badges = [];
      if (entry.acStatus && entry.acStatus !== ACStatus.WORKING) badges.push(el("span", { class: "badge warn" }, "AC"));
      if (entry.uicStatus === UICStatus.MODIFIED) badges.push(el("span", { class: "badge" }, "UIC Modified"));
      const row = el("div", { class: "card list-row", onclick: () => showForm(container, setHeaderTitle, entry.id) }, [
        el("div", { class: "list-row-main" }, [
          el("div", { class: "list-row-title" }, `${entry.trainNumber || "—"} ${entry.trainName ? "· " + entry.trainName : ""}`),
          el("div", { class: "list-row-sub" }, `${formatDate(entry.date)} · Loco ${entry.locomotiveNumberSnapshot || "—"}`),
          badges.length ? el("div", { class: "list-row-badges" }, badges) : null,
        ]),
      ]);
      listWrap.appendChild(row);
    }
  }

  fromInput.onchange = applyFilterAndRender;
  toInput.onchange = applyFilterAndRender;
  searchInput.oninput = applyFilterAndRender;
  renderRows(allEntries);

  const fab = el("button", {
    class: "fab",
    "aria-label": "Add movement",
    onclick: () => openMovementTypePicker(container, setHeaderTitle),
  }, "+");
  container.appendChild(fab);
}

async function showForm(container, setHeaderTitle, entryId) {
  setHeaderTitle("Daily Loco Movement Record");
  container.innerHTML = "";

  let entry = await DB.get("dutyEntries", entryId);
  if (!entry.locomotivePTType) entry.locomotivePTType = PT_TYPE_OPTIONS[0];
  if (!Array.isArray(entry.additionalLocomotives)) entry.additionalLocomotives = [];
  if (!SR_BUR_MAKE_OPTIONS.includes(entry.srMake)) entry.srMake = SR_BUR_MAKE_OPTIONS[0];
  if (!SR_BUR_MAKE_OPTIONS.includes(entry.burMake)) entry.burMake = SR_BUR_MAKE_OPTIONS[0];
  if (!HOG_MAKE_OPTIONS.includes(entry.hogMake)) entry.hogMake = HOG_MAKE_OPTIONS[0];
  if (!HOG_STATUS_OPTIONS.includes(entry.hogStatus)) entry.hogStatus = HOG_STATUS_OPTIONS[0];
  if (entry.hogMake === "NON HOG") entry.uicStatus = UICStatus.NON_HOG;
  else if (!COMPONENT_UIC_OPTIONS.includes(entry.uicStatus)) entry.uicStatus = "Normal";
  if (!CABLE_CONNECTED_OPTIONS.includes(entry.uicCableConnected)) {
    if (entry.uicCableOption === UICCableOption.ONE_CABLE) entry.uicCableConnected = "1 Cable";
    else if (entry.uicCableOption === UICCableOption.BOTH_CABLE) entry.uicCableConnected = "2 Cables";
    else entry.uicCableConnected = CABLE_CONNECTED_OPTIONS[0];
  }
  if (entry.srMakeOther === undefined) entry.srMakeOther = "";
  if (entry.burMakeOther === undefined) entry.burMakeOther = "";
  if (entry.hogMakeOther === undefined) entry.hogMakeOther = "";
  if (!FITTED_OPTIONS.includes(entry.rtisFitted)) entry.rtisFitted = FITTED_OPTIONS[0];
  if (!RTIS_COMPONENT_STATUS_OPTIONS.includes(entry.rtisStatus)) entry.rtisStatus = RTIS_COMPONENT_STATUS_OPTIONS[0];
  if (!FITTED_OPTIONS.includes(entry.acFitted)) entry.acFitted = FITTED_OPTIONS[0];
  if (!AC_COMPONENT_STATUS_OPTIONS.includes(entry.acStatus)) entry.acStatus = AC_COMPONENT_STATUS_OPTIONS[0];
  if (!KAVACH_MAKE_OPTIONS.includes(entry.kavachMake)) entry.kavachMake = KAVACH_MAKE_OPTIONS[0];
  if (!KAVACH_STATUS_OPTIONS.includes(entry.kavachStatus)) entry.kavachStatus = KAVACH_STATUS_OPTIONS[0];
  if (!BRAKE_SYSTEM_OPTIONS.includes(entry.brakeSystem)) entry.brakeSystem = BRAKE_SYSTEM_OPTIONS[0];
  if (!SPM_MAKE_OPTIONS.includes(entry.spmMake)) entry.spmMake = SPM_MAKE_OPTIONS[0];
  if (entry.spmMakeOther === undefined) entry.spmMakeOther = "";
  if (entry.mcStatus === undefined) entry.mcStatus = "";
  if (entry.ubaDjOpen === undefined) entry.ubaDjOpen = "";
  if (entry.ubaDjClosed === undefined) entry.ubaDjClosed = "";
  const spareItemDefaults = {
    bp: false, fp: false, sc: false, tsc: false, fourWw: false,
    fireExt: false, ptFuse: false, other: false, otherText: "",
  };
  entry.spareItems = { ...spareItemDefaults, ...(entry.spareItems || {}) };
  if (!MAJOR_SCHEDULE_OPTIONS.includes(entry.majorScheduleTypeCode)) entry.majorScheduleTypeCode = MAJOR_SCHEDULE_OPTIONS[0];
  if (!Array.isArray(entry.minorSchedules)) {
    const migratedSchedule = newMinorSchedule();
    migratedSchedule.date = entry.minorScheduleTIDate || null;
    migratedSchedule.km = entry.kmSinceLastSchedule ?? null;
    entry.minorSchedules = [migratedSchedule];
  }
  if (entry.minorSchedules.length === 0) entry.minorSchedules.push(newMinorSchedule());
  for (const schedule of entry.minorSchedules) {
    if (!schedule.id) schedule.id = crypto.randomUUID();
    if (!MINOR_SCHEDULE_TYPE_OPTIONS.includes(schedule.type)) schedule.type = MINOR_SCHEDULE_TYPE_OPTIONS[0];
    if (schedule.date === undefined) schedule.date = null;
    if (schedule.km === undefined) schedule.km = null;
  }
  const locomotives = await DB.getAll("locomotives");
  const allDutyEntries = await DB.getAll("dutyEntries");
  const locomotiveHistory = buildLocomotiveHistory(allDutyEntries, locomotives, entry.id);
  const linkedLegacyLocomotive = locomotives.find((loco) => loco.id === entry.locomotiveId);
  if (!entry.locomotiveNumberSnapshot && linkedLegacyLocomotive) entry.locomotiveNumberSnapshot = normalizeLocomotiveNumber(linkedLegacyLocomotive.number);
  if (!entry.locomotiveType && linkedLegacyLocomotive) entry.locomotiveType = linkedLegacyLocomotive.locoClass || "";
  if (!entry.locomotiveShed && linkedLegacyLocomotive) entry.locomotiveShed = sanitizeShedCode(linkedLegacyLocomotive.shed);
  if (!entry.locomotiveType && !entry.locomotiveShed && entry.locomotiveNumberSnapshot) {
    const remembered = locomotiveHistory.get(normalizeLocomotiveNumber(entry.locomotiveNumberSnapshot));
    if (remembered) {
      entry.locomotiveType = remembered.type;
      entry.locomotiveShed = remembered.shed;
    }
  }
  const autosave = new AutosaveController(async () => {
    entry.lastModified = new Date().toISOString();
    await DB.put("dutyEntries", entry);
  });
  currentUnwireLifecycle = wireLifecycleFlush(autosave);

  async function goBack() {
    await autosave.flush();
    if (isEntryEmpty(entry)) {
      await DB.delete("dutyEntries", entry.id);
    }
    showList(container, setHeaderTitle);
  }

  function onFieldChange() {
    autosave.fieldChanged();
  }

  const header = el("div", { class: "sheet-header" }, [
    el("button", { class: "icon-btn", onclick: goBack }, "← Back"),
    el("div", {}, [
      el("button", { class: "icon-btn", onclick: () => openExportCard(entry, locomotives) }, "⇪"),
      el("button", { class: "icon-btn", onclick: async () => {
        if (confirm("Delete this duty entry?")) {
          await DB.delete("dutyEntries", entry.id);
          showList(container, setHeaderTitle);
        }
      } }, "🗑"),
    ]),
  ]);
  container.appendChild(header);

  const stepHeading = el("div", { style: "font-weight:700;font-size:16px;" }, "Train & Loco Details");
  const stepCount = el("div", { style: "color:var(--text-muted);font-size:13px;" }, "Step 1 of 2");
  const progressFill = el("div", { style: "height:100%;width:50%;background:var(--maroon);border-radius:999px;transition:width .2s ease;" });
  const progressCard = el("div", { class: "card", style: "padding:14px;margin-bottom:12px;" }, [
    el("div", { style: "display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:10px;" }, [stepHeading, stepCount]),
    el("div", { style: "height:5px;background:var(--border);border-radius:999px;overflow:hidden;" }, [progressFill]),
  ]);
  const trainLocoPage = el("div", {});
  const remainingDetailsPage = el("div", { style: "display:none;" });

  function showDeparturePage(pageNumber) {
    const showFirstPage = pageNumber === 1;
    trainLocoPage.style.display = showFirstPage ? "block" : "none";
    remainingDetailsPage.style.display = showFirstPage ? "none" : "block";
    stepHeading.textContent = showFirstPage ? "Train & Loco Details" : "Movement Details";
    stepCount.textContent = showFirstPage ? "Step 1 of 2" : "Step 2 of 2";
    progressFill.style.width = showFirstPage ? "50%" : "100%";
    container.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  container.appendChild(progressCard);
  container.appendChild(trainLocoPage);
  container.appendChild(remainingDetailsPage);

  // --- Trip Info ---
  const tripSection = el("div", { class: "form-section" });
  tripSection.appendChild(el("div", { class: "form-section-title" }, "Trip Info"));
  tripSection.appendChild(el("div", { class: "form-row" }, [
    el("label", {}, "Date"),
    el("input", { type: "date", value: entry.date || todayDateInputValue(), onchange: (e) => { entry.date = e.target.value; onFieldChange(); } }),
  ]));
  tripSection.appendChild(el("div", { class: "form-row" }, [
    el("label", {}, "Train Number"),
    el("input", { type: "text", value: entry.trainNumber || "", oninput: (e) => { entry.trainNumber = e.target.value; onFieldChange(); } }),
  ]));
  tripSection.appendChild(el("div", { class: "form-row" }, [
    el("label", {}, "Train Name"),
    el("input", { type: "text", value: entry.trainName || "", oninput: (e) => { entry.trainName = e.target.value; onFieldChange(); } }),
  ]));
  const locomotiveRow = el("div", { class: "form-row locomotive-row" });
  locomotiveRow.appendChild(el("label", { class: "locomotive-heading" }, "Locomotive"));

  const recallNote = el("div", { class: "loco-recall-note hidden" }, "Previous details found — type and shed filled.");
  const typeSelect = el("select", { "aria-label": "Locomotive type" });
  typeSelect.appendChild(el("option", { value: "", disabled: "" }, "Select"));
  for (const type of LOCOMOTIVE_TYPE_OPTIONS) typeSelect.appendChild(el("option", { value: type }, type));

  function renderTypeControl() {
    typeSelect.value = canonicalLocomotiveType(entry.locomotiveType);
  }

  typeSelect.addEventListener("change", (e) => {
    entry.locomotiveType = e.target.value;
    onFieldChange();
  });

  const shedInput = el("input", {
    type: "text",
    value: sanitizeShedCode(entry.locomotiveShed),
    placeholder: "TKD",
    minlength: "3",
    maxlength: "4",
    pattern: "[A-Z]{3,4}",
    autocapitalize: "characters",
    "aria-label": "Shed code",
    oninput: (e) => {
      const value = sanitizeShedCode(e.target.value);
      e.target.value = value;
      entry.locomotiveShed = value;
      onFieldChange();
    },
  });

  const numberInput = el("input", {
    type: "text",
    value: normalizeLocomotiveNumber(entry.locomotiveNumberSnapshot),
    placeholder: "Number",
    inputmode: "numeric",
    pattern: "[0-9]*",
    "aria-label": "Locomotive number",
    oninput: (e) => {
      const number = normalizeLocomotiveNumber(e.target.value);
      e.target.value = number;
      entry.locomotiveId = null;
      entry.locomotiveNumberSnapshot = number;
      const remembered = locomotiveHistory.get(number);
      if (remembered) {
        entry.locomotiveType = remembered.type;
        entry.locomotiveShed = remembered.shed;
        shedInput.value = remembered.shed;
        renderTypeControl();
        recallNote.classList.remove("hidden");
      } else {
        recallNote.classList.add("hidden");
      }
      onFieldChange();
    },
  });

  const fieldsGrid = el("div", { class: "locomotive-fields" }, [
    el("div", { class: "locomotive-field" }, [el("span", {}, "Loco No."), numberInput]),
    el("div", { class: "locomotive-field" }, [el("span", {}, "Type"), typeSelect]),
    el("div", { class: "locomotive-field" }, [el("span", {}, "Shed"), shedInput]),
  ]);
  locomotiveRow.appendChild(fieldsGrid);
  locomotiveRow.appendChild(recallNote);
  tripSection.appendChild(locomotiveRow);
  renderTypeControl();

  const cabSelect = el("select", { onchange: (e) => { entry.cabSelection = e.target.value; onFieldChange(); } });
  cabSelect.appendChild(el("option", { value: "", disabled: "" }, "Select cab"));
  for (const cab of CAB_OPTIONS) {
    const option = el("option", { value: cab }, cab);
    if (entry.cabSelection === cab) option.selected = true;
    cabSelect.appendChild(option);
  }

  const ptTypeSelect = createDropdown(PT_TYPE_OPTIONS, entry.locomotivePTType, (value) => {
    entry.locomotivePTType = value;
    onFieldChange();
  });
  tripSection.appendChild(el("div", { class: "form-row cab-pt-row" }, [
    el("div", { class: "cab-pt-grid" }, [
      el("div", { class: "cab-pt-field" }, [el("label", {}, "Cab"), cabSelect]),
      el("div", { class: "cab-pt-field" }, [el("label", {}, "PT Type"), ptTypeSelect]),
    ]),
  ]));

  const additionalLocomotivesHolder = el("div", { class: "additional-locomotives" });

  function renderAdditionalLocomotives() {
    additionalLocomotivesHolder.innerHTML = "";
    const roleCounts = { slave: 0, dead: 0 };

    entry.additionalLocomotives.forEach((locomotive, index) => {
      const role = locomotive.role === "dead" ? "dead" : "slave";
      roleCounts[role] += 1;
      const roleTitle = `${role === "dead" ? "Dead Loco" : "Slave Loco"} ${roleCounts[role]}`;
      if (!locomotive.ptType) locomotive.ptType = PT_TYPE_OPTIONS[0];

      const additionalRecallNote = el("div", { class: "loco-recall-note hidden" }, "Previous details found — type and shed filled.");
      const additionalTypeSelect = el("select", { "aria-label": `${roleTitle} type` });
      additionalTypeSelect.appendChild(el("option", { value: "", disabled: "" }, "Select"));
      for (const type of LOCOMOTIVE_TYPE_OPTIONS) additionalTypeSelect.appendChild(el("option", { value: type }, type));
      additionalTypeSelect.value = canonicalLocomotiveType(locomotive.locomotiveType);
      additionalTypeSelect.addEventListener("change", (event) => {
        locomotive.locomotiveType = event.target.value;
        onFieldChange();
      });

      const additionalShedInput = el("input", {
        type: "text",
        value: sanitizeShedCode(locomotive.locomotiveShed),
        placeholder: "TKD",
        minlength: "3",
        maxlength: "4",
        pattern: "[A-Z]{3,4}",
        autocapitalize: "characters",
        "aria-label": `${roleTitle} shed code`,
        oninput: (event) => {
          const value = sanitizeShedCode(event.target.value);
          event.target.value = value;
          locomotive.locomotiveShed = value;
          onFieldChange();
        },
      });

      const additionalNumberInput = el("input", {
        type: "text",
        value: normalizeLocomotiveNumber(locomotive.locomotiveNumberSnapshot),
        placeholder: "Number",
        inputmode: "numeric",
        pattern: "[0-9]*",
        "aria-label": `${roleTitle} number`,
        oninput: (event) => {
          const number = normalizeLocomotiveNumber(event.target.value);
          event.target.value = number;
          locomotive.locomotiveNumberSnapshot = number;
          const remembered = locomotiveHistory.get(number);
          if (remembered) {
            locomotive.locomotiveType = remembered.type;
            locomotive.locomotiveShed = remembered.shed;
            additionalTypeSelect.value = remembered.type;
            additionalShedInput.value = remembered.shed;
            additionalRecallNote.classList.remove("hidden");
          } else {
            additionalRecallNote.classList.add("hidden");
          }
          onFieldChange();
        },
      });

      const additionalCabSelect = el("select", {
        "aria-label": `${roleTitle} cab`,
        onchange: (event) => {
          locomotive.cabSelection = event.target.value;
          onFieldChange();
        },
      });
      additionalCabSelect.appendChild(el("option", { value: "", disabled: "" }, "Select cab"));
      for (const cab of CAB_OPTIONS) {
        const option = el("option", { value: cab }, cab);
        if (locomotive.cabSelection === cab) option.selected = true;
        additionalCabSelect.appendChild(option);
      }

      const additionalPTTypeSelect = createDropdown(PT_TYPE_OPTIONS, locomotive.ptType, (value) => {
        locomotive.ptType = value;
        onFieldChange();
      });
      additionalPTTypeSelect.setAttribute("aria-label", `${roleTitle} PT type`);

      const additionalCard = el("div", { class: "additional-loco-card" }, [
        el("div", { class: "additional-loco-header" }, [
          el("div", { class: "additional-loco-title" }, roleTitle),
          el("button", {
            class: "remove-loco-btn",
            type: "button",
            "aria-label": `Remove ${roleTitle}`,
            onclick: () => {
              entry.additionalLocomotives.splice(index, 1);
              renderAdditionalLocomotives();
              onFieldChange();
            },
          }, "Remove"),
        ]),
        el("div", { class: "locomotive-fields" }, [
          el("div", { class: "locomotive-field" }, [el("span", {}, "Loco No."), additionalNumberInput]),
          el("div", { class: "locomotive-field" }, [el("span", {}, "Type"), additionalTypeSelect]),
          el("div", { class: "locomotive-field" }, [el("span", {}, "Shed"), additionalShedInput]),
        ]),
        additionalRecallNote,
        el("div", { class: "cab-pt-grid additional-cab-pt-grid" }, [
          el("div", { class: "cab-pt-field" }, [el("label", {}, "Cab"), additionalCabSelect]),
          el("div", { class: "cab-pt-field" }, [el("label", {}, "PT Type"), additionalPTTypeSelect]),
        ]),
      ]);
      additionalLocomotivesHolder.appendChild(additionalCard);
    });
  }

  function openAdditionalLocomotivePicker() {
    const overlay = el("div", { class: "overlay" });
    function addLocomotive(role) {
      entry.additionalLocomotives.push(newAdditionalLocomotive(role));
      overlay.remove();
      renderAdditionalLocomotives();
      onFieldChange();
    }

    overlay.appendChild(el("div", { class: "overlay-card" }, [
      el("div", { style: "display:flex;align-items:center;justify-content:space-between;gap:12px;" }, [
        el("h2", {}, "Add Locomotive"),
        el("button", {
          class: "icon-btn",
          type: "button",
          "aria-label": "Close locomotive selection",
          onclick: () => overlay.remove(),
        }, "×"),
      ]),
      el("p", {}, "Select how this locomotive is attached to the train."),
      el("div", { style: "display:grid;gap:10px;" }, [
        el("button", { class: "primary-btn", type: "button", onclick: () => addLocomotive("slave") }, "Add Slave Loco"),
        el("button", { class: "secondary-btn", type: "button", style: "width:100%;", onclick: () => addLocomotive("dead") }, "Add Dead Loco"),
      ]),
    ]));
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) overlay.remove();
    });
    document.body.appendChild(overlay);
  }

  tripSection.appendChild(additionalLocomotivesHolder);
  tripSection.appendChild(el("div", { class: "add-loco-row" }, [
    el("button", {
      class: "secondary-btn add-loco-btn",
      type: "button",
      onclick: openAdditionalLocomotivePicker,
    }, "+ Add Loco"),
  ]));
  renderAdditionalLocomotives();
  trainLocoPage.appendChild(tripSection);

  // --- Major Schedule ---
  const majorScheduleSection = el("div", { class: "form-section" });
  majorScheduleSection.appendChild(el("div", { class: "form-section-title" }, "Major Schedule"));
  const majorOverdueAlert = el("div", { class: "schedule-alert hidden" }, "Major Schedule overdue — selected date is more than 90 days old.");

  function renderMajorScheduleAlert() {
    if (!entry.majorScheduleDate) {
      majorOverdueAlert.classList.add("hidden");
      return;
    }
    const selectedDate = new Date(`${entry.majorScheduleDate}T00:00:00`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const ninetyDaysAgo = new Date(today);
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    majorOverdueAlert.classList.toggle("hidden", selectedDate >= ninetyDaysAgo);
  }

  const majorTypeSelect = createDropdown(MAJOR_SCHEDULE_OPTIONS, entry.majorScheduleTypeCode, (value) => {
    entry.majorScheduleTypeCode = value;
    onFieldChange();
  }, { "aria-label": "Major schedule type" });
  const majorDateInput = el("input", {
    type: "date",
    value: entry.majorScheduleDate || "",
    "aria-label": "Major schedule date",
    onchange: (event) => {
      entry.majorScheduleDate = event.target.value || null;
      renderMajorScheduleAlert();
      onFieldChange();
    },
  });
  majorScheduleSection.appendChild(el("div", { class: "schedule-fields-grid major-schedule-fields" }, [
    el("div", { class: "schedule-field" }, [el("label", {}, "Type"), majorTypeSelect]),
    el("div", { class: "schedule-field" }, [el("label", {}, "Date"), majorDateInput]),
  ]));
  majorScheduleSection.appendChild(majorOverdueAlert);
  renderMajorScheduleAlert();
  trainLocoPage.appendChild(majorScheduleSection);

  // --- Minor Schedules ---
  const minorScheduleSection = el("div", { class: "form-section" });
  minorScheduleSection.appendChild(el("div", { class: "form-section-title" }, "Minor Schedule"));
  const minorSchedulesHolder = el("div", { class: "minor-schedules" });

  function syncLegacyMinorScheduleFields() {
    const firstSchedule = entry.minorSchedules[0];
    entry.minorScheduleTIDate = firstSchedule ? firstSchedule.date || null : null;
    entry.kmSinceLastSchedule = firstSchedule ? firstSchedule.km ?? null : null;
  }

  function renderMinorSchedules() {
    minorSchedulesHolder.innerHTML = "";
    entry.minorSchedules.forEach((schedule, index) => {
      const scheduleNumber = index + 1;
      const kmInput = el("input", {
        type: "number",
        inputmode: "decimal",
        min: "0",
        value: schedule.km ?? "",
        placeholder: "KM",
        "aria-label": `Minor schedule ${scheduleNumber} KM`,
      });
      const kmAlert = el("div", { class: "schedule-inline-alert hidden" }, "KM exceeds 4500");

      function renderKmAlert() {
        const exceedsLimit = schedule.km !== null && schedule.km !== undefined && Number(schedule.km) > 4500;
        kmInput.classList.toggle("input-alert", exceedsLimit);
        kmAlert.classList.toggle("hidden", !exceedsLimit);
      }

      kmInput.addEventListener("input", (event) => {
        schedule.km = event.target.value === "" ? null : Number(event.target.value);
        syncLegacyMinorScheduleFields();
        renderKmAlert();
        onFieldChange();
      });

      const scheduleCard = el("div", { class: "minor-schedule-card" }, [
        el("div", { class: "minor-schedule-header" }, [
          el("div", { class: "minor-schedule-title" }, `Minor Schedule ${scheduleNumber}`),
          entry.minorSchedules.length > 1 ? el("button", {
            class: "remove-loco-btn",
            type: "button",
            "aria-label": `Remove minor schedule ${scheduleNumber}`,
            onclick: () => {
              entry.minorSchedules.splice(index, 1);
              syncLegacyMinorScheduleFields();
              renderMinorSchedules();
              onFieldChange();
            },
          }, "Remove") : null,
        ]),
        el("div", { class: "schedule-fields-grid minor-schedule-fields" }, [
          el("div", { class: "schedule-field" }, [
            el("label", {}, "Type"),
            createDropdown(MINOR_SCHEDULE_TYPE_OPTIONS, schedule.type, (value) => {
              schedule.type = value;
              onFieldChange();
            }, { "aria-label": `Minor schedule ${scheduleNumber} type` }),
          ]),
          el("div", { class: "schedule-field" }, [
            el("label", {}, "Date"),
            el("input", {
              type: "date",
              value: schedule.date || "",
              "aria-label": `Minor schedule ${scheduleNumber} date`,
              onchange: (event) => {
                schedule.date = event.target.value || null;
                syncLegacyMinorScheduleFields();
                onFieldChange();
              },
            }),
          ]),
          el("div", { class: "schedule-field" }, [el("label", {}, "KM"), kmInput, kmAlert]),
        ]),
      ]);
      minorSchedulesHolder.appendChild(scheduleCard);
      renderKmAlert();
    });
  }

  minorScheduleSection.appendChild(minorSchedulesHolder);
  minorScheduleSection.appendChild(el("div", { class: "add-loco-row" }, [
    el("button", {
      class: "secondary-btn add-loco-btn",
      type: "button",
      onclick: () => {
        entry.minorSchedules.push(newMinorSchedule());
        renderMinorSchedules();
        onFieldChange();
      },
    }, "+ Add Minor Schedule"),
  ]));
  syncLegacyMinorScheduleFields();
  renderMinorSchedules();
  trainLocoPage.appendChild(minorScheduleSection);

  // --- Loco Components Details ---
  const componentSection = el("div", { class: "form-section" });
  componentSection.appendChild(el("div", { class: "form-section-title" }, "Loco Components Details"));

  function createMakeField(label, fieldKey, otherFieldKey, options, onSelect) {
    const manualInput = el("input", {
      type: "text",
      value: entry[otherFieldKey] || "",
      placeholder: `Enter ${label}`,
      "aria-label": `${label} manual entry`,
      oninput: (event) => {
        entry[otherFieldKey] = event.target.value;
        onFieldChange();
      },
    });

    function renderManualInput() {
      manualInput.classList.toggle("hidden", entry[fieldKey] !== "Other");
    }

    const select = createDropdown(options, entry[fieldKey], (value) => {
      entry[fieldKey] = value;
      renderManualInput();
      if (onSelect) onSelect(value);
      onFieldChange();
    }, { "aria-label": label });
    renderManualInput();

    return el("div", { class: "schedule-field component-field" }, [
      el("label", {}, label),
      select,
      manualInput,
    ]);
  }

  function syncLegacyCableValue(value) {
    if (value === "1 Cable") entry.uicCableOption = UICCableOption.ONE_CABLE;
    else if (value === "2 Cables") entry.uicCableOption = UICCableOption.BOTH_CABLE;
    else entry.uicCableOption = null;
  }

  componentSection.appendChild(el("div", { class: "schedule-fields-grid major-schedule-fields component-details-row" }, [
    createMakeField("SR Make", "srMake", "srMakeOther", SR_BUR_MAKE_OPTIONS),
    createMakeField("BUR Make", "burMake", "burMakeOther", SR_BUR_MAKE_OPTIONS),
  ]));
  const componentUICSelect = createDropdown(COMPONENT_UIC_OPTIONS, COMPONENT_UIC_OPTIONS.includes(entry.uicStatus) ? entry.uicStatus : "Normal", (value) => {
    entry.uicStatus = value;
    onFieldChange();
  }, { "aria-label": "UIC status" });
  const cableConnectedSelect = createDropdown(CABLE_CONNECTED_OPTIONS, entry.uicCableConnected, (value) => {
    entry.uicCableConnected = value;
    syncLegacyCableValue(value);
    onFieldChange();
  }, { "aria-label": "Cable connected" });
  const uicCableComponentRow = el("div", { class: "schedule-fields-grid major-schedule-fields component-details-row" }, [
    el("div", { class: "schedule-field component-field" }, [
      el("label", {}, "UIC"),
      componentUICSelect,
    ]),
    el("div", { class: "schedule-field component-field" }, [
      el("label", {}, "Cable Connected"),
      cableConnectedSelect,
    ]),
  ]);

  function renderHogDependentFields() {
    const isNonHog = entry.hogMake === "NON HOG";
    uicCableComponentRow.classList.toggle("hidden", isNonHog);
    if (isNonHog) {
      entry.uicStatus = UICStatus.NON_HOG;
      entry.uicCableConnected = "HOG Not Connected";
    } else if (entry.uicStatus === UICStatus.NON_HOG) {
      entry.uicStatus = "Normal";
      entry.uicCableConnected = CABLE_CONNECTED_OPTIONS[0];
    }
    componentUICSelect.value = COMPONENT_UIC_OPTIONS.includes(entry.uicStatus) ? entry.uicStatus : "Normal";
    cableConnectedSelect.value = entry.uicCableConnected;
    syncLegacyCableValue(entry.uicCableConnected);
  }

  componentSection.appendChild(el("div", { class: "schedule-fields-grid major-schedule-fields component-details-row" }, [
    createMakeField("HOG Make", "hogMake", "hogMakeOther", HOG_MAKE_OPTIONS, renderHogDependentFields),
    el("div", { class: "schedule-field component-field" }, [
      el("label", {}, "HOG Status"),
      createDropdown(HOG_STATUS_OPTIONS, entry.hogStatus, (value) => {
        entry.hogStatus = value;
        onFieldChange();
      }, { "aria-label": "HOG status" }),
    ]),
  ]));
  componentSection.appendChild(uicCableComponentRow);
  renderHogDependentFields();

  function createComponentDropdownField(label, fieldKey, options) {
    return el("div", { class: "schedule-field component-field" }, [
      el("label", {}, label),
      createDropdown(options, entry[fieldKey], (value) => {
        entry[fieldKey] = value;
        onFieldChange();
      }, { "aria-label": label }),
    ]);
  }

  function createManualComponentField(label, fieldKey) {
    return el("div", { class: "schedule-field component-field" }, [
      el("label", {}, label),
      el("input", {
        type: "text",
        value: entry[fieldKey] || "",
        "aria-label": label,
        oninput: (event) => {
          entry[fieldKey] = event.target.value;
          onFieldChange();
        },
      }),
    ]);
  }

  componentSection.appendChild(el("div", { class: "schedule-fields-grid major-schedule-fields component-details-row" }, [
    createComponentDropdownField("RTIS", "rtisFitted", FITTED_OPTIONS),
    createComponentDropdownField("RTIS Status", "rtisStatus", RTIS_COMPONENT_STATUS_OPTIONS),
  ]));
  componentSection.appendChild(el("div", { class: "schedule-fields-grid major-schedule-fields component-details-row" }, [
    createComponentDropdownField("AC", "acFitted", FITTED_OPTIONS),
    createComponentDropdownField("AC Status", "acStatus", AC_COMPONENT_STATUS_OPTIONS),
  ]));
  componentSection.appendChild(el("div", { class: "schedule-fields-grid major-schedule-fields component-details-row" }, [
    createComponentDropdownField("KAVACH Make", "kavachMake", KAVACH_MAKE_OPTIONS),
    createComponentDropdownField("KAVACH Status", "kavachStatus", KAVACH_STATUS_OPTIONS),
  ]));
  componentSection.appendChild(el("div", { class: "schedule-fields-grid major-schedule-fields component-details-row" }, [
    createComponentDropdownField("Brake System", "brakeSystem", BRAKE_SYSTEM_OPTIONS),
    createMakeField("SPM Make", "spmMake", "spmMakeOther", SPM_MAKE_OPTIONS),
  ]));
  componentSection.appendChild(el("div", { class: "schedule-fields-grid component-details-row single-component-row" }, [
    createManualComponentField("MC Status", "mcStatus"),
  ]));
  componentSection.appendChild(el("div", { class: "schedule-fields-grid major-schedule-fields component-details-row" }, [
    createManualComponentField("UBA DJ OPEN", "ubaDjOpen"),
    createManualComponentField("UBA DJ CLOSED", "ubaDjClosed"),
  ]));

  const spareItems = [
    ["bp", "BP"],
    ["fp", "FP"],
    ["sc", "SC"],
    ["tsc", "TSC"],
    ["fourWw", "4WW"],
    ["fireExt", "2+2 Fire Ext."],
    ["ptFuse", "2 PT-Fuse"],
    ["other", "Other"],
  ];
  const spareChecklist = el("div", { class: "spare-items-grid" });
  const spareOtherInput = el("input", {
    class: "spare-other-input",
    type: "text",
    value: entry.spareItems.otherText || "",
    placeholder: "Enter other spare item",
    "aria-label": "Other spare item",
    oninput: (event) => {
      entry.spareItems.otherText = event.target.value;
      onFieldChange();
    },
  });

  function renderSpareOtherInput() {
    spareOtherInput.classList.toggle("hidden", !entry.spareItems.other);
  }

  for (const [key, label] of spareItems) {
    const itemName = el("span", { class: "spare-item-name" }, label);
    const checkbox = el("input", {
      type: "checkbox",
      "aria-label": `${label} available`,
      onchange: (event) => {
        entry.spareItems[key] = event.target.checked;
        itemLabel.classList.toggle("is-available", event.target.checked);
        if (key === "other") renderSpareOtherInput();
        onFieldChange();
      },
    });
    checkbox.checked = Boolean(entry.spareItems[key]);
    const itemLabel = el("label", {
      class: `spare-item-check${entry.spareItems[key] ? " is-available" : ""}`,
    }, [checkbox, itemName]);
    spareChecklist.appendChild(itemLabel);
  }
  renderSpareOtherInput();
  componentSection.appendChild(el("div", { class: "schedule-fields-grid component-details-row single-component-row" }, [
    el("div", { class: "schedule-field component-field spare-items-field" }, [
      el("label", {}, "Spare Items Available"),
      spareChecklist,
      spareOtherInput,
    ]),
  ]));
  trainLocoPage.appendChild(componentSection);

  trainLocoPage.appendChild(el("button", {
    class: "primary-btn",
    type: "button",
    onclick: () => showDeparturePage(2),
  }, "Next: Movement Details →"));

  // --- Timeline of Working ---
  const timelineSection = el("div", { class: "form-section" });
  timelineSection.appendChild(el("div", { class: "form-section-title" }, "Timeline of Working"));
  for (const step of TIMELINE_STEPS) {
    const row = el("div", { class: "time-row" });
    row.appendChild(el("div", { class: "time-row-label" }, step.label));
    row.appendChild(createTimeField(entry.date, entry[step.key], (val) => { entry[step.key] = val; onFieldChange(); }));
    timelineSection.appendChild(row);
    if (step.key === "buildupTime") {
      timelineSection.appendChild(el("div", { class: "form-row" }, [
        el("label", {}, "Buildup Location"),
        el("input", { type: "text", value: entry.buildupLocation || "", oninput: (e) => { entry.buildupLocation = e.target.value; onFieldChange(); } }),
      ]));
    }
  }
  remainingDetailsPage.appendChild(timelineSection);

  // --- Remarks ---
  const remarksSection = el("div", { class: "form-section" });
  remarksSection.appendChild(el("div", { class: "form-section-title" }, "Remarks"));
  remarksSection.appendChild(el("div", { class: "form-row" }, [
    el("textarea", { oninput: (e) => { entry.remarks = e.target.value; onFieldChange(); } }, entry.remarks || ""),
  ]));
  remainingDetailsPage.appendChild(remarksSection);
  remainingDetailsPage.appendChild(el("button", {
    class: "secondary-btn",
    type: "button",
    style: "width:100%;margin-bottom:12px;",
    onclick: () => showDeparturePage(1),
  }, "← Train & Loco Details"));
}
