import { DB } from "./db.js";
import { DEFAULT_SCHEDULE_TYPES, newProfile } from "./models.js";
import { mountDutyTab } from "./dutyEntries.js";
import { mountSettingsTab } from "./settings.js";
import { attemptOpportunisticBackup, createLocalDailySnapshot } from "./drive.js";

const viewContainer = document.getElementById("view-container");
const headerTitle = document.getElementById("header-title");
const tabButtons = document.querySelectorAll(".tab-btn");

const TABS = {
  duty: { mount: mountDutyTab },
  settings: { mount: mountSettingsTab },
};

let activeTab = "duty";

function setHeaderTitle(text) {
  headerTitle.textContent = text;
}

async function switchTab(tabKey) {
  activeTab = tabKey;
  tabButtons.forEach((btn) => btn.classList.toggle("active", btn.dataset.tab === tabKey));
  await TABS[tabKey].mount(viewContainer, setHeaderTitle);
}

tabButtons.forEach((btn) => {
  btn.addEventListener("click", () => switchTab(btn.dataset.tab));
});

async function seedDefaultsIfNeeded() {
  const existingTypes = await DB.getAll("scheduleTypes");
  if (existingTypes.length === 0) {
    for (let i = 0; i < DEFAULT_SCHEDULE_TYPES.length; i++) {
      await DB.put("scheduleTypes", { code: DEFAULT_SCHEDULE_TYPES[i], displayOrder: i, isUserAdded: false });
    }
  }
  const profile = await DB.get("profile", "singleton");
  if (!profile) {
    await DB.put("profile", newProfile());
  }
  return profile;
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch((err) => console.error("SW registration failed", err));
  }
}

async function requestPersistentStorage() {
  if (!navigator.storage || !navigator.storage.persist) return;
  try {
    const granted = await navigator.storage.persist();
    await DB.put("meta", { key: "persistentStorageGranted", value: granted });
  } catch (error) {
    console.warn("Persistent storage request was unavailable", error);
  }
}

function wireDataProtection() {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      createLocalDailySnapshot();
      attemptOpportunisticBackup();
    }
  });
}

async function init() {
  await seedDefaultsIfNeeded();
  registerServiceWorker();
  wireDataProtection();
  requestPersistentStorage();
  await switchTab("duty");
  await createLocalDailySnapshot();
  attemptOpportunisticBackup();
}

init();
