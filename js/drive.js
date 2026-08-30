import { DB } from "./db.js";
import { Constants } from "./constants.js";

const TOKEN_STORAGE_KEY = "rlb_google_token";
const LOCAL_SNAPSHOT_PREFIX = "localSnapshot:";
const LOCAL_SNAPSHOT_RETENTION_DAYS = 30;

let tokenClient = null;

function loadStoredToken() {
  try {
    const raw = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed.expiresAt && parsed.expiresAt > Date.now()) return parsed;
    return null;
  } catch {
    return null;
  }
}

function storeToken(tokenResponse) {
  const expiresAt = Date.now() + (tokenResponse.expires_in || 3600) * 1000 - 60000; // 1 min safety margin
  const data = { accessToken: tokenResponse.access_token, expiresAt };
  localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(data));
  return data;
}

export function isSignedIn() {
  return !!loadStoredToken();
}

async function getClientId() {
  const row = await DB.get("meta", "googleClientId");
  return row ? row.value : null;
}

function localDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export async function setClientId(clientId) {
  await DB.put("meta", { key: "googleClientId", value: clientId });
}

function ensureTokenClient(clientId) {
  if (!window.google || !window.google.accounts || !window.google.accounts.oauth2) {
    throw new Error("Google Sign-In library not loaded (are you offline?)");
  }
  if (tokenClient && tokenClient._clientId === clientId) return tokenClient;
  tokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: Constants.driveScope,
    callback: () => {}, // overridden per-request below
  });
  tokenClient._clientId = clientId;
  return tokenClient;
}

export async function signIn({ forceConsent = true, clientId = null } = {}) {
  const resolvedClientId = clientId || await getClientId();
  if (!resolvedClientId) throw new Error("Set your Google OAuth Client ID in Settings first.");
  const client = ensureTokenClient(resolvedClientId);
  return new Promise((resolve, reject) => {
    client.callback = (resp) => {
      if (resp.error) { reject(new Error(resp.error)); return; }
      resolve(storeToken(resp));
    };
    client.requestAccessToken({ prompt: forceConsent ? "consent" : "" });
  });
}

export async function getValidAccessToken({ interactive = false, clientId = null } = {}) {
  const stored = loadStoredToken();
  if (stored) return stored.accessToken;
  if (!interactive) return null;
  const token = await signIn({ forceConsent: false, clientId });
  return token.accessToken;
}

export function signOut() {
  const stored = loadStoredToken();
  localStorage.removeItem(TOKEN_STORAGE_KEY);
  if (stored && window.google && window.google.accounts && window.google.accounts.oauth2) {
    window.google.accounts.oauth2.revoke(stored.accessToken, () => {});
  }
}

async function driveFetch(path, accessToken, options = {}) {
  const res = await fetch(`https://www.googleapis.com${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${accessToken}`, ...(options.headers || {}) },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Drive API ${res.status}: ${body.slice(0, 200)}`);
  }
  return res;
}

async function findOrCreateFolder(accessToken) {
  const cached = await DB.get("meta", "driveFolderId");
  if (cached && cached.value) return cached.value;

  const query = encodeURIComponent(
    `mimeType='application/vnd.google-apps.folder' and name='${Constants.backupFolderName}' and trashed=false`
  );
  const listRes = await driveFetch(`/drive/v3/files?q=${query}&fields=files(id,name)`, accessToken);
  const listJson = await listRes.json();
  if (listJson.files && listJson.files.length > 0) {
    await DB.put("meta", { key: "driveFolderId", value: listJson.files[0].id });
    return listJson.files[0].id;
  }

  const createRes = await driveFetch("/drive/v3/files?fields=id", accessToken, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: Constants.backupFolderName, mimeType: "application/vnd.google-apps.folder" }),
  });
  const createJson = await createRes.json();
  await DB.put("meta", { key: "driveFolderId", value: createJson.id });
  return createJson.id;
}

async function findFileInFolder(accessToken, folderId, filename) {
  const query = encodeURIComponent(`'${folderId}' in parents and name='${filename}' and trashed=false`);
  const res = await driveFetch(`/drive/v3/files?q=${query}&fields=files(id,name)`, accessToken);
  const json = await res.json();
  return json.files && json.files.length > 0 ? json.files[0].id : null;
}

function multipartBody(metadata, jsonContent) {
  const boundary = "railwaylogbook_boundary_" + Math.random().toString(36).slice(2);
  const body =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: application/json\r\n\r\n` +
    `${jsonContent}\r\n` +
    `--${boundary}--`;
  return { body, contentType: `multipart/related; boundary=${boundary}` };
}

export async function buildBackupPayload() {
  const [locomotives, dutyEntries, scheduleTypes, profileRow] = await Promise.all([
    DB.getAll("locomotives"),
    DB.getAll("dutyEntries"),
    DB.getAll("scheduleTypes"),
    DB.get("profile", "singleton"),
  ]);
  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    profile: profileRow || { name: "" },
    locomotives,
    dutyEntries,
    scheduleTypes,
  };
}

