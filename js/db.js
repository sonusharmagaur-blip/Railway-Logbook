// Thin promise-based wrapper around IndexedDB for RailwayLogbook.
// Object stores: locomotives, dutyEntries, adjustmentRecords, staffMembers,
// scheduleTypes, profile, meta

const DB_NAME = "railwaylogbook";
const DB_VERSION = 2;

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (event) => {
      const db = req.result;
      if (!db.objectStoreNames.contains("locomotives")) {
        db.createObjectStore("locomotives", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("dutyEntries")) {
        const store = db.createObjectStore("dutyEntries", { keyPath: "id" });
        store.createIndex("date", "date");
      }
      if (!db.objectStoreNames.contains("adjustmentRecords")) {
        const store = db.createObjectStore("adjustmentRecords", { keyPath: "id" });
        store.createIndex("date", "date");
        store.createIndex("staffName", "staffName");
      }
      if (!db.objectStoreNames.contains("staffMembers")) {
        const store = db.createObjectStore("staffMembers", { keyPath: "id" });
        store.createIndex("name", "name");
      }
      if (!db.objectStoreNames.contains("scheduleTypes")) {
        db.createObjectStore("scheduleTypes", { keyPath: "code" });
      }
      if (!db.objectStoreNames.contains("profile")) {
        db.createObjectStore("profile", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("meta")) {
        db.createObjectStore("meta", { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(storeName, mode) {
  return openDB().then((db) => db.transaction(storeName, mode).objectStore(storeName));
}

function wrapRequest(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const MASTER_FIELDS = ["locomotivePTType","srMake","srMakeOther","hogMake","hogMakeOther","burMake","burMakeOther","acFitted","acStatus","rtisFitted","rtisStatus","uicStatus","uicCableConnected","uicCableOption"];

function mergeLocoMasters(existing, entries) {
  const masters = new Map(existing.filter(l => l.isLocoMaster).map(l => [l.number, l]));
  const updates = new Map();
  for (const entry of entries.filter(e => e.isDraft !== true).sort((a,b) => (a.lastModified || a.date || "").localeCompare(b.lastModified || b.date || ""))) {
    const legacy = existing.find(l => l.id === entry.locomotiveId);
    const number = String(entry.locomotiveNumberSnapshot || legacy?.number || "").replace(/[^0-9]/g, "");
    if (!number) continue;
    const stamp = entry.lastModified || entry.date || "";
    const previous = masters.get(number);
    if (previous && (previous.lastModified || "") >= stamp) continue;
    const master = {...previous, id:"loco-master:"+number, number, isLocoMaster:true,
      locoClass:entry.locomotiveType || legacy?.locoClass || previous?.locoClass || "",
      shed:entry.locomotiveShed || legacy?.shed || previous?.shed || "",
      lastModified:stamp, sourceEntryId:entry.id};
    for (const key of MASTER_FIELDS) if (entry[key] !== undefined && entry[key] !== null) master[key] = entry[key];
    masters.set(number, master); updates.set(number, master);
  }
  return [...updates.values()];
}

// Use the existing backed-up locomotives store; do not change the database version.
async function saveWithLocoMaster(entries, dutyEntry) {
  const db = await openDB();
  return new Promise((resolve,reject) => {
    const transaction = db.transaction(dutyEntry ? ["locomotives","dutyEntries","meta"] : ["locomotives","meta"], "readwrite");
    transaction.oncomplete = () => resolve(dutyEntry?.id);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error || new Error("Loco master save aborted"));
    if (dutyEntry) transaction.objectStore("dutyEntries").put(dutyEntry);
    const trains = new Map();
    for (const e of entries.filter(e=>e.isDraft!==true).sort((a,b)=>(a.lastModified||a.date||"").localeCompare(b.lastModified||b.date||""))) {
      for (const [number,name] of [[e.trainNumber,e.trainName],...(e.isDotTrain?[[e.dotTrainNumber,e.dotTrainName]]:[])]) {
        const n=String(number||"").trim().toUpperCase(), text=String(name||"").trim().toUpperCase();
        if(n&&text) trains.set(n,{key:"train-name:"+n,number:n,name:text,lastModified:e.lastModified||e.date||""});
      }
    }
    const meta=transaction.objectStore("meta");
    for(const record of trains.values()){
      const old=meta.get(record.key);
      old.onsuccess=()=>{if(!old.result||(old.result.lastModified||"")<=record.lastModified)meta.put(record);};
    }
    const store = transaction.objectStore("locomotives");
    const request = store.getAll();
    request.onsuccess = () => {
      for (const master of mergeLocoMasters(request.result, entries)) store.put(master);
    };
  });
}

export const DB = {
  async putMany(storeName, values) {
    if (!values.length) return;
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, "readwrite");
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error || new Error("Batch save aborted"));
      const store = transaction.objectStore(storeName);
      for (const value of values) store.put(value);
    });
  },
  async rememberLocomotives(entries) {
    return saveWithLocoMaster(entries);
  },
  async getAll(storeName) {
    const store = await tx(storeName, "readonly");
    return wrapRequest(store.getAll());
  },

  async get(storeName, key) {
    const store = await tx(storeName, "readonly");
    return wrapRequest(store.get(key));
  },

  async put(storeName, value) {
    if (storeName === "dutyEntries" && value.isDraft !== true) return saveWithLocoMaster([value], value);
    const store = await tx(storeName, "readwrite");
    return wrapRequest(store.put(value));
  },

  async delete(storeName, key) {
    const store = await tx(storeName, "readwrite");
    return wrapRequest(store.delete(key));
  },

  async clear(storeName) {
    const store = await tx(storeName, "readwrite");
    return wrapRequest(store.clear());
  },

  async count(storeName) {
    const store = await tx(storeName, "readonly");
    return wrapRequest(store.count());
  },
};

