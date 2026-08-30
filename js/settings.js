import { DB } from "./db.js";
import { el, formatRelative } from "./util.js";
import { AutosaveController } from "./autosave.js";
import { renderScheduleTypeManager } from "./scheduleTypes.js";
import * as Drive from "./drive.js";
import { showToast } from "./toast.js";

export async function mountSettingsTab(container, setHeaderTitle) {
  setHeaderTitle("Settings");
  container.innerHTML = "";

  const profile = (await DB.get("profile", "singleton")) || { id: "singleton", name: "" };
  const profileAutosave = new AutosaveController(async () => { await DB.put("profile", profile); });

  const profileSection = el("div", { class: "form-section" });
  profileSection.appendChild(el("div", { class: "form-section-title" }, "Profile"));
  profileSection.appendChild(el("div", { class: "form-row" }, [
    el("label", {}, "Pilot Name"),
    el("input", { type: "text", value: profile.name || "", oninput: (e) => { profile.name = e.target.value; profileAutosave.fieldChanged(); } }),
  ]));
  container.appendChild(profileSection);

  const scheduleLink = el("div", { class: "card list-row", onclick: () => openScheduleManager(container, setHeaderTitle) }, [
    el("div", { class: "list-row-main" }, [el("div", { class: "list-row-title" }, "Manage Schedule Types")]),
    el("span", {}, "›"),
  ]);
  container.appendChild(scheduleLink);

  // --- Device-local protection ---
  const localSection = el("div", { class: "form-section" });
  localSection.appendChild(el("div", { class: "form-section-title" }, "Local Data & 30-Day Snapshots"));

  const [lastLocalSnapshot, persistentStorageRow] = await Promise.all([
    Drive.getLastLocalSnapshotAt(),
    DB.get("meta", "persistentStorageGranted"),
  ]);
  localSection.appendChild(el("div", { class: "form-row" }, [
    el("label", {}, "Live records: saved automatically and kept until you delete them"),
    el("span", { class: "list-row-sub" }, `Last daily snapshot: ${formatRelative(lastLocalSnapshot)}`),
    el("span", { class: "list-row-sub" }, "Recovery snapshot history: latest 30 days"),
    el("span", { class: "list-row-sub" }, persistentStorageRow && persistentStorageRow.value
      ? "Storage protection: enabled"
      : "Storage protection: managed by this browser"),
  ]));

  const saveFileBtn = el("button", { class: "primary-btn", onclick: async () => {
    try {
      const filename = await Drive.saveBackupFileToDevice();
      showToast(`Saved ${filename}`);
    } catch (e) {
      showToast(e.message || "Could not save backup file");
    }
  } }, "Save Backup File");

  const restoreFileInput = el("input", {
    type: "file",
    accept: "application/json,.json",
    style: "display:none;",
    onchange: async (event) => {
      const file = event.target.files && event.target.files[0];
      if (!file) return;
      try {
        const payload = JSON.parse(await file.text());
        if (!confirm(`Restore from ${file.name}? This replaces all current data on this device.`)) return;
        await Drive.restoreFromPayload(payload);
        await Drive.createLocalDailySnapshot({ force: true });
        showToast("Local backup restored");
        mountSettingsTab(container, setHeaderTitle);
      } catch (e) {
        showToast(e.message || "Invalid backup file");
      } finally {
        event.target.value = "";
      }
    },
  });
  const restoreFileBtn = el("button", { class: "secondary-btn", style: "margin-top:8px;", onclick: () => restoreFileInput.click() }, "Restore Backup File");
  localSection.appendChild(el("div", { class: "form-row" }, [saveFileBtn, restoreFileBtn, restoreFileInput]));
  container.appendChild(localSection);

  const localSnapshotsLink = el("div", { class: "card list-row", onclick: () => openLocalSnapshotView(container, setHeaderTitle) }, [
    el("div", { class: "list-row-main" }, [el("div", { class: "list-row-title" }, "Restore a Local Daily Snapshot")]),
    el("span", {}, "›"),
  ]);
  container.appendChild(localSnapshotsLink);

  // --- Backup section ---
  const backupSection = el("div", { class: "form-section" });
  backupSection.appendChild(el("div", { class: "form-section-title" }, "Google Drive Backup"));

  const clientIdRow = await DB.get("meta", "googleClientId");
  const clientIdInput = el("input", { type: "text", placeholder: "Google OAuth Web Client ID", value: (clientIdRow && clientIdRow.value) || "" });
  backupSection.appendChild(el("div", { class: "form-row" }, [
    el("label", {}, "OAuth Client ID (see README for setup)"),
    clientIdInput,
    el("span", { class: "list-row-sub" }, "Drive retention: one dated backup per day, never auto-deleted by RailwayLogbook."),
    el("span", { class: "list-row-sub" }, "Google access tokens expire by design. If needed, Backup Now asks you to reconnect; local saving never stops."),
  ]));
  clientIdInput.onchange = async () => { await Drive.setClientId(clientIdInput.value.trim()); };

  const statusRow = el("div", { class: "form-row" });
  const lastBackupRow = el("div", { class: "form-row" });
  backupSection.appendChild(statusRow);
  backupSection.appendChild(lastBackupRow);

  async function refreshStatus() {
    statusRow.innerHTML = "";
    lastBackupRow.innerHTML = "";
    const signedIn = Drive.isSignedIn();
    const configured = !!clientIdInput.value.trim();
    statusRow.appendChild(el("label", {}, signedIn
      ? "Google Drive ready for this session"
      : configured ? "Reconnect needed for the next Drive backup" : "Google Drive not configured"));
    const [last, due] = await Promise.all([Drive.getLastBackupAt(), Drive.isDriveBackupDue()]);
    lastBackupRow.appendChild(el("label", {}, `${due ? "Daily backup due" : "Daily backup current"} · Last successful backup: ${formatRelative(last)}`));
  }
  await refreshStatus();

  const connectBtn = el("button", { class: "secondary-btn", onclick: async () => {
    try {
      const clientId = clientIdInput.value.trim();
      const saveClientId = Drive.setClientId(clientId);
      await Drive.signIn({ forceConsent: true, clientId });
      await saveClientId;
      await Drive.performBackup();
      showToast("Connected and backed up");
      await refreshStatus();
    } catch (e) {
      showToast(e.message || "Sign-in failed");
    }
  } }, "Connect & Back Up");

  const backupNowBtn = el("button", { class: "primary-btn", style: "margin-top:8px;", onclick: async () => {
    backupNowBtn.textContent = "Backing up…";
    try {
      const clientId = clientIdInput.value.trim();
      const saveClientId = Drive.setClientId(clientId);
      await Drive.performBackup({ interactive: true, clientId });
      await saveClientId;
      showToast("Backup complete");
    } catch (e) {
      showToast(e.message || "Backup failed");
    } finally {
      backupNowBtn.textContent = "Backup Now";
      await refreshStatus();
    }
  } }, "Backup Now");

  const disconnectBtn = el("button", { class: "secondary-btn", style: "margin-top:8px;", onclick: async () => {
    Drive.signOut();
    await refreshStatus();
  } }, "Disconnect");

  backupSection.appendChild(el("div", { class: "form-row" }, [connectBtn, backupNowBtn, disconnectBtn]));
  container.appendChild(backupSection);

  const restoreLink = el("div", { class: "card list-row", onclick: () => openRestoreView(container, setHeaderTitle) }, [
    el("div", { class: "list-row-main" }, [el("div", { class: "list-row-title" }, "Restore from Backup")]),
    el("span", {}, "›"),
  ]);
  container.appendChild(restoreLink);
}

