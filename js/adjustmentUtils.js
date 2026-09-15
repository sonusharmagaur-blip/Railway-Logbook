export function normalizedText(value) {
  return String(value ?? "").trim().replace(/\s+/g," ").toUpperCase();
}
export function adjustmentKey(record) {
  const type = record.adjustmentType === "Other" ? record.adjustmentTypeOther || "Other" : record.adjustmentType;
  return JSON.stringify([record.date,record.staffName,type,record.originalPosition,record.adjustedPosition,record.remark].map(normalizedText));
}
export function uniqueAdjustments(records) {
  const seen = new Set();
  return [...records].sort((a,b)=>(b.lastModified || b.createdAt || "").localeCompare(a.lastModified || a.createdAt || "")).filter(record=>{
    const key=adjustmentKey(record);
    if(seen.has(key))return false;
    seen.add(key);return true;
  });
}
export function recentAdjustmentRange(now=new Date()) {
  const end = new Date(now.getFullYear(),now.getMonth(),now.getDate());
  const start = new Date(now.getFullYear(),now.getMonth()-3,1);
  start.setDate(Math.min(now.getDate(),new Date(start.getFullYear(),start.getMonth()+1,0).getDate()));
  const iso = d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");
  return {from:iso(start),to:iso(end)};
}

