import { DB } from "./db.js";
import { el, formatDate } from "./util.js";
import { showToast } from "./toast.js";
import { pullAdjustmentRecordsFromSheet, syncPendingAdjustmentRecords } from "./sheets.js";
import { adjustmentKey, uniqueAdjustments, normalizedText, recentAdjustmentRange } from "./adjustmentUtils.js";

const ADJUSTMENT_TYPES = ["Shift", "Link", "Rest", "Other"];

function nextDayInputValue() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function newAdjustmentRow() {
  return {
    id: crypto.randomUUID(),
    staffName: "",
    date: nextDayInputValue(),
    adjustmentType: ADJUSTMENT_TYPES[0],
    adjustmentTypeOther: "",
    originalPosition: "",
    adjustedPosition: "",
    remark: "Staff Request",
  };
}

function uniqueRecent(records, key) {
  const seen = new Set();
  return [...records]
    .sort((a, b) => (b.lastModified || b.createdAt || "").localeCompare(a.lastModified || a.createdAt || ""))
    .map((record) => String(record[key] || "").trim())
    .filter((value) => {
      const normalized = value.toLowerCase();
      if (!value || seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    })
    .slice(0, 20);
}

function addDatalist(container, id, values) {
  const list = el("datalist", { id });
  for (const value of values) list.appendChild(el("option", { value }));
  container.appendChild(list);
}

function displayAdjustmentType(record) {
  if (record.adjustmentType === "Other") return record.adjustmentTypeOther || "Other";
  return record.adjustmentType || "—";
}

export async function mountDutyAdjustmentTab(container, setHeaderTitle) {
  setHeaderTitle("Duty Adjustment Record");
  container.innerHTML = "";

  const [staffMembers, allRecords] = await Promise.all([
    DB.getAll("staffMembers"),
    DB.getAll("adjustmentRecords"),
  ]);
  staffMembers.sort((a, b) => a.name.localeCompare(b.name));

  const page = el("div", { class: "adjustment-page" });
  const filters = el("div", { class: "form-section adjustment-filters" });
  filters.appendChild(el("div", { class: "form-section-title" }, "Search Saved Records"));

  const staffListId = "adjustment-staff-search";
  const staffFilter = el("input", {type:"search",list:staffListId,placeholder:"Search or select staff name","aria-label":"Filter by staff name"});
  const filterNames = [...new Set([
    ...staffMembers.map((member) => member.name),
    ...allRecords.map((record) => record.staffName).filter(Boolean),
  ])].sort((a, b) => a.localeCompare(b));
  addDatalist(filters, staffListId, filterNames);

  const dateFilter = el("input", {
    type: "date",
    value: "",
    "aria-label": "Filter by adjustment date",
  });

  filters.appendChild(el("div", { class: "adjustment-filter-grid adjustment-record-filter-grid" }, [
    el("div", { class: "adjustment-field" }, [el("label", {}, "Staff Name"), staffFilter]),
    el("div", { class: "adjustment-field" }, [el("label", {}, "Date"), dateFilter]),
  ]));
  filters.appendChild(el("button", {
    class: "secondary-btn adjustment-sheet-refresh-btn",
    type: "button",
    onclick: async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      button.textContent = "Checking Sheet…";
      try {
        const result = await pullAdjustmentRecordsFromSheet({ interactive: true });
        if (result.status === "not-linked") throw new Error("Link a Google Sheet in Settings first.");
        showToast(result.imported > 0
          ? `${result.imported} record${result.imported === 1 ? "" : "s"} restored from Google Sheet.`
          : result.total > 0 ? "Local records are up to date." : "No adjustment records found in Google Sheet.");
        await mountDutyAdjustmentTab(container, setHeaderTitle);
      } catch (error) {
        showToast(error.message || "Could not refresh from Google Sheet.");
        button.disabled = false;
        button.textContent = "Refresh from Google Sheet";
      }
    },
  }, "Refresh from Google Sheet"));
  page.appendChild(filters);

  const resultSummary = el("div", { class: "adjustment-result-summary" });
  let viewAll = false;
  const rangeButton = el("button",{class:"secondary-btn",type:"button",onclick:()=>{
    viewAll=!viewAll;renderRecords();
  }},"View All Entries");
  page.appendChild(rangeButton);
  const recordsHolder = el("div", { class: "adjustment-records" });
  page.appendChild(resultSummary);
  page.appendChild(recordsHolder);

  function renderRecords() {
    const selectedName = staffFilter.value.trim();
    const selectedDate = dateFilter.value;
    const range=recentAdjustmentRange();
    let records = uniqueAdjustments(allRecords)
      .filter((record) => (!selectedName || normalizedText(record.staffName) === normalizedText(selectedName)) && (!selectedDate || record.date === selectedDate))
      .filter(record=>!selectedName || viewAll || selectedDate || record.date>=range.from && record.date<=range.to)
      .sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.createdAt || "").localeCompare(a.createdAt || ""));

    const hasFilter = Boolean(selectedName || selectedDate);
    rangeButton.classList.toggle("hidden", !selectedName);
    rangeButton.textContent=viewAll ? "Show Last 3 Months" : "View All Entries";
    if (!hasFilter) records = records.slice(0, 10);
    if (selectedName && selectedDate) {
      resultSummary.textContent = `${records.length} record${records.length === 1 ? "" : "s"} for ${selectedName} on ${formatDate(selectedDate)}`;
    } else if (selectedName) {
      resultSummary.textContent = `${records.length} records for ${selectedName} · ${viewAll ? "All entries" : "Last 3 months"}`;
    } else if (selectedDate) {
      resultSummary.textContent = `${records.length} record${records.length === 1 ? "" : "s"} on ${formatDate(selectedDate)}`;
    } else {
      resultSummary.textContent = `Latest ${records.length} record${records.length === 1 ? "" : "s"}`;
    }
    recordsHolder.innerHTML = "";
    if (!records.length) {
      recordsHolder.appendChild(el("div", { class: "empty-state adjustment-empty" }, allRecords.length
        ? "No records found for this staff member."
        : "No duty adjustment records yet. Tap + to add one."));
      return;
    }
    if (selectedName) {
      const cellStyle="padding:8px 5px;border:1px solid #ddd;vertical-align:top;overflow-wrap:anywhere;";
      const table=el("table",{style:"width:100%;border-collapse:collapse;table-layout:fixed;font-size:12px;","aria-label":"Staff adjustment history"});
      table.appendChild(el("thead",{},el("tr",{},["Date","Type","Original","Adjusted","Remark"].map(label=>el("th",{style:cellStyle+"background:#f2ece6;text-align:left;"},label)))));
      const body=el("tbody");
      for(const record of records) body.appendChild(el("tr",{},[formatDate(record.date),displayAdjustmentType(record),record.originalPosition || "",record.adjustedPosition || "",record.remark || ""].map(value=>el("td",{style:cellStyle},value))));
      table.appendChild(body); recordsHolder.appendChild(table); return;
    }
    for (const record of records) {
      recordsHolder.appendChild(el("article", { class: "adjustment-record-row" }, [
        el("div", { class: "adjustment-record-date" }, formatDate(record.date) || "—"),
        el("div", { class: "adjustment-record-main" }, [
          el("div", { class: "adjustment-record-name" }, record.staffName || "Staff not selected"),
          el("div", { class: "adjustment-record-route" }, [
            el("span", {}, record.originalPosition || "—"),
            el("span", { class: "adjustment-position-arrow", "aria-hidden": "true" }, "→"),
            el("span", {}, record.adjustedPosition || "—"),
          ]),
          record.remark ? el("div", { class: "adjustment-record-remark" }, record.remark) : null,
        ]),
        el("span", { class: "badge adjustment-type-badge" }, displayAdjustmentType(record)),
      ]));
    }
  }

  staffFilter.addEventListener("input", () => {viewAll=false;renderRecords();});
  staffFilter.addEventListener("change", () => {viewAll=false;renderRecords();});
  dateFilter.addEventListener("change", renderRecords);
  renderRecords();
  container.appendChild(page);

  const fab = el("button", {
    class: "fab adjustment-fab",
    type: "button",
    "aria-label": "Add duty adjustment record",
    onclick: () => openAdjustmentForm(container, setHeaderTitle, staffMembers, allRecords),
  }, "+");
  container.appendChild(fab);
}

