import { DB } from "./db.js";
import { Constants } from "./constants.js";
import { getValidAccessToken } from "./drive.js";

const SHEET_TITLE = "Duty Adjustments";
const HEADER_ROW = [
  "Record ID",
  "Date",
  "Staff Name",
  "Adjustment Type",
  "Original Position",
  "Adjusted Position",
  "Remark",
  "Saved At",
  "Synced At",
];

function extractSpreadsheetId(value) {
  const input = String(value || "").trim();
  const match = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  const id = match ? match[1] : input;
  return /^[a-zA-Z0-9_-]{20,}$/.test(id) ? id : "";
}

function sheetUrl(spreadsheetId) {
  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
}

async function sheetsFetch(path, token, options = {}) {
  const response = await fetch(`https://sheets.googleapis.com/v4/${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Google Sheets ${response.status}: ${body.slice(0, 180)}`);
  }
  return response;
}

async function ensureWorksheet(spreadsheetId, token) {
  const metadataResponse = await sheetsFetch(
    `spreadsheets/${encodeURIComponent(spreadsheetId)}?fields=sheets.properties(title,sheetId)`,
    token
  );
  const metadata = await metadataResponse.json();
  const exists = (metadata.sheets || []).some((sheet) => sheet.properties && sheet.properties.title === SHEET_TITLE);
  if (!exists) {
    await sheetsFetch(`spreadsheets/${encodeURIComponent(spreadsheetId)}:batchUpdate`, token, {
      method: "POST",
      body: JSON.stringify({ requests: [{ addSheet: { properties: { title: SHEET_TITLE } } }] }),
    });
  }

  const headerRange = encodeURIComponent(`'${SHEET_TITLE}'!A1:I1`);
  const headerResponse = await sheetsFetch(
    `spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${headerRange}`,
    token
  );
  const headerData = await headerResponse.json();
  if (!headerData.values || !headerData.values.length) {
    await sheetsFetch(
      `spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${headerRange}?valueInputOption=RAW`,
      token,
      { method: "PUT", body: JSON.stringify({ values: [HEADER_ROW] }) }
    );
  }
}

async function accessToken(interactive) {
  const token = await getValidAccessToken({
    interactive,
    requiredScopes: [Constants.sheetsScope],
  });
  if (!token) throw new Error("Reconnect Google access to enable Sheet sync.");
  return token;
}

export async function getLinkedSheet() {
  const row = await DB.get("meta", "adjustmentSheetId");
  if (!row || !row.value) return null;
  return { id: row.value, url: sheetUrl(row.value) };
}

export async function linkExistingSheet(value) {
  const spreadsheetId = extractSpreadsheetId(value);
  if (!spreadsheetId) throw new Error("Enter a valid Google Sheet URL or Sheet ID.");
  const token = await accessToken(true);
  await ensureWorksheet(spreadsheetId, token);
  await DB.put("meta", { key: "adjustmentSheetId", value: spreadsheetId });
  return { id: spreadsheetId, url: sheetUrl(spreadsheetId) };
}

export async function createAndLinkSheet() {
  const token = await accessToken(true);
  const response = await sheetsFetch("spreadsheets", token, {
    method: "POST",
    body: JSON.stringify({
      properties: { title: "Duty Adjustment Record" },
      sheets: [{ properties: { title: SHEET_TITLE } }],
    }),
  });
  const spreadsheet = await response.json();
  await DB.put("meta", { key: "adjustmentSheetId", value: spreadsheet.spreadsheetId });
  await ensureWorksheet(spreadsheet.spreadsheetId, token);
  return { id: spreadsheet.spreadsheetId, url: spreadsheet.spreadsheetUrl || sheetUrl(spreadsheet.spreadsheetId) };
}

