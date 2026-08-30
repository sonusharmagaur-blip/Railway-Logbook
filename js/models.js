// Data model definitions: enums, defaults, factory functions.

export const ACStatus = {
  WORKING: "Working",
  NOT_WORKING_BOTH_CAB: "Not Working (Both Cab)",
  NOT_WORKING_ONE_CAB: "Not Working (One Cab)",
};
export const AC_STATUS_OPTIONS = Object.values(ACStatus);

export const UICStatus = {
  MODIFIED: "Modified",
  NORMAL: "Normal",
  NON_HOG: "Non HOG",
};
export const UIC_STATUS_OPTIONS = Object.values(UICStatus);

export const UICCableOption = {
  ONE_CABLE: "One Cable Attached",
  BOTH_CABLE: "Both Cable Attached",
};
export const UIC_CABLE_OPTIONS = Object.values(UICCableOption);

export const RTISStatus = {
  WORKING: "Working",
  NOT_WORKING: "Not Working",
};
export const RTIS_STATUS_OPTIONS = Object.values(RTISStatus);

export const LOCOMOTIVE_TYPE_OPTIONS = ["WAP5", "WAP7", "WAG9", "WAP4", "DSL Loco", "WAG12"];
export const CAB_OPTIONS = ["Cab-1", "Cab-2"];
export const PT_TYPE_OPTIONS = ["Normal", "Both HRP", "PT-1 HRP", "PT-2 HRP"];
export const MAJOR_SCHEDULE_OPTIONS = ["IA", "IB", "IC", "IOH", "POH", "MOH", "NC Loco"];
export const MINOR_SCHEDULE_TYPE_OPTIONS = ["TI", "VC", "GC"];
export const SR_BUR_MAKE_OPTIONS = ["MEDHA", "BT", "ABB", "CG", "SIEMENS", "BHEL", "Other"];
export const HOG_MAKE_OPTIONS = ["SIEMENS", "MEDHA", "BHEL", "ABB", "CG", "ALL", "NON HOG", "Other"];
export const HOG_STATUS_OPTIONS = ["WKG", "Not WKG", "HOG-1 Faulty", "HOG-2 Faulty"];
export const COMPONENT_UIC_OPTIONS = ["Modified", "Normal"];
export const CABLE_CONNECTED_OPTIONS = ["2 Cables", "1 Cable", "HOG Not Connected"];
export const FITTED_OPTIONS = ["Fitted", "Not Fitted"];
export const RTIS_COMPONENT_STATUS_OPTIONS = ["Working", "Display Defective", "MCB Trip"];
export const AC_COMPONENT_STATUS_OPTIONS = ["Working", "Cab 1 NW", "Cab 2 NW"];
export const KAVACH_MAKE_OPTIONS = ["HBL", "KERNEX", "MEDHA", "Not Fitted"];
export const KAVACH_STATUS_OPTIONS = ["In Service", "OFF"];
export const BRAKE_SYSTEM_OPTIONS = ["E70", "CCB 2.0", "CCB 1.5"];
export const SPM_MAKE_OPTIONS = ["MEDHA", "TELPRO", "LAXVEN", "Other"];
export const LOCO_OFFER_PLACE_OPTIONS = ["SH-329", "SH-306", "SH-182", "SH-184", "SH-307", "Other"];
export const BP_FP_PLACE_OPTIONS = ["Yard", "PF", "Other"];

// Default schedule types seeded on first launch. User can add more from Settings.
export const DEFAULT_SCHEDULE_TYPES = ["IA", "IB", "IC", "IOH", "POH", "MOH", "TI"];

// Time fields used by the structured Movement Details section and exports.
export const TIMELINE_STEPS = [
  { key: "locoTakeoverTime", label: "Loco Takeover" },
  { key: "locoCheckedUptoTime", label: "Checked Upto" },
  { key: "locoOfferTime", label: "Loco Offer" },
  { key: "locoOfferDepartureTime", label: "Offer Departure" },
  { key: "engineOnTrainTime", label: "Engine on Train" },
  { key: "hogAttachedTime", label: "HOG Attached From" },
  { key: "hogAttachedToTime", label: "HOG Attached To" },
  { key: "bpFpTime", label: "BP/FP Buildup" },
  { key: "departureTime", label: "Yard Departure" },
  { key: "placementTime", label: "Placement" },
  { key: "continuityTime", label: "Continuity" },
  { key: "bpcTime", label: "BPC" },
  { key: "madeOverChargeTime", label: "Made Over Charge" },
];