async function openAdjustmentForm(container, setHeaderTitle, staffMembers, recentRecords) {
  setHeaderTitle("Add Duty Adjustment");
  container.innerHTML = "";
  const rows = [newAdjustmentRow()];
  const formPage = el("div", { class: "adjustment-form-page" });
  formPage.appendChild(el("div", { class: "sheet-header adjustment-sheet-header" }, [
    el("button", {
      class: "icon-btn adjustment-back-btn",
      type: "button",
      onclick: () => mountDutyAdjustmentTab(container, setHeaderTitle),
    }, "← Back"),
    el("div", { class: "adjustment-form-hint" }, "Date defaults to tomorrow"),
  ]));

  const originalListId = `adjustment-original-${crypto.randomUUID()}`;
  const adjustedListId = `adjustment-adjusted-${crypto.randomUUID()}`;
  const remarkListId = `adjustment-remark-${crypto.randomUUID()}`;
  addDatalist(formPage, originalListId, uniqueRecent(recentRecords, "originalPosition"));
  addDatalist(formPage, adjustedListId, uniqueRecent(recentRecords, "adjustedPosition"));
  addDatalist(formPage, remarkListId, uniqueRecent(recentRecords, "remark"));

  const rowsHolder = el("div", { class: "adjustment-form-rows" });

  function renderRows() {
    rowsHolder.innerHTML = "";
    rows.forEach((row, index) => {
      const staffSelect = el("select", {
        required: "",
        "aria-label": `Row ${index + 1} staff name`,
        onchange: (event) => { row.staffName = event.target.value; },
      }, [el("option", { value: "" }, staffMembers.length ? "Select staff" : "Add staff in Settings first")]);
      for (const member of staffMembers) {
        const option = el("option", { value: member.name }, member.name);
        if (row.staffName === member.name) option.selected = true;
        staffSelect.appendChild(option);
      }

      const otherTypeInput = el("input", {
        type: "text",
        value: row.adjustmentTypeOther,
        placeholder: "Enter other adjustment type",
        "aria-label": `Row ${index + 1} other adjustment type`,
        oninput: (event) => { row.adjustmentTypeOther = event.target.value; },
      });
      function renderOtherType() {
        otherTypeInput.classList.toggle("hidden", row.adjustmentType !== "Other");
      }
      const typeSelect = el("select", {
        "aria-label": `Row ${index + 1} adjustment type`,
        onchange: (event) => {
          row.adjustmentType = event.target.value;
          renderOtherType();
        },
      });
      for (const type of ADJUSTMENT_TYPES) {
        const option = el("option", { value: type }, type);
        if (type === row.adjustmentType) option.selected = true;
        typeSelect.appendChild(option);
      }
      renderOtherType();

      const rowCard = el("section", { class: "form-section adjustment-row-card" }, [
        el("div", { class: "adjustment-row-header" }, [
          el("div", { class: "adjustment-row-title" }, `Adjustment Row ${index + 1}`),
          rows.length > 1 ? el("button", {
            class: "staff-remove-btn",
            type: "button",
            "aria-label": `Remove adjustment row ${index + 1}`,
            onclick: () => {
              rows.splice(index, 1);
              renderRows();
            },
          }, "Remove") : null,
        ]),
        el("div", { class: "adjustment-entry-grid" }, [
          el("div", { class: "adjustment-field" }, [el("label", {}, "Staff Name"), staffSelect]),
          el("div", { class: "adjustment-field" }, [
            el("label", {}, "Date"),
            el("input", {
              type: "date",
              value: row.date,
              onchange: (event) => { row.date = event.target.value; },
            }),
          ]),
          el("div", { class: "adjustment-field adjustment-type-field" }, [
            el("label", {}, "Adjustment Type"),
            typeSelect,
            otherTypeInput,
          ]),
          el("div", { class: "adjustment-field" }, [
            el("label", {}, "Original Position"),
            el("input", {
              type: "text",
              list: originalListId,
              value: row.originalPosition,
              placeholder: "Enter or select recent",
              oninput: (event) => { row.originalPosition = event.target.value; },
            }),
          ]),
          el("div", { class: "adjustment-field" }, [
            el("label", {}, "Adjusted Position"),
            el("input", {
              type: "text",
              list: adjustedListId,
              value: row.adjustedPosition,
              placeholder: "Enter or select recent",
              oninput: (event) => { row.adjustedPosition = event.target.value; },
            }),
          ]),
          el("div", { class: "adjustment-field adjustment-remark-field" }, [
            el("label", {}, "Remark"),
            el("select", {"aria-label":`Row ${index+1} request remark`,onchange:(event)=>{row.remark=event.target.value;}}, ["Staff Request","Our Request"].map(value=>el("option",{value,...(row.remark===value?{selected:""}:{})},value))),
          ]),
        ]),
      ]);
      rowsHolder.appendChild(rowCard);
    });
  }

  renderRows();
  formPage.appendChild(rowsHolder);
  formPage.appendChild(el("button", {
    class: "secondary-btn adjustment-add-row-btn",
    type: "button",
    onclick: () => {
      rows.push(newAdjustmentRow());
      renderRows();
      rowsHolder.lastElementChild.scrollIntoView({ behavior: "smooth", block: "start" });
    },
  }, "+ Add Row"));
  formPage.appendChild(el("button", {
    class: "primary-btn adjustment-save-btn",
    type: "button",
    onclick: async (event) => {
      if (!staffMembers.length) {
        showToast("Add staff names in Settings first.");
        return;
      }
      if (rows.some((row) => !row.staffName || !row.date)) {
        showToast("Select Staff Name and Date in every row.");
        return;
      }
      const batchId = crypto.randomUUID();
      const now = new Date().toISOString();
      const saveButton=event.currentTarget;
      if(saveButton.disabled)return;
      saveButton.disabled=true;
      saveButton.textContent="Saving…";
      let savedCount=0, skippedCount=0;
      try {
      const seen = new Set((await DB.getAll("adjustmentRecords")).map(adjustmentKey));
      const recordsToSave = [];
      for (const row of rows) {
        const key=adjustmentKey(row);
        if(seen.has(key)){skippedCount++;continue;}
        recordsToSave.push({
          ...row,
          id: crypto.randomUUID(),
          batchId,
          staffName: row.staffName.trim(),
          adjustmentTypeOther: row.adjustmentType === "Other" ? row.adjustmentTypeOther.trim() : "",
          originalPosition: row.originalPosition.trim(),
          adjustedPosition: row.adjustedPosition.trim(),
          remark: row.remark.trim(),
          createdAt: now,
          lastModified: now,
          sheetSyncStatus: "pending",
          sheetSyncedTo: "",
          sheetSyncedAt: null,
        });
        seen.add(key);savedCount++;
      }
      await DB.putMany("adjustmentRecords", recordsToSave);
      await mountDutyAdjustmentTab(container, setHeaderTitle);
      const savedMessage = `${savedCount} adjustment record${savedCount===1?"":"s"} saved on this device.${skippedCount ? " " + skippedCount + " duplicates skipped." : ""}`;
      const overlay=el("div",{class:"overlay",role:"dialog","aria-modal":"true","aria-label":"Adjustment save result"});
      const syncStatus=el("p",{role:"status"},"Google Sheet sync is running in the background. Your local save is complete.");
      const ok=el("button",{class:"primary-btn",type:"button",onclick:()=>overlay.remove()},"OK");
      overlay.appendChild(el("div",{class:"overlay-card"},[
        el("h2",{},savedCount ? "Saved Successfully" : "Already Saved"),el("p",{},savedMessage),syncStatus,ok,
      ]));
      document.body.appendChild(overlay);ok.focus();
      syncPendingAdjustmentRecords({interactive:false}).then(result=>{
        syncStatus.textContent=result.status==="not-linked" ? "Google Sheet is not linked. Your records are saved on this device." : "Google Sheet sync completed.";
      }).catch(()=>{syncStatus.textContent="Saved on this device. Sheet sync is pending—reconnect Google and use Sync Pending Records in Settings.";});
      } catch(error) {showToast(error.message || "Could not save adjustments.");saveButton.disabled=false;saveButton.textContent="Save Adjustment Records";}
    },
  }, "Save Adjustment Records"));
  container.appendChild(formPage);
}

