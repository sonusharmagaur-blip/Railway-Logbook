import { DB } from "./db.js";
import { el, formatDate } from "./util.js";
import { showToast } from "./toast.js";

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
    remark: "",
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

  const staffFilter = el("select", { "aria-label": "Filter by staff name" }, [
    el("option", { value: "" }, "All Staff"),
  ]);
  const filterNames = [...new Set([
    ...staffMembers.map((member) => member.name),
    ...allRecords.map((record) => record.staffName).filter(Boolean),
  ])].sort((a, b) => a.localeCompare(b));
  for (const name of filterNames) staffFilter.appendChild(el("option", { value: name }, name));

  const fromDate = el("input", { type: "date", "aria-label": "From date" });
  const toDate = el("input", { type: "date", "aria-label": "To date" });
  filters.appendChild(el("div", { class: "adjustment-filter-grid" }, [
    el("div", { class: "adjustment-field" }, [el("label", {}, "Staff Name"), staffFilter]),
    el("div", { class: "adjustment-field" }, [el("label", {}, "From Date"), fromDate]),
    el("div", { class: "adjustment-field" }, [el("label", {}, "To Date"), toDate]),
  ]));
  page.appendChild(filters);

  const resultSummary = el("div", { class: "adjustment-result-summary" });
  const recordsHolder = el("div", { class: "adjustment-records" });
  page.appendChild(resultSummary);
  page.appendChild(recordsHolder);

  function renderRecords() {
    const selectedName = staffFilter.value;
    const start = fromDate.value;
    const end = toDate.value;
    const records = allRecords
      .filter((record) => !selectedName || record.staffName === selectedName)
      .filter((record) => !start || record.date >= start)
      .filter((record) => !end || record.date <= end)
      .sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.createdAt || "").localeCompare(a.createdAt || ""));

    resultSummary.textContent = `${records.length} record${records.length === 1 ? "" : "s"}`;
    recordsHolder.innerHTML = "";
    if (!records.length) {
      recordsHolder.appendChild(el("div", { class: "empty-state adjustment-empty" }, allRecords.length
        ? "No records match these filters."
        : "No duty adjustment records yet. Tap + to add one."));
      return;
    }
    for (const record of records) {
      recordsHolder.appendChild(el("article", { class: "card adjustment-record-card" }, [
        el("div", { class: "adjustment-record-head" }, [
          el("div", {}, [
            el("div", { class: "adjustment-record-name" }, record.staffName || "Staff not selected"),
            el("div", { class: "adjustment-record-date" }, formatDate(record.date) || "—"),
          ]),
          el("span", { class: "badge adjustment-type-badge" }, displayAdjustmentType(record)),
        ]),
        el("div", { class: "adjustment-position-line" }, [
          el("span", { class: "adjustment-position-label" }, "Original"),
          el("strong", {}, record.originalPosition || "—"),
          el("span", { class: "adjustment-position-arrow", "aria-hidden": "true" }, "→"),
          el("span", { class: "adjustment-position-label" }, "Adjusted"),
          el("strong", {}, record.adjustedPosition || "—"),
        ]),
        record.remark ? el("div", { class: "adjustment-record-remark" }, `Remark: ${record.remark}`) : null,
      ]));
    }
  }

  staffFilter.addEventListener("change", renderRecords);
  fromDate.addEventListener("change", renderRecords);
  toDate.addEventListener("change", renderRecords);
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
            el("input", {
              type: "text",
              list: remarkListId,
              value: row.remark,
              placeholder: "Enter or select recent",
              oninput: (event) => { row.remark = event.target.value; },
            }),
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
    onclick: async () => {
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
      for (const row of rows) {
        await DB.put("adjustmentRecords", {
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
        });
      }
      showToast(`${rows.length} adjustment record${rows.length === 1 ? "" : "s"} saved.`);
      await mountDutyAdjustmentTab(container, setHeaderTitle);
    },
  }, "Save Adjustment Records"));
  container.appendChild(formPage);
}