function uuid() {
  return crypto.randomUUID();
}

function localDateInputValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function newLocomotive() {
  return { id: uuid(), number: "", locoClass: "", shed: "" };
}

export function newAdditionalLocomotive(role) {
  return {
    id: uuid(),
    role,
    locomotiveNumberSnapshot: "",
    locomotiveType: "",
    locomotiveShed: "",
    cabSelection: "",
    ptType: PT_TYPE_OPTIONS[0],
  };
}

export function newMinorSchedule() {
  return {
    id: uuid(),
    type: MINOR_SCHEDULE_TYPE_OPTIONS[0],
    date: null,
    km: null,
  };
}

export function newDutyEntry() {
  const now = new Date().toISOString();
  const entry = {
    id: uuid(),
    date: localDateInputValue(), // yyyy-mm-dd in the device's local timezone
    movementType: "departure",
    isDraft: true,
    draftPage: 1,
    trainNumber: "",
    trainName: "",
    locomotiveId: null,
    locomotiveNumberSnapshot: "",
    locomotiveType: "",
    locomotiveShed: "",
    cabSelection: "",
    locomotivePTType: PT_TYPE_OPTIONS[0],
    additionalLocomotives: [],
    remarks: "",
    uicStatus: UICStatus.NORMAL,
    uicCableOption: null,
    majorScheduleTypeCode: MAJOR_SCHEDULE_OPTIONS[0],
    majorScheduleDate: null,
    minorSchedules: [newMinorSchedule()],
    minorScheduleTIDate: null,
    kmSinceLastSchedule: null,
    srMake: SR_BUR_MAKE_OPTIONS[0],
    srMakeOther: "",
    burMake: SR_BUR_MAKE_OPTIONS[0],
    burMakeOther: "",
    hogMake: HOG_MAKE_OPTIONS[0],
    hogMakeOther: "",
    hogStatus: HOG_STATUS_OPTIONS[0],
    uicCableConnected: CABLE_CONNECTED_OPTIONS[0],
    rtisFitted: FITTED_OPTIONS[0],
    rtisStatus: RTIS_COMPONENT_STATUS_OPTIONS[0],
    acFitted: FITTED_OPTIONS[0],
    acStatus: AC_COMPONENT_STATUS_OPTIONS[0],
    kavachMake: KAVACH_MAKE_OPTIONS[0],
    kavachStatus: KAVACH_STATUS_OPTIONS[0],
    brakeSystem: BRAKE_SYSTEM_OPTIONS[0],
    spmMake: SPM_MAKE_OPTIONS[0],
    spmMakeOther: "",
    mcStatus: "",
    ubaDjOpen: "",
    ubaDjClosed: "",
    spareItems: {
      bp: false,
      fp: false,
      sc: false,
      tsc: false,
      fourWw: false,
      fireExt: false,
      ptFuse: false,
      other: false,
      otherText: "",
    },
    locoTakeoverPlace: "",
    locoOfferPlace: LOCO_OFFER_PLACE_OPTIONS[0],
    locoOfferPlaceOther: "",
    engineOnTrainPlace: "",
    hogAttachedPlace: "",
    bpFpPlace: BP_FP_PLACE_OPTIONS[0],
    bpFpPlaceOther: "",
    yardSignal: "",
    privateDetailsEnabled: false,
    privateNumber: "",
    yardMasterName: "",
    pmName: "",
    placementPfNumber: "",
    madeOverChargeName: "",
    madeOverChargeHQ: "",
    lastModified: now,
  };
  for (const step of TIMELINE_STEPS) {
    entry[step.key] = null;
  }
  return entry;
}

export function newProfile() {
  return { id: "singleton", name: "Tripurari Sharma" };
}

export function kmFieldLabel(entry) {
  return entry.minorScheduleTIDate ? "KM since last TI" : "KM since last major schedule";
}
