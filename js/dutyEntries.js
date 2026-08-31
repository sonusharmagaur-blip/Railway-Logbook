import { DB } from "./db.js";
import {
  newDutyEntry, TIMELINE_STEPS,
  ACStatus, UICStatus, LOCOMOTIVE_TYPE_OPTIONS, CAB_OPTIONS,
  PT_TYPE_OPTIONS, MAJOR_SCHEDULE_OPTIONS, MINOR_SCHEDULE_TYPE_OPTIONS,
  SR_BUR_MAKE_OPTIONS, HOG_MAKE_OPTIONS, HOG_STATUS_OPTIONS,
  COMPONENT_UIC_OPTIONS, CABLE_CONNECTED_OPTIONS,
  FITTED_OPTIONS, RTIS_COMPONENT_STATUS_OPTIONS, AC_COMPONENT_STATUS_OPTIONS,
  KAVACH_MAKE_OPTIONS, KAVACH_STATUS_OPTIONS, BRAKE_SYSTEM_OPTIONS, SPM_MAKE_OPTIONS,
  LOCO_OFFER_PLACE_OPTIONS, BP_FP_PLACE_OPTIONS, OFFICIAL_DESIGNATION_OPTIONS,
  newAdditionalLocomotive, newMinorSchedule, UICCableOption,
} from "./models.js";
import { AutosaveController, wireLifecycleFlush } from "./autosave.js";
import { el, formatDate, formatTime, createTimeField, createDropdown, todayDateInputValue } from "./util.js";
import { openExportCard } from "./exportCard.js";
import { openRangeReport } from "./rangeReport.js";
import { showToast } from "./toast.js";

let currentUnwireLifecycle = null;
let resumePromptDismissedForSession = false;