function rowValues(record, syncedAt) {
  const type = record.adjustmentType === "Other"
    ? record.adjustmentTypeOther || "Other"
    : record.adjustmentType || "";
  return [
    record.id,
    record.date || "",
    record.staffName || "",
    type,
    record.originalPosition || "",
    record.adjustedPosition || "",
    record.remark || "",
    record.createdAt || "",
    syncedAt,
  ];
}

export async function syncPendingAdjustmentRecords({ interactive = false } = {}) {
  const linked = await getLinkedSheet();
  if (!linked) return { status: "not-linked", synced: 0, pending: 0 };
  const token = await accessToken(interactive);
  await ensureWorksheet(linked.id, token);
  const records = await DB.getAll("adjustmentRecords");
  const pending = records.filter((record) => record.sheetSyncedTo !== linked.id || record.sheetSyncStatus !== "synced");
  let synced = 0;
  for (const record of pending) {
    const syncedAt = new Date().toISOString();
    const range = encodeURIComponent(`'${SHEET_TITLE}'!A:I`);
    await sheetsFetch(
      `spreadsheets/${encodeURIComponent(linked.id)}/values/${range}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
      token,
      { method: "POST", body: JSON.stringify({ values: [rowValues(record, syncedAt)] }) }
    );
    record.sheetSyncStatus = "synced";
    record.sheetSyncedTo = linked.id;
    record.sheetSyncedAt = syncedAt;
    await DB.put("adjustmentRecords", record);
    synced += 1;
  }
  await DB.put("meta", { key: "lastAdjustmentSheetSyncAt", value: new Date().toISOString() });
  return { status: "synced", synced, pending: 0, url: linked.url };
}

export async function pullAdjustmentRecordsFromSheet({ interactive = false } = {}) {
  const linked = await getLinkedSheet();
  if (!linked) return { status: "not-linked", imported: 0, total: 0 };
  const token = await accessToken(interactive);
  await ensureWorksheet(linked.id, token);
  const range = encodeURIComponent(`'${SHEET_TITLE}'!A2:I`);
  const response = await sheetsFetch(
    `spreadsheets/${encodeURIComponent(linked.id)}/values/${range}?majorDimension=ROWS`,
    token
  );
  const data = await response.json();
  const rows = Array.isArray(data.values) ? data.values : [];
  const existingIds = new Set((await DB.getAll("adjustmentRecords")).map((record) => record.id));
  let imported = 0;
  for (const values of rows) {
    const [id, date, staffName, type, originalPosition, adjustedPosition, remark, savedAt, syncedAt] = values;
    if (!id || !date) continue;
    const knownType = ["Shift", "Link", "Rest"].includes(type);
    await DB.put("adjustmentRecords", {
      id,
      batchId: "",
      date: date || "",
      staffName: staffName || "",
      adjustmentType: knownType ? type : "Other",
      adjustmentTypeOther: knownType ? "" : type || "",
      originalPosition: originalPosition || "",
      adjustedPosition: adjustedPosition || "",
      remark: remark || "",
      createdAt: savedAt || syncedAt || new Date().toISOString(),
      lastModified: savedAt || syncedAt || new Date().toISOString(),
      sheetSyncStatus: "synced",
      sheetSyncedTo: linked.id,
      sheetSyncedAt: syncedAt || null,
    });
    if (!existingIds.has(id)) imported += 1;
  }
  await DB.put("meta", { key: "lastAdjustmentSheetSyncAt", value: new Date().toISOString() });
  return { status: "pulled", imported, total: rows.length, url: linked.url };
}

export async function countPendingAdjustmentRecords() {
  const linked = await getLinkedSheet();
  const records = await DB.getAll("adjustmentRecords");
  if (!linked) return records.length;
  return records.filter((record) => record.sheetSyncedTo !== linked.id || record.sheetSyncStatus !== "synced").length;
}

export async function getLastSheetSyncAt() {
  const row = await DB.get("meta", "lastAdjustmentSheetSyncAt");
  return row ? row.value : null;
}