export async function performBackup({ interactive = false, clientId = null } = {}) {
  const accessToken = await getValidAccessToken({ interactive, clientId });
  if (!accessToken) throw new Error("Not signed in to Google Drive.");

  const folderId = await findOrCreateFolder(accessToken);
  const dateStr = localDateString();
  const filename = `${Constants.backupFilenamePrefix}${dateStr}${Constants.backupFilenameExtension}`;
  const payload = await buildBackupPayload();
  const jsonContent = JSON.stringify(payload);
  const { body, contentType } = multipartBody({ name: filename, parents: [folderId], mimeType: "application/json" }, jsonContent);

  const existingFileId = await findFileInFolder(accessToken, folderId, filename);
  const url = existingFileId
    ? `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=multipart`
    : `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart`;
  const res = await fetch(url, {
    method: existingFileId ? "PATCH" : "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": contentType },
    body,
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Drive upload failed ${res.status}: ${errText.slice(0, 200)}`);
  }

  await Promise.all([
    DB.put("meta", { key: "lastBackupAt", value: new Date().toISOString() }),
    DB.put("meta", { key: "driveBackupDue", value: false }),
  ]);
  return true;
}

export async function listBackupFiles() {
  const accessToken = await getValidAccessToken({ interactive: false });
  if (!accessToken) throw new Error("Not signed in to Google Drive.");
  const folderId = await findOrCreateFolder(accessToken);
  const query = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
  const res = await driveFetch(`/drive/v3/files?q=${query}&fields=files(id,name,modifiedTime)&orderBy=name desc`, accessToken);
  const json = await res.json();
  return json.files || [];
}

export async function restoreFromFile(fileId) {
  const accessToken = await getValidAccessToken({ interactive: false });
  if (!accessToken) throw new Error("Not signed in to Google Drive.");
  const res = await driveFetch(`/drive/v3/files/${fileId}?alt=media`, accessToken);
  const payload = await res.json();
  return restoreFromPayload(payload);
}

export async function restoreFromPayload(payload) {
  if (!payload || payload.schemaVersion !== 1) throw new Error("Unsupported backup schema version.");
  if (!Array.isArray(payload.locomotives) || !Array.isArray(payload.dutyEntries) || !Array.isArray(payload.scheduleTypes)) {
    throw new Error("Backup file is incomplete or invalid.");
  }

  await Promise.all([DB.clear("locomotives"), DB.clear("dutyEntries"), DB.clear("scheduleTypes")]);
  for (const loco of payload.locomotives || []) await DB.put("locomotives", loco);
  for (const entry of payload.dutyEntries || []) await DB.put("dutyEntries", entry);
  for (const st of payload.scheduleTypes || []) await DB.put("scheduleTypes", st);
  if (payload.profile) await DB.put("profile", { id: "singleton", name: payload.profile.name || "" });
  return true;
}

export async function createLocalDailySnapshot({ force = false } = {}) {
  const date = localDateString();
  const key = `${LOCAL_SNAPSHOT_PREFIX}${date}`;
  const existing = await DB.get("meta", key);
  if (existing && !force) return existing.value;

  const createdAt = new Date().toISOString();
  const value = { createdAt, payload: await buildBackupPayload() };
  await Promise.all([
    DB.put("meta", { key, value }),
    DB.put("meta", { key: "lastLocalSnapshotAt", value: createdAt }),
  ]);

  const snapshots = (await DB.getAll("meta"))
    .filter((row) => row.key.startsWith(LOCAL_SNAPSHOT_PREFIX))
    .sort((a, b) => b.key.localeCompare(a.key));
  for (const oldSnapshot of snapshots.slice(LOCAL_SNAPSHOT_RETENTION_DAYS)) {
    await DB.delete("meta", oldSnapshot.key);
  }
  return value;
}

export async function listLocalSnapshots() {
  return (await DB.getAll("meta"))
    .filter((row) => row.key.startsWith(LOCAL_SNAPSHOT_PREFIX))
    .sort((a, b) => b.key.localeCompare(a.key))
    .map((row) => ({
      key: row.key,
      date: row.key.slice(LOCAL_SNAPSHOT_PREFIX.length),
      createdAt: row.value && row.value.createdAt,
    }));
}

export async function restoreLocalSnapshot(key) {
  const row = await DB.get("meta", key);
  if (!row || !row.value || !row.value.payload) throw new Error("Local snapshot not found.");
  return restoreFromPayload(row.value.payload);
}

export async function getLastLocalSnapshotAt() {
  const row = await DB.get("meta", "lastLocalSnapshotAt");
  return row ? row.value : null;
}

export async function saveBackupFileToDevice() {
  const payload = await buildBackupPayload();
  const filename = `${Constants.backupFilenamePrefix}${localDateString()}${Constants.backupFilenameExtension}`;
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return filename;
}

export async function getLastBackupAt() {
  const row = await DB.get("meta", "lastBackupAt");
  return row ? row.value : null;
}

export async function isDriveBackupDue() {
  const last = await getLastBackupAt();
  return !last || Date.now() - new Date(last).getTime() > Constants.minimumMsBetweenOpportunisticBackups;
}

// Best-effort opportunistic backup: only fires if signed in and it's been a while.
export async function attemptOpportunisticBackup() {
  try {
    const stale = await isDriveBackupDue();
    if (!stale) return { status: "current" };
    if (!isSignedIn()) {
      await DB.put("meta", { key: "driveBackupDue", value: true });
      return { status: "reconnect-needed" };
    }
    await performBackup();
    return { status: "backed-up" };
  } catch (e) {
    console.error("opportunistic backup failed", e);
    await DB.put("meta", { key: "driveBackupDue", value: true });
    return { status: "failed" };
  }
}