function isEntryEmpty(entry) {
  if (entry.trainNumber || entry.trainName || entry.repairList || entry.remarks) return false;
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
  if (entry.locoTakeoverPlace || entry.locoOfferPlaceOther || entry.engineOnTrainPlace || entry.hogAttachedPlace) return false;
  if (entry.locoOfferPlace && entry.locoOfferPlace !== LOCO_OFFER_PLACE_OPTIONS[0]) return false;
  if (entry.bpFpPlace && entry.bpFpPlace !== BP_FP_PLACE_OPTIONS[0]) return false;
  if (entry.bpFpPlaceOther || entry.yardSignal || entry.privateNumber || entry.yardMasterName || entry.pmName) return false;
  if ((entry.privateNumberDetails || []).some((detail) =>
    detail.signalNumber || detail.fromLine || detail.toLine || detail.departureTime || detail.yardMasterName || detail.pmName
  )) return false;
  if ((entry.officialDetails || []).some((detail) => detail.designation || detail.name)) return false;
  if (entry.placementPfNumber || entry.madeOverChargeName || entry.madeOverChargeHQ) return false;
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

function fieldIconForLabel(label) {
  const value = String(label || "").toLowerCase();
  if (value.includes("train")) return "🚆";
  if (value.includes("loco")) return "🚂";
  if (value.includes("date")) return "📅";
  if (value.includes("signal")) return "🚦";
  if (value.includes("time") || value.includes("upto") || value.includes("attached") || value === "yard dep") return "🕒";
  if (value.includes("shed")) return "🏭";
  if (value.includes("cab")) return "🚪";
  if (value.includes("pt type")) return "⚡";
  if (value.includes("rtis")) return "📡";
  if (value.includes("kavach")) return "🛡️";
  if (value.includes("brake")) return "🛑";
  if (value.includes("spm")) return "📟";
  if (value.includes("uic") || value.includes("cable")) return "🔌";
  if (value === "ac" || value.startsWith("ac status")) return "❄️";
  if (value.includes("spare")) return "📦";
  if (value.includes("repair")) return "🛠️";
  if (value.includes("name") || value.includes("designation") || value.includes("charge")) return "👤";
  if (value.includes("place") || value.includes("line") || value.includes("pf no") || value === "hq") return "📍";
  if (value.includes("km")) return "🛣️";
  if (value === "search") return "🔎";
  if (value === "from" || value === "to") return "↔";
  if (value.includes("status")) return "✓";
  if (value.includes("make") || value === "type" || value.includes("system")) return "⚙️";
  if (value.includes("uba dj")) return "⚡";
  return "•";
}

function fieldLabel(label, attrs = {}) {
  const classes = [attrs.class, "field-label-with-icon"].filter(Boolean).join(" ");
  return el("label", { ...attrs, class: classes }, [
    el("span", { class: "field-label-icon", "aria-hidden": "true" }, fieldIconForLabel(label)),
    el("span", {}, label),
  ]);
}

function fieldCaption(label) {
  return el("span", { class: "field-caption-with-icon" }, [
    el("span", { class: "field-label-icon", "aria-hidden": "true" }, fieldIconForLabel(label)),
    el("span", {}, label),
  ]);
}

function actionIcon(kind) {
  const paths = {
    share: '<path d="M12 3v11m0-11 4 4m-4-4L8 7"/><path d="M5 11v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/>',
    delete: '<path d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13M10 11v5m4-5v5"/>',
  };
  return el("span", {
    class: "action-icon",
    "aria-hidden": "true",
    html: `<svg viewBox="0 0 24 24" focusable="false">${paths[kind]}</svg>`,
  });
}

function actionButton(label, kind, onclick, tone = "") {
  return el("button", {
    class: `icon-action-btn${tone ? ` ${tone}` : ""}`,
    type: "button",
    title: label,
    "aria-label": label,
    onclick,
  }, [actionIcon(kind), el("span", { class: "icon-action-label" }, label)]);
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
  const entries = await DB.getAll("dutyEntries");
  const activeDraft = entries
    .filter((entry) => entry.isDraft === true && !isEntryEmpty(entry))
    .sort((a, b) => (b.lastModified || "").localeCompare(a.lastModified || ""))[0];
  await showList(container, setHeaderTitle);
  if (activeDraft && !resumePromptDismissedForSession) {
    openResumeDraftPrompt(container, setHeaderTitle, activeDraft);
  }
}

function openResumeDraftPrompt(container, setHeaderTitle, entry) {
  const overlay = el("div", { class: "overlay" });
  const movementLabel = entry.movementType === "arrival" ? "Arrival Movement" : "Departure Movement";
  const recordDetails = [
    movementLabel,
    entry.trainNumber ? `Train ${entry.trainNumber}` : null,
    entry.locomotiveNumberSnapshot ? `Loco ${entry.locomotiveNumberSnapshot}` : null,
  ].filter(Boolean).join(" · ");

  const resumeButton = el("button", {
    class: "primary-btn",
    type: "button",
    style: "width:100%;",
    onclick: () => {
      overlay.remove();
      showForm(container, setHeaderTitle, entry.id);
    },
  }, "Resume Pending Movement");
  const notNowButton = el("button", {
    class: "secondary-btn",
    type: "button",
    style: "width:100%;",
    onclick: () => {
      resumePromptDismissedForSession = true;
      overlay.remove();
    },
  }, "Not Now");

  overlay.appendChild(el("div", { class: "overlay-card" }, [
    el("h2", {}, "Unfinished Movement Found"),
    el("p", {}, "Your last unfinished form is safely saved on this device."),
    el("div", { style: "margin:12px 0;padding:10px;border:1px solid var(--border);border-radius:10px;background:var(--cream);font-weight:600;" }, recordDetails),
    el("div", { style: "display:grid;gap:10px;" }, [resumeButton, notNowButton]),
  ]));
  document.body.appendChild(overlay);
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
    onclick: async () => {
      overlay.remove();
      const entry = newDutyEntry();
      entry.movementType = "arrival";
      await DB.put("dutyEntries", entry);
      showForm(container, setHeaderTitle, entry.id);
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
  setHeaderTitle("Movement Diary");
  container.innerHTML = "";

  let allEntries = await DB.getAll("dutyEntries");
  allEntries.sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.lastModified || "").localeCompare(a.lastModified || ""));
  const locomotives = await DB.getAll("locomotives");
  let filteredEntries = allEntries;
  let currentPageIndex = 0;

  const toolbar = el("div", { class: "toolbar-row" }, [
    el("button", { class: "secondary-btn", onclick: () => openRangeReport(allEntries) }, "Export range report"),
  ]);
  container.appendChild(toolbar);

  const filterCard = el("div", { class: "card" });
  const fromInput = el("input", { type: "date" });
  const toInput = el("input", { type: "date" });
  const searchInput = el("input", { type: "text", placeholder: "Search train no. / name / loco" });
  filterCard.appendChild(el("div", { class: "form-row" }, [fieldLabel("From"), fromInput]));
  filterCard.appendChild(el("div", { class: "form-row" }, [fieldLabel("To"), toInput]));
  filterCard.appendChild(el("div", { class: "form-row" }, [fieldLabel("Search"), searchInput]));
  container.appendChild(filterCard);

  const listWrap = el("div", { class: "diary-wrap" });
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
    filteredEntries = filtered;
    currentPageIndex = 0;
    renderDiaryPage();
  }

  function detailValue(value) {
    if (value === null || value === undefined || value === "") return "—";
    return String(value);
  }

  function diaryDetail(label, value) {
    return el("div", { class: "diary-detail" }, [
      el("span", { class: "diary-detail-label" }, [
        el("span", { class: "field-label-icon", "aria-hidden": "true" }, fieldIconForLabel(label)),
        el("span", {}, label),
      ]),
      el("span", { class: "diary-detail-value" }, detailValue(value)),
    ]);
  }

  function diarySection(title, rows) {
    const usableRows = rows.filter(([, value]) => value !== null && value !== undefined && value !== "");
    return el("section", { class: "diary-section" }, [
      el("h3", {}, title),
      usableRows.length
        ? el("div", { class: "diary-detail-grid" }, usableRows.map(([label, value]) => diaryDetail(label, value)))
        : el("div", { class: "diary-empty" }, "No details recorded."),
    ]);
  }

  function minorScheduleSummary(entry) {
    const schedules = (entry.minorSchedules || []).filter((schedule) => schedule.type || schedule.date || schedule.km !== null && schedule.km !== undefined);
    if (!schedules.length) return "—";
    return schedules.map((schedule, index) => {
      const details = [schedule.type, schedule.date ? formatDate(schedule.date) : "", schedule.km !== null && schedule.km !== undefined ? `${schedule.km} KM` : ""].filter(Boolean);
      return `${index + 1}. ${details.join(" · ")}`;
    }).join(" | ");
  }

  function spareItemsSummary(entry) {
    const spareLabels = {
      bp: "BP", fp: "FP", sc: "SC", tsc: "TSC", fourWw: "4WW",
      fireExt: "2+2 Fire Ext.", ptFuse: "2 PT-Fuse",
    };
    const available = Object.entries(spareLabels)
      .filter(([key]) => entry.spareItems && entry.spareItems[key] === true)
      .map(([, label]) => label);
    if (entry.spareItems && entry.spareItems.other) available.push(entry.spareItems.otherText || "Other");
    return available.length ? available.join(", ") : "None marked available";
  }

  function renderDiaryPage() {
    listWrap.innerHTML = "";
    if (filteredEntries.length === 0) {
      listWrap.appendChild(el("div", { class: "empty-state" }, "No duty entries yet. Tap + to add one."));
      return;
    }
    currentPageIndex = Math.max(0, Math.min(currentPageIndex, filteredEntries.length - 1));
    const entry = filteredEntries[currentPageIndex];
    const movementLabel = entry.movementType === "arrival" ? "Arrival Movement" : "Departure Movement";
    const badges = [];
    if (entry.isDraft === true) badges.push(el("span", { class: "badge warn" }, "Draft"));
    if (entry.acStatus && entry.acStatus !== ACStatus.WORKING) badges.push(el("span", { class: "badge warn" }, "AC Alert"));
    if (entry.uicStatus === UICStatus.MODIFIED) badges.push(el("span", { class: "badge" }, "UIC Modified"));

    const page = el("article", { class: "diary-entry-page" });
    page.appendChild(el("div", { class: "diary-binding", "aria-hidden": "true" },
      Array.from({ length: 9 }, () => el("span", {}))
    ));
    page.appendChild(el("header", { class: "diary-page-header" }, [
      el("div", {}, [
        el("div", { class: "diary-kicker" }, movementLabel),
        el("h2", {}, `${entry.trainNumber || "Train —"}${entry.trainName ? ` · ${entry.trainName}` : ""}`),
        el("div", { class: "diary-date" }, `${formatDate(entry.date)} · Loco ${entry.locomotiveNumberSnapshot || "—"}`),
      ]),
      el("div", { class: "diary-page-number" }, `Page ${currentPageIndex + 1}`),
    ]));
    if (badges.length) page.appendChild(el("div", { class: "diary-badges" }, badges));

    page.appendChild(diarySection("Train & Locomotive", [
      ["Movement", movementLabel],
      ["Date", formatDate(entry.date)],
      ["Train Number", entry.trainNumber],
      ["Train Name", entry.trainName],
      ["Loco No.", entry.locomotiveNumberSnapshot],
      ["Type", entry.locomotiveType],
      ["Shed", entry.locomotiveShed],
      ["Cab", entry.cabSelection],
      ["PT Type", entry.locomotivePTType],
    ]));

    const additionalLocomotives = (entry.additionalLocomotives || []).map((loco, index) => [
      `${loco.role || "Additional Loco"} ${index + 1}`,
      [loco.locomotiveNumberSnapshot, loco.locomotiveType, loco.locomotiveShed, loco.cabSelection, loco.ptType].filter(Boolean).join(" · "),
    ]);
    page.appendChild(diarySection("Additional Locomotives", additionalLocomotives));

    page.appendChild(diarySection("Schedules", [
      ["Major Schedule", [entry.majorScheduleTypeCode, entry.majorScheduleDate ? formatDate(entry.majorScheduleDate) : ""].filter(Boolean).join(" · ")],
      ["Minor Schedules", minorScheduleSummary(entry)],
    ]));

    page.appendChild(diarySection("Loco Components", [
      ["SR Make", entry.srMake === "Other" ? entry.srMakeOther : entry.srMake],
      ["BUR Make", entry.burMake === "Other" ? entry.burMakeOther : entry.burMake],
      ["HOG Make", entry.hogMake === "Other" ? entry.hogMakeOther : entry.hogMake],
      ["HOG Status", entry.hogStatus],
      ["UIC", entry.uicStatus],
      ["Cable Connected", entry.uicCableConnected],
      ["RTIS", [entry.rtisFitted, entry.rtisStatus].filter(Boolean).join(" · ")],
      ["AC", [entry.acFitted, entry.acStatus].filter(Boolean).join(" · ")],
      ["KAVACH", [entry.kavachMake, entry.kavachStatus].filter(Boolean).join(" · ")],
      ["Brake System", entry.brakeSystem],
      ["SPM Make", entry.spmMake === "Other" ? entry.spmMakeOther : entry.spmMake],
      ["MC Status", entry.mcStatus],
      ["UBA DJ Open", entry.ubaDjOpen],
      ["UBA DJ Closed", entry.ubaDjClosed],
      ["Spare Items", spareItemsSummary(entry)],
    ]));

    const movementRows = TIMELINE_STEPS.map((step) => [step.label, entry[step.key] ? formatTime(entry[step.key]) : "—"]);
    movementRows.push(
      ["Takeover Place", entry.locoTakeoverPlace],
      ["Loco Offer Place", entry.locoOfferPlace === "Other" ? entry.locoOfferPlaceOther : entry.locoOfferPlace],
      ["Engine on Train Place", entry.engineOnTrainPlace],
      ["HOG Attached Place", entry.hogAttachedPlace],
      ["BP/FP Place", entry.bpFpPlace === "Other" ? entry.bpFpPlaceOther : entry.bpFpPlace],
      ["Yard Signal", entry.yardSignal],
      ["PF No.", entry.placementPfNumber],
      ["Made Over Charge", [entry.madeOverChargeName, entry.madeOverChargeHQ].filter(Boolean).join(" · ")],
    );
    page.appendChild(diarySection(entry.movementType === "arrival" ? "Arrival Details" : "Timeline of Working", movementRows));

    const privateRows = (entry.privateNumberDetails || [])
      .filter((detail) => detail.signalNumber || detail.fromLine || detail.toLine || detail.departureTime || detail.yardMasterName || detail.pmName)
      .map((detail, index) => [
        `Private Number ${index + 1}`,
        [
          detail.signalNumber ? `Signal ${detail.signalNumber}` : "",
          [detail.fromLine, detail.toLine].filter(Boolean).join(" → "),
          detail.departureTime ? formatTime(detail.departureTime) : "",
          detail.yardMasterName ? `YM ${detail.yardMasterName}` : "",
          detail.pmName ? `PM ${detail.pmName}` : "",
        ].filter(Boolean).join(" · "),
      ]);
    page.appendChild(diarySection("Private Number Details", privateRows));

    const officialRows = (entry.officialDetails || [])
      .filter((official) => official.designation || official.name)
      .map((official, index) => [`Official ${index + 1}`, [official.designation, official.name].filter(Boolean).join(" · ")]);
    page.appendChild(diarySection("Officials", officialRows));
    page.appendChild(diarySection("Repair List", [["Repair List", entry.repairList || "No repairs recorded"]]));
    page.appendChild(diarySection("Remarks", [["Remarks", entry.remarks || "No remarks"]]));

    const actionRow = el("div", { class: "diary-page-actions" }, [
      el("button", { class: "primary-btn diary-edit-btn", type: "button", onclick: () => showForm(container, setHeaderTitle, entry.id) }, "✎ Edit Movement"),
      actionButton("Share", "share", () => openExportCard(entry, locomotives)),
      actionButton("Delete", "delete", async () => {
        if (!confirm("Delete this movement from History?")) return;
        await DB.delete("dutyEntries", entry.id);
        allEntries = allEntries.filter((candidate) => candidate.id !== entry.id);
        filteredEntries = filteredEntries.filter((candidate) => candidate.id !== entry.id);
        currentPageIndex = Math.max(0, currentPageIndex - 1);
        renderDiaryPage();
      }, "danger"),
    ]);
    page.appendChild(actionRow);
    listWrap.appendChild(page);

    const previousButton = el("button", {
      class: "secondary-btn diary-nav-btn",
      type: "button",
      onclick: () => { currentPageIndex -= 1; renderDiaryPage(); container.scrollIntoView({ behavior: "smooth", block: "start" }); },
    }, "← Previous");
    previousButton.disabled = currentPageIndex === 0;
    const nextButton = el("button", {
      class: "secondary-btn diary-nav-btn",
      type: "button",
      onclick: () => { currentPageIndex += 1; renderDiaryPage(); container.scrollIntoView({ behavior: "smooth", block: "start" }); },
    }, "Next →");
    nextButton.disabled = currentPageIndex >= filteredEntries.length - 1;
    listWrap.appendChild(el("nav", { class: "diary-navigation", "aria-label": "Movement diary pages" }, [
      previousButton,
      el("span", { class: "diary-page-count" }, `${currentPageIndex + 1} of ${filteredEntries.length}`),
      nextButton,
    ]));
  }

  fromInput.onchange = applyFilterAndRender;
  toInput.onchange = applyFilterAndRender;
  searchInput.oninput = applyFilterAndRender;
  renderDiaryPage();

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
  if (!entry) {
    showList(container, setHeaderTitle);
    return;
  }
  const editingSubmittedRecord = entry.isDraft !== true;
  if (![1, 2, 3].includes(entry.draftPage)) entry.draftPage = 1;
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
  if (entry.locoTakeoverPlace === undefined) entry.locoTakeoverPlace = "";
  if (!LOCO_OFFER_PLACE_OPTIONS.includes(entry.locoOfferPlace)) entry.locoOfferPlace = LOCO_OFFER_PLACE_OPTIONS[0];
  if (entry.locoOfferPlaceOther === undefined) entry.locoOfferPlaceOther = "";
  if (entry.engineOnTrainPlace === undefined) entry.engineOnTrainPlace = "";
  if (entry.hogAttachedPlace === undefined) entry.hogAttachedPlace = "";
  if (!BP_FP_PLACE_OPTIONS.includes(entry.bpFpPlace)) entry.bpFpPlace = BP_FP_PLACE_OPTIONS[0];
  if (entry.bpFpPlaceOther === undefined) entry.bpFpPlaceOther = "";
  if (entry.yardSignal === undefined) entry.yardSignal = "";
  if (!Array.isArray(entry.privateNumberDetails)) {
    entry.privateNumberDetails = [];
    if (entry.privateNumber || entry.yardMasterName || entry.pmName) {
      entry.privateNumberDetails.push({
        id: crypto.randomUUID(),
        signalNumber: entry.privateNumber || "",
        fromLine: "",
        toLine: "",
        departureTime: null,
        yardMasterName: entry.yardMasterName || "",
        pmName: entry.pmName || "",
        isComplete: true,
      });
    }
  }
  for (const detail of entry.privateNumberDetails) {
    if (!detail.id) detail.id = crypto.randomUUID();
    if (detail.signalNumber === undefined) detail.signalNumber = "";
    if (detail.fromLine === undefined) detail.fromLine = "";
    if (detail.toLine === undefined) detail.toLine = "";
    if (detail.departureTime === undefined) detail.departureTime = null;
    if (detail.yardMasterName === undefined) detail.yardMasterName = "";
    if (detail.pmName === undefined) detail.pmName = "";
    if (detail.isComplete === undefined) detail.isComplete = true;
  }
  if (!Array.isArray(entry.officialDetails)) entry.officialDetails = [];
  for (const detail of entry.officialDetails) {
    if (!detail.id) detail.id = crypto.randomUUID();
    if (!OFFICIAL_DESIGNATION_OPTIONS.includes(detail.designation)) detail.designation = OFFICIAL_DESIGNATION_OPTIONS[0];
    if (detail.name === undefined) detail.name = "";
    if (detail.isComplete === undefined) detail.isComplete = true;
  }
  if (entry.placementPfNumber === undefined) entry.placementPfNumber = "";
  if (entry.madeOverChargeName === undefined) entry.madeOverChargeName = "";
  if (entry.madeOverChargeHQ === undefined) entry.madeOverChargeHQ = "";
  if (entry.repairList === undefined) entry.repairList = "";
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
    resumePromptDismissedForSession = true;
    showList(container, setHeaderTitle);
  }

  async function openSubmissionShare() {
    await autosave.flush();
    await openExportCard(entry, locomotives, {
      doneLabel: editingSubmittedRecord ? "Done" : "Done & Finish Movement",
      onDone: async () => {
        entry.isDraft = false;
        entry.draftPage = 1;
        entry.lastModified = new Date().toISOString();
        await DB.put("dutyEntries", entry);
        resumePromptDismissedForSession = true;
        showToast(editingSubmittedRecord ? "Record updated." : "Movement completed and saved in History.");
        await showList(container, setHeaderTitle);
      },
    });
  }

  function onFieldChange() {
    if (!editingSubmittedRecord) entry.isDraft = true;
    autosave.fieldChanged();
  }

  const header = el("div", { class: "sheet-header" }, [
    el("button", { class: "icon-btn", onclick: goBack }, "← Back"),
    el("div", { class: "sheet-actions" }, [
      actionButton("Share", "share", () => openExportCard(entry, locomotives)),
      actionButton("Delete", "delete", async () => {
        if (confirm("Delete this duty entry?")) {
          await DB.delete("dutyEntries", entry.id);
          showList(container, setHeaderTitle);
        }
      }, "danger"),
    ]),
  ]);
  container.appendChild(header);

  const stepHeading = el("div", { style: "font-weight:700;font-size:16px;" }, "Train & Loco Details");
  const stepCount = el("div", { style: "color:var(--text-muted);font-size:13px;" }, "Step 1 of 3");
  const progressFill = el("div", { style: "height:100%;width:33.33%;background:var(--maroon);border-radius:999px;transition:width .2s ease;" });
  const progressCard = el("div", { class: "card", style: "padding:14px;margin-bottom:12px;" }, [
    el("div", { style: "display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:10px;" }, [stepHeading, stepCount]),
    el("div", { style: "height:5px;background:var(--border);border-radius:999px;overflow:hidden;" }, [progressFill]),
  ]);
  const trainLocoPage = el("div", {});
  const remainingDetailsPage = el("div", { style: "display:none;" });
  const reviewSubmitPage = el("div", { style: "display:none;" });

  function showWizardPage(pageNumber, persistPage = true) {
    const showFirstPage = pageNumber === 1;
    const showSecondPage = pageNumber === 2;
    const showThirdPage = pageNumber === 3;
    trainLocoPage.style.display = showFirstPage ? "block" : "none";
    remainingDetailsPage.style.display = showSecondPage ? "block" : "none";
    reviewSubmitPage.style.display = showThirdPage ? "block" : "none";
    stepHeading.textContent = showFirstPage
      ? "Train & Loco Details"
      : showSecondPage
        ? (entry.movementType === "arrival" ? "Arrival Details" : "Movement Details")
        : "Review & Submit";
    stepCount.textContent = showFirstPage ? "Step 1 of 3" : showSecondPage ? "Step 2 of 3" : "Step 3 of 3";
    progressFill.style.width = showFirstPage ? "33.33%" : showSecondPage ? "66.66%" : "100%";
    if (showThirdPage) renderReviewPage();
    if (persistPage && entry.isDraft === true && entry.draftPage !== pageNumber) {
      entry.draftPage = pageNumber;
      autosave.fieldChanged();
    }
    container.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  container.appendChild(progressCard);
  container.appendChild(trainLocoPage);
  container.appendChild(remainingDetailsPage);
  container.appendChild(reviewSubmitPage);

  // --- Trip Info ---
  const tripSection = el("div", { class: "form-section" });
  tripSection.appendChild(el("div", { class: "form-section-title" }, "Trip Info"));
  tripSection.appendChild(el("div", { class: "form-row" }, [
    fieldLabel("Date"),
    el("input", { type: "date", value: entry.date || todayDateInputValue(), onchange: (e) => { entry.date = e.target.value; onFieldChange(); } }),
  ]));
  tripSection.appendChild(el("div", { class: "form-row" }, [
    fieldLabel("Train Number"),
    el("input", { type: "text", value: entry.trainNumber || "", oninput: (e) => { entry.trainNumber = e.target.value; onFieldChange(); } }),
  ]));
  tripSection.appendChild(el("div", { class: "form-row" }, [
    fieldLabel("Train Name"),
    el("input", { type: "text", value: entry.trainName || "", oninput: (e) => { entry.trainName = e.target.value; onFieldChange(); } }),
  ]));
  const locomotiveRow = el("div", { class: "form-row locomotive-row" });
  locomotiveRow.appendChild(fieldLabel("Locomotive", { class: "locomotive-heading" }));

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
    el("div", { class: "locomotive-field" }, [fieldCaption("Loco No."), numberInput]),
    el("div", { class: "locomotive-field" }, [fieldCaption("Type"), typeSelect]),
    el("div", { class: "locomotive-field" }, [fieldCaption("Shed"), shedInput]),
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
      el("div", { class: "cab-pt-field" }, [fieldLabel("Cab"), cabSelect]),
      el("div", { class: "cab-pt-field" }, [fieldLabel("PT Type"), ptTypeSelect]),
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
          el("div", { class: "locomotive-field" }, [fieldCaption("Loco No."), additionalNumberInput]),
          el("div", { class: "locomotive-field" }, [fieldCaption("Type"), additionalTypeSelect]),
          el("div", { class: "locomotive-field" }, [fieldCaption("Shed"), additionalShedInput]),
        ]),
        additionalRecallNote,
        el("div", { class: "cab-pt-grid additional-cab-pt-grid" }, [
          el("div", { class: "cab-pt-field" }, [fieldLabel("Cab"), additionalCabSelect]),
          el("div", { class: "cab-pt-field" }, [fieldLabel("PT Type"), additionalPTTypeSelect]),
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
    el("div", { class: "schedule-field" }, [fieldLabel("Type"), majorTypeSelect]),
    el("div", { class: "schedule-field" }, [fieldLabel("Date"), majorDateInput]),
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
            fieldLabel("Type"),
            createDropdown(MINOR_SCHEDULE_TYPE_OPTIONS, schedule.type, (value) => {
              schedule.type = value;
              onFieldChange();
            }, { "aria-label": `Minor schedule ${scheduleNumber} type` }),
          ]),
          el("div", { class: "schedule-field" }, [
            fieldLabel("Date"),
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
          el("div", { class: "schedule-field" }, [fieldLabel("KM"), kmInput, kmAlert]),
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
      fieldLabel(label),
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
      fieldLabel("UIC"),
      componentUICSelect,
    ]),
    el("div", { class: "schedule-field component-field" }, [
      fieldLabel("Cable Connected"),
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
      fieldLabel("HOG Status"),
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
      fieldLabel(label),
      createDropdown(options, entry[fieldKey], (value) => {
        entry[fieldKey] = value;
        onFieldChange();
      }, { "aria-label": label }),
    ]);
  }

  function createManualComponentField(label, fieldKey) {
    return el("div", { class: "schedule-field component-field" }, [
      fieldLabel(label),
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
      fieldLabel("Spare Items Available"),
      spareChecklist,
      spareOtherInput,
    ]),
  ]));
  trainLocoPage.appendChild(componentSection);

  // --- Repair List ---
  const repairListSection = el("div", { class: "form-section" });
  repairListSection.appendChild(el("div", { class: "form-section-title" }, "Repair List"));
  repairListSection.appendChild(el("div", { class: "form-row" }, [
    el("textarea", {
      value: entry.repairList || "",
      placeholder: "Enter repair details",
      "aria-label": "Repair List",
      oninput: (event) => {
        entry.repairList = event.target.value;
        onFieldChange();
      },
    }, entry.repairList || ""),
  ]));
  trainLocoPage.appendChild(repairListSection);

  const isArrivalMovement = entry.movementType === "arrival";
  trainLocoPage.appendChild(el("button", {
    class: "primary-btn",
    type: "button",
    onclick: () => showWizardPage(2),
  }, isArrivalMovement ? "Next: Arrival Details →" : "Next: Movement Details →"));

  // --- Timeline of Working ---
  const timelineSection = el("div", { class: "form-section" });
  timelineSection.appendChild(el("div", { class: "form-section-title" }, "Timeline of Working"));

  function recentHistoryValues(fieldKey) {
    const seen = new Set();
    return allDutyEntries
      .filter((candidate) => candidate.id !== entry.id)
      .sort((a, b) => (b.lastModified || "").localeCompare(a.lastModified || ""))
      .map((candidate) => String(candidate[fieldKey] || "").trim())
      .filter((value) => {
        const normalized = value.toUpperCase();
        if (!value || seen.has(normalized)) return false;
        seen.add(normalized);
        return true;
      })
      .slice(0, 12);
  }

  function createMovementTimeField(label, fieldKey) {
    return el("div", { class: "movement-detail-field" }, [
      fieldLabel(label),
      createTimeField(entry.date, entry[fieldKey], (value) => {
        entry[fieldKey] = value;
        onFieldChange();
      }),
    ]);
  }

  function createMovementManualField(label, fieldKey, placeholder = "Enter details") {
    return el("div", { class: "movement-detail-field" }, [
      fieldLabel(label),
      el("input", {
        type: "text",
        value: entry[fieldKey] || "",
        placeholder,
        "aria-label": label,
        oninput: (event) => {
          entry[fieldKey] = event.target.value;
          onFieldChange();
        },
      }),
    ]);
  }

  function createMovementHistoryField(label, fieldKey, placeholder = "Enter or select recent") {
    const datalistId = `history-${fieldKey}-${entry.id}`;
    const datalist = el("datalist", { id: datalistId }, recentHistoryValues(fieldKey).map((value) =>
      el("option", { value })
    ));
    return el("div", { class: "movement-detail-field" }, [
      fieldLabel(label),
      el("input", {
        type: "text",
        value: entry[fieldKey] || "",
        placeholder,
        list: datalistId,
        autocomplete: "off",
        "aria-label": label,
        oninput: (event) => {
          entry[fieldKey] = event.target.value;
          onFieldChange();
        },
      }),
      datalist,
    ]);
  }

  function createMovementDropdownField(label, fieldKey, options, otherFieldKey) {
    const otherInput = el("input", {
      class: "movement-other-input",
      type: "text",
      value: entry[otherFieldKey] || "",
      placeholder: `Enter ${label}`,
      "aria-label": `${label} other`,
      oninput: (event) => {
        entry[otherFieldKey] = event.target.value;
        onFieldChange();
      },
    });
    function renderOtherInput() {
      otherInput.classList.toggle("hidden", entry[fieldKey] !== "Other");
    }
    const select = createDropdown(options, entry[fieldKey], (value) => {
      entry[fieldKey] = value;
      renderOtherInput();
      onFieldChange();
    }, { "aria-label": label });
    renderOtherInput();
    return el("div", { class: "movement-detail-field" }, [
      fieldLabel(label),
      select,
      otherInput,
    ]);
  }

  timelineSection.appendChild(el("div", { class: "movement-detail-row three-fields" }, [
    createMovementTimeField("Loco Takeover", "locoTakeoverTime"),
    createMovementHistoryField("Place", "locoTakeoverPlace"),
    createMovementTimeField("Checked Upto", "locoCheckedUptoTime"),
  ]));
  timelineSection.appendChild(el("div", { class: "movement-detail-row three-fields" }, [
    createMovementTimeField("Loco Offer", "locoOfferTime"),
    createMovementDropdownField("Place", "locoOfferPlace", LOCO_OFFER_PLACE_OPTIONS, "locoOfferPlaceOther"),
    createMovementTimeField("Dep Time", "locoOfferDepartureTime"),
  ]));
  timelineSection.appendChild(el("div", { class: "movement-detail-row two-fields" }, [
    createMovementTimeField("Engine On Train", "engineOnTrainTime"),
    createMovementHistoryField("EOT Place", "engineOnTrainPlace"),
  ]));
  timelineSection.appendChild(el("div", { class: "movement-detail-row three-fields" }, [
    createMovementTimeField("HOG Attached From", "hogAttachedTime"),
    createMovementTimeField("HOG Attached To", "hogAttachedToTime"),
    createMovementHistoryField("Place", "hogAttachedPlace"),
  ]));
  timelineSection.appendChild(el("div", { class: "movement-detail-row two-fields" }, [
    createMovementTimeField("BP/FP Buildup Time", "bpFpTime"),
    createMovementDropdownField("Place", "bpFpPlace", BP_FP_PLACE_OPTIONS, "bpFpPlaceOther"),
  ]));

  timelineSection.appendChild(el("div", { class: "movement-detail-row two-fields" }, [
    createMovementTimeField("Yard Dep", "departureTime"),
    createMovementHistoryField("Signal", "yardSignal"),
  ]));

  timelineSection.appendChild(el("div", { class: "movement-detail-row two-fields" }, [
    createMovementTimeField("Placement Time", "placementTime"),
    createMovementHistoryField("PF No.", "placementPfNumber"),
  ]));
  timelineSection.appendChild(el("div", { class: "movement-detail-row two-fields" }, [
    createMovementTimeField("Cont. Time", "continuityTime"),
    createMovementTimeField("BPC Time", "bpcTime"),
  ]));
  timelineSection.appendChild(el("div", { class: "movement-detail-row three-fields" }, [
    createMovementManualField("Made Over Charge Name", "madeOverChargeName", "Name"),
    createMovementManualField("HQ", "madeOverChargeHQ", "HQ"),
    createMovementTimeField("Made Over Charge Time", "madeOverChargeTime"),
  ]));
  if (isArrivalMovement) {
    remainingDetailsPage.appendChild(el("div", { class: "form-section arrival-details-placeholder" }, [
      el("div", { class: "form-section-title" }, "Arrival Details"),
      el("div", { class: "review-empty" }, "Arrival movement fields will be added here next. You can still review and finish this movement using the common Step 3."),
    ]));
  } else {
    remainingDetailsPage.appendChild(timelineSection);
  }

  const privateNumberCount = el("span", { class: "private-number-fab-count hidden" }, "0");
  const privateNumberFab = el("button", {
    class: "private-number-fab",
    type: "button",
    "aria-label": "Add Private Number Details",
  }, [
    el("span", { class: "private-number-fab-plus" }, "+"),
    el("span", { class: "private-number-fab-label" }, "PN"),
    privateNumberCount,
  ]);

  function renderPrivateNumberFab() {
    const count = entry.privateNumberDetails.length;
    privateNumberCount.textContent = String(count);
    privateNumberCount.classList.toggle("hidden", count === 0);
  }

  function openPrivateNumberPrompt() {
    let detail = entry.privateNumberDetails.find((candidate) => candidate.isComplete !== true);
    if (!detail) {
      detail = {
        id: crypto.randomUUID(),
        signalNumber: "",
        fromLine: "",
        toLine: "",
        departureTime: null,
        yardMasterName: "",
        pmName: "",
        isComplete: false,
      };
      entry.privateNumberDetails.push(detail);
      renderPrivateNumberFab();
      onFieldChange();
    }

    const overlay = el("div", { class: "overlay" });
    const closeButton = el("button", {
      class: "icon-btn",
      type: "button",
      "aria-label": "Close Private Number Details",
      onclick: () => overlay.remove(),
    }, "×");

    function createPrivateNumberInput(label, fieldKey, placeholder) {
      return el("div", { class: "movement-detail-field" }, [
        fieldLabel(label),
        el("input", {
          type: "text",
          value: detail[fieldKey] || "",
          placeholder,
          "aria-label": label,
          oninput: (event) => {
            detail[fieldKey] = event.target.value;
            onFieldChange();
          },
        }),
      ]);
    }

    const detailNumber = entry.privateNumberDetails.indexOf(detail) + 1;
    const formGrid = el("div", { class: "private-number-form-grid" }, [
      createPrivateNumberInput("Signal Number", "signalNumber", "Signal number"),
      createPrivateNumberInput("From Line", "fromLine", "From line"),
      createPrivateNumberInput("To Line", "toLine", "To line"),
      el("div", { class: "movement-detail-field" }, [
        fieldLabel("Dep Time"),
        createTimeField(entry.date, detail.departureTime, (value) => {
          detail.departureTime = value;
          onFieldChange();
        }),
      ]),
      createPrivateNumberInput("Yard Master Name", "yardMasterName", "Name"),
      createPrivateNumberInput("PM Name", "pmName", "Name"),
    ]);
    const saveButton = el("button", {
      class: "primary-btn",
      type: "button",
      onclick: () => {
        const hasDetails = detail.signalNumber || detail.fromLine || detail.toLine || detail.departureTime || detail.yardMasterName || detail.pmName;
        if (!hasDetails) {
          showToast("Enter Private Number Details first.");
          return;
        }
        detail.isComplete = true;
        onFieldChange();
        renderPrivateNumberFab();
        overlay.remove();
        showToast("Private Number Details saved for Step 3.");
      },
    }, "Save Private Number Details");

    overlay.appendChild(el("div", { class: "overlay-card private-number-dialog" }, [
      el("div", { class: "private-number-dialog-header" }, [
        el("div", {}, [
          el("h2", {}, "Private Number Details"),
          el("p", {}, `Entry ${detailNumber} · will appear on Step 3`),
        ]),
        closeButton,
      ]),
      formGrid,
      saveButton,
    ]));
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) overlay.remove();
    });
    document.body.appendChild(overlay);
  }

  privateNumberFab.addEventListener("click", openPrivateNumberPrompt);
  renderPrivateNumberFab();
  if (!isArrivalMovement) remainingDetailsPage.appendChild(privateNumberFab);

  const officialsCount = el("span", { class: "private-number-fab-count hidden" }, "0");
  const officialsFab = el("button", {
    class: "officials-fab",
    type: "button",
    "aria-label": "Add Officials",
  }, [
    el("span", { class: "private-number-fab-plus" }, "+"),
    el("span", { class: "private-number-fab-label" }, "OFF"),
    officialsCount,
  ]);

  function renderOfficialsFab() {
    const count = entry.officialDetails.length;
    officialsCount.textContent = String(count);
    officialsCount.classList.toggle("hidden", count === 0);
  }

  function recentOfficialNames(excludeId) {
    const seen = new Set();
    const records = [
      entry,
      ...allDutyEntries
        .filter((candidate) => candidate.id !== entry.id)
        .sort((a, b) => (b.lastModified || "").localeCompare(a.lastModified || "")),
    ];
    return records
      .flatMap((candidate) => Array.isArray(candidate.officialDetails) ? candidate.officialDetails : [])
      .filter((candidate) => candidate.id !== excludeId)
      .map((candidate) => String(candidate.name || "").trim())
      .filter((value) => {
        const normalized = value.toUpperCase();
        if (!value || seen.has(normalized)) return false;
        seen.add(normalized);
        return true;
      })
      .slice(0, 12);
  }

  function openOfficialsPrompt() {
    let official = entry.officialDetails.find((candidate) => candidate.isComplete !== true);
    if (!official) {
      official = {
        id: crypto.randomUUID(),
        designation: OFFICIAL_DESIGNATION_OPTIONS[0],
        name: "",
        isComplete: false,
      };
      entry.officialDetails.push(official);
      renderOfficialsFab();
      onFieldChange();
    }

    const overlay = el("div", { class: "overlay" });
    const closeButton = el("button", {
      class: "icon-btn",
      type: "button",
      "aria-label": "Close Add Officials",
      onclick: () => overlay.remove(),
    }, "×");
    const officialNumber = entry.officialDetails.indexOf(official) + 1;
    const designationField = el("div", { class: "movement-detail-field" }, [
      fieldLabel("Designation"),
      createDropdown(OFFICIAL_DESIGNATION_OPTIONS, official.designation, (value) => {
        official.designation = value;
        onFieldChange();
      }, { "aria-label": "Designation" }),
    ]);
    const officialNameHistoryId = `official-name-history-${entry.id}-${official.id}`;
    const officialNameField = el("div", { class: "movement-detail-field" }, [
      fieldLabel("Name"),
      el("input", {
        type: "text",
        value: official.name || "",
        placeholder: "Enter or select recent name",
        list: officialNameHistoryId,
        autocomplete: "off",
        "aria-label": "Official Name",
        oninput: (event) => {
          official.name = event.target.value;
          onFieldChange();
        },
      }),
      el("datalist", { id: officialNameHistoryId }, recentOfficialNames(official.id).map((name) =>
        el("option", { value: name })
      )),
    ]);
    const saveButton = el("button", {
      class: "primary-btn",
      type: "button",
      onclick: () => {
        official.name = String(official.name || "").trim();
        if (!official.designation || !official.name) {
          showToast("Select designation and enter official name.");
          return;
        }
        official.isComplete = true;
        onFieldChange();
        renderOfficialsFab();
        overlay.remove();
        showToast("Official saved for Step 3.");
      },
    }, "Save Official");

    overlay.appendChild(el("div", { class: "overlay-card private-number-dialog officials-dialog" }, [
      el("div", { class: "private-number-dialog-header" }, [
        el("div", {}, [
          el("h2", {}, "Add Officials"),
          el("p", {}, `Official ${officialNumber} · will appear on Step 3`),
        ]),
        closeButton,
      ]),
      el("div", { class: "private-number-form-grid officials-form-grid" }, [designationField, officialNameField]),
      saveButton,
    ]));
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) overlay.remove();
    });
    document.body.appendChild(overlay);
  }

  officialsFab.addEventListener("click", openOfficialsPrompt);
  renderOfficialsFab();
  container.appendChild(officialsFab);

  function reviewField(label, value) {
    return el("div", { class: "review-field" }, [
      el("div", { class: "review-field-label" }, [
        el("span", { class: "field-label-icon", "aria-hidden": "true" }, fieldIconForLabel(label)),
        el("span", {}, label),
      ]),
      el("div", { class: "review-field-value" }, value || "—"),
    ]);
  }

  function renderReviewPage() {
    reviewSubmitPage.innerHTML = "";

    const overviewSection = el("div", { class: "form-section review-section" }, [
      el("div", { class: "form-section-title" }, "Record Summary"),
      el("div", { class: "review-grid" }, [
        reviewField("Movement", isArrivalMovement ? "Arrival" : "Departure"),
        reviewField("Date", formatDate(entry.date)),
        reviewField("Train", `${entry.trainNumber || "—"}${entry.trainName ? ` · ${entry.trainName}` : ""}`),
        reviewField("Locomotive", entry.locomotiveNumberSnapshot || "—"),
        reviewField("Type / Shed", [entry.locomotiveType, entry.locomotiveShed].filter(Boolean).join(" · ") || "—"),
      ]),
    ]);
    reviewSubmitPage.appendChild(overviewSection);

    const timelineSection = el("div", { class: "form-section review-section" }, [
      el("div", { class: "form-section-title" }, isArrivalMovement ? "Arrival Summary" : "Movement Summary"),
    ]);
    const filledTimeline = TIMELINE_STEPS.filter((step) => entry[step.key]);
    if (filledTimeline.length) {
      timelineSection.appendChild(el("div", { class: "review-grid" }, filledTimeline.map((step) =>
        reviewField(step.label, formatTime(entry[step.key]))
      )));
    } else {
      timelineSection.appendChild(el("div", { class: "review-empty" }, isArrivalMovement
        ? "Arrival details have not been added yet."
        : "No movement times entered."));
    }
    reviewSubmitPage.appendChild(timelineSection);

    const privateDetails = entry.privateNumberDetails.filter((detail) =>
      detail.signalNumber || detail.fromLine || detail.toLine || detail.departureTime || detail.yardMasterName || detail.pmName
    );
    const privateSection = el("div", { class: "form-section review-section" }, [
      el("div", { class: "form-section-title" }, `Private Number Details (${privateDetails.length})`),
    ]);
    if (!privateDetails.length) {
      privateSection.appendChild(el("div", { class: "review-empty" }, "No Private Number Details added."));
    } else {
      privateDetails.forEach((detail, index) => {
        privateSection.appendChild(el("div", { class: "review-entry-card" }, [
          el("div", { class: "review-entry-title" }, [
            el("span", {}, `Private Number ${index + 1}`),
            detail.isComplete === true ? null : el("span", { class: "badge warn" }, "Draft"),
          ]),
          el("div", { class: "review-grid" }, [
            reviewField("Signal Number", detail.signalNumber),
            reviewField("From Line", detail.fromLine),
            reviewField("To Line", detail.toLine),
            reviewField("Dep Time", detail.departureTime ? formatTime(detail.departureTime) : "—"),
            reviewField("Yard Master Name", detail.yardMasterName),
            reviewField("PM Name", detail.pmName),
          ]),
        ]));
      });
    }
    reviewSubmitPage.appendChild(privateSection);

    const officials = entry.officialDetails.filter((detail) => detail.designation || detail.name);
    const officialsSection = el("div", { class: "form-section review-section" }, [
      el("div", { class: "form-section-title" }, `Officials (${officials.length})`),
    ]);
    if (!officials.length) {
      officialsSection.appendChild(el("div", { class: "review-empty" }, "No officials added."));
    } else {
      officials.forEach((official, index) => {
        officialsSection.appendChild(el("div", { class: "review-entry-card" }, [
          el("div", { class: "review-entry-title" }, [
            el("span", {}, `Official ${index + 1}`),
            official.isComplete === true ? null : el("span", { class: "badge warn" }, "Draft"),
          ]),
          el("div", { class: "review-grid" }, [
            reviewField("Designation", official.designation),
            reviewField("Name", official.name),
          ]),
        ]));
      });
    }
    reviewSubmitPage.appendChild(officialsSection);

    const repairListSection = el("div", { class: "form-section review-section" }, [
      el("div", { class: "form-section-title" }, "Repair List"),
      entry.repairList
        ? el("div", { class: "review-entry-card" }, entry.repairList)
        : el("div", { class: "review-empty" }, "No repairs recorded."),
    ]);
    reviewSubmitPage.appendChild(repairListSection);

    const remarksSection = el("div", { class: "form-section" });
    remarksSection.appendChild(el("div", { class: "form-section-title" }, "Remarks"));
    remarksSection.appendChild(el("div", { class: "form-row" }, [
      el("textarea", {
        value: entry.remarks || "",
        placeholder: "Add final remarks",
        oninput: (event) => {
          entry.remarks = event.target.value;
          onFieldChange();
        },
      }, entry.remarks || ""),
    ]));
    reviewSubmitPage.appendChild(remarksSection);
    reviewSubmitPage.appendChild(el("button", {
      class: "primary-btn",
      type: "button",
      style: "width:100%;margin-bottom:10px;",
      onclick: openSubmissionShare,
    }, "Submit & Open Share Screen"));
    reviewSubmitPage.appendChild(el("button", {
      class: "secondary-btn",
      type: "button",
      style: "width:100%;margin-bottom:12px;",
      onclick: () => showWizardPage(2),
    }, isArrivalMovement ? "← Arrival Details" : "← Movement Details"));
  }

  remainingDetailsPage.appendChild(el("button", {
    class: "primary-btn",
    type: "button",
    style: "width:100%;margin-bottom:10px;",
    onclick: () => showWizardPage(3),
  }, "Next: Review & Submit →"));
  remainingDetailsPage.appendChild(el("button", {
    class: "secondary-btn",
    type: "button",
    style: "width:100%;margin-bottom:12px;",
    onclick: () => showWizardPage(1),
  }, "← Train & Loco Details"));
  showWizardPage(entry.draftPage, false);
}