function openScheduleManager(container, setHeaderTitle) {
  const overlay = el("div", { class: "overlay" });
  const card = el("div", { class: "overlay-card" });
  overlay.appendChild(card);
  document.body.appendChild(overlay);
  renderScheduleTypeManager(card);
  card.insertBefore(el("button", { class: "secondary-btn", onclick: () => { overlay.remove(); mountSettingsTab(container, setHeaderTitle); } }, "Close"), card.firstChild);
}

async function openLocalSnapshotView(container, setHeaderTitle) {
  const overlay = el("div", { class: "overlay" });
  const card = el("div", { class: "overlay-card" }, [el("h2", {}, "Local Daily Snapshots")]);
  overlay.appendChild(card);
  document.body.appendChild(overlay);

  const snapshots = await Drive.listLocalSnapshots();
  if (snapshots.length === 0) {
    card.appendChild(el("p", {}, "No local snapshots yet."));
  }
  for (const snapshot of snapshots) {
    card.appendChild(el("div", { class: "card list-row", onclick: async () => {
      if (!confirm(`Restore the local snapshot from ${snapshot.date}? This replaces current data on this device.`)) return;
      try {
        await Drive.restoreLocalSnapshot(snapshot.key);
        showToast("Local snapshot restored");
        overlay.remove();
        mountSettingsTab(container, setHeaderTitle);
      } catch (e) {
        showToast(e.message || "Restore failed");
      }
    } }, [
      el("div", { class: "list-row-main" }, [
        el("div", { class: "list-row-title" }, snapshot.date),
        el("div", { class: "list-row-sub" }, formatRelative(snapshot.createdAt)),
      ]),
      el("span", {}, "›"),
    ]));
  }
  card.appendChild(el("button", { class: "secondary-btn", style: "margin-top:8px;", onclick: () => overlay.remove() }, "Close"));
}

async function openRestoreView(container, setHeaderTitle) {
  const overlay = el("div", { class: "overlay" });
  const card = el("div", { class: "overlay-card" }, [el("h2", {}, "Restore from Backup")]);
  overlay.appendChild(card);
  document.body.appendChild(overlay);

  card.appendChild(el("p", {}, "Loading backups…"));
  try {
    const files = await Drive.listBackupFiles();
    card.querySelector("p").remove();
    if (files.length === 0) {
      card.appendChild(el("p", {}, "No backups found."));
    }
    for (const file of files) {
      card.appendChild(el("div", { class: "card list-row", onclick: async () => {
        if (!confirm(`Restore from ${file.name}? This replaces all current data on this device.`)) return;
        await Drive.restoreFromFile(file.id);
        showToast("Restore complete");
        overlay.remove();
        mountSettingsTab(container, setHeaderTitle);
      } }, [el("div", { class: "list-row-main" }, [el("div", { class: "list-row-title" }, file.name)])]));
    }
  } catch (e) {
    card.querySelector("p").textContent = e.message || "Failed to load backups.";
  }
  card.appendChild(el("button", { class: "secondary-btn", style: "margin-top:8px;", onclick: () => overlay.remove() }, "Close"));
}
