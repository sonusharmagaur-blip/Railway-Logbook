import { DB } from "./db.js";
import { UICStatus, kmFieldLabel } from "./models.js";
import { el, formatDate, formatTime } from "./util.js";
import { APP_LOGO } from "./shareLogo.js";





const SCALE = 2;
const CARD_WIDTH = 540;
const CARD_HEIGHT = 675;
const FONT = 'Arial, sans-serif';
const paper = "#fffaf0";
const ink = "#3d1f1c";
const maroon = "#7b1f1b";
const gold = "#c99128";

function val(value, fallback = "—") {
  return value === undefined || value === null || value === "" ? fallback : String(value);
}
function time(value) { return value ? formatTime(value) : "—"; }
function date(value) { return value ? formatDate(value) : "—"; }
function longDate(value) {
  if (!value) return "—";
  const parsed = new Date(value + "T00:00:00");
  return Number.isNaN(parsed) ? value : parsed.toLocaleDateString("en-GB", { weekday:"long", day:"2-digit", month:"long", year:"numeric" });
}
function clean(value) { return String(value || "").trim(); }
function item(label, value) { return { label, value: val(value) }; }
function rowIf(items) { return items.filter(({ value }) => value !== "—"); }

function detailSections(entry, locomotives) {
  const loco = locomotives.find((item) => item.id === entry.locomotiveId);
  const locoNumber = entry.locomotiveNumberSnapshot || loco?.number;
  const locoType = entry.locomotiveType || loco?.locoClass;
  const locoShed = entry.locomotiveShed || loco?.shed;
  const isDot = entry.movementType === "arrival" && entry.isDotTrain;
  const offerPlace = entry.locoOfferPlace === "Other" ? entry.locoOfferPlaceOther : entry.locoOfferPlace;
  const trainRows = [
    item("Date", longDate(entry.date)),
    item("Movement", isDot ? "Departure Movement · DOT" : entry.movementType === "arrival" ? "Arrival Movement" : entry.movementType === "shed_shunting" ? "Shed Shunting" : "Departure Movement"),
    item(isDot ? "Arrival Train" : "Train Number", entry.trainNumber),
    item(isDot ? "Departure Train" : "Train Name", isDot ? entry.dotTrainNumber : entry.trainName),
    ...(isDot ? [item("Arrival Train Name", entry.trainName), item("Departure Train Name", entry.dotTrainName)] : []),
    item("Loco Number", locoNumber), item("Loco Type", locoType), item("Shed", locoShed),
    item("Working Cab", entry.cabSelection), item("PT Type", entry.locomotivePTType),
  ];
  const components = [
    item("SR Make", entry.srMake === "Other" ? entry.srMakeOther : entry.srMake),
    item("BUR Make", entry.burMake === "Other" ? entry.burMakeOther : entry.burMake),
    item("HOG Make", entry.hogMake === "Other" ? entry.hogMakeOther : entry.hogMake),
    item("HOG Status", entry.hogStatus),
    item("UIC", entry.uicStatus === UICStatus.MODIFIED ? `Modified · ${val(entry.uicCableOption)}` : entry.uicStatus),
    item("UIC Cable", entry.uicCableConnected),
    item("RTIS", entry.rtisFitted === "Not Fitted" ? "Not Fitted" : entry.rtisStatus),
    item("AC", entry.acFitted === "Not Fitted" ? "Not Fitted" : entry.acStatus),
    item("Kavach Make", entry.kavachMake), item("Kavach Status", entry.kavachStatus),
    item("Brake System", entry.brakeSystem), item("SPM Make", entry.spmMake === "Other" ? entry.spmMakeOther : entry.spmMake),
    item("MC Status", entry.mcStatus), item("UBA DJ Open", entry.ubaDjOpen), item("UBA DJ Closed", entry.ubaDjClosed),
  ];
  const schedules = [
    item("Major Schedule", `${val(entry.majorScheduleTypeCode)} · ${date(entry.majorScheduleDate)}`),
    item("Minor / TI Date", date(entry.minorScheduleTIDate)),
    item(kmFieldLabel(entry), entry.kmSinceLastSchedule),
    ...((entry.minorSchedules || []).map((schedule, index) => item(`Minor Schedule ${index + 1}`, `${val(schedule.type)} · ${date(schedule.date)} · ${val(schedule.km)} KM`))),
  ];
  const arrival = [
    item("Arrival Time", time(entry.arrivalTime)), item("Arrival At", entry.arrivalAt),
    item("HOG Time From", time(entry.arrivalHogFromTime)), item("HOG Time To", time(entry.arrivalHogToTime)),
    item("Take Over From", entry.arrivalTakeoverFrom), item("Take Over Time", time(entry.arrivalTakeoverTime)),
    item("Arrival Departure Time", time(entry.arrivalDepartureTime)), item("Arrival Signal", entry.arrivalSignalNumber),
    item("Placed Time", time(entry.arrivalPlacedTime)), item("Place", entry.arrivalPlace),
    item("Detach Time", time(entry.arrivalDetachTime)), item("PM Name", entry.arrivalPmName),
    item("Dep Yard Time", time(entry.arrivalYardDepartureTime)), item("Dep Yard Signal", entry.arrivalYardSignal),
    item("Shed Arrival Time", time(entry.arrivalShedArrivalTime)), item("Line No.", entry.arrivalLineNumber),
  ];
  const departure = [
    item("Loco Takeover", time(entry.locoTakeoverTime)), item("Takeover Place", entry.locoTakeoverPlace), item("Checked Upto", time(entry.locoCheckedUptoTime)),
    item("Loco Offer", time(entry.locoOfferTime)), item("Offer Place", offerPlace), item("Offer Dep Time", time(entry.locoOfferDepartureTime)),
    item("Engine On Train", time(entry.engineOnTrainTime)), item("EOT Place", entry.engineOnTrainPlace),
    item("HOG Attached From", time(entry.hogAttachedTime)), item("HOG Attached To", time(entry.hogAttachedToTime)), item("HOG Place", entry.hogAttachedPlace),
    item("BP/FP Buildup", time(entry.bpFpTime)), item("BP/FP Place", entry.bpFpPlace === "Other" ? entry.bpFpPlaceOther : entry.bpFpPlace),
    item("Yard Dep", time(entry.departureTime)), item("Yard Signal", entry.yardSignal),
    item("Placement Time", time(entry.placementTime)), item("PF No.", entry.placementPfNumber),
    item("Continuity Time", time(entry.continuityTime)), item("BPC Time", time(entry.bpcTime)),
    item("Made Over Charge", entry.madeOverChargeName), item("HQ", entry.madeOverChargeHQ), item("Made Over Time", time(entry.madeOverChargeTime)),
    item("Final Dep Time", time(entry.finalDepartureTime)),
  ];
  const officials = (entry.officialDetails || []).map((official, index) => item(`Official ${index + 1}`, `${val(official.designation)} · ${val(official.name)}`));
  const additional = (entry.additionalLocomotives || []).map((loco, index) => item(`Additional Loco ${index + 1}`, `${val(loco.locomotiveNumberSnapshot)} · ${val(loco.locomotiveType)} · ${val(loco.locomotiveShed)} · ${val(loco.cabSelection)} · ${val(loco.ptType)}`));
  const extra = [
    item("Repair List", entry.repairList), item("Remarks", entry.remarks),
    ...officials, ...additional,
    ...Object.entries(entry.spareItems || {}).filter(([k,v]) => k !== "otherText" && v === true).map(([k]) => item("Spare Item", ({bp:"BP",fp:"FP",sc:"SC",tsc:"TSC",fourWw:"4WW",fireExt:"2+2 FIRE EXTINGUISHERS",ptFuse:"2 PT FUSE",other:entry.spareItems.otherText || "OTHER"})[k] || k)),
    ...(entry.privateNumberDetails || []).flatMap((p,i) => Object.entries(p).filter(([k,v]) => !["id","isComplete"].includes(k) && v !== "" && v != null).map(([k,v]) => item("PN " + (i+1) + " · " + k.replace(/([A-Z])/g," $1"), /Time$/.test(k) ? time(v) : v))),
    ...["privateNumber","yardMasterName","pmName"].filter(k=>entry[k]).map(k=>item(k.replace(/([A-Z])/g," $1"),entry[k])),
  ];
  const sections = [
    { title:"Movement Identity", rows: trainRows },
    { title:"Loco Components", rows: components },
    { title:"Schedule Details", rows: schedules },
    ...(entry.movementType === "arrival" ? [{ title:"Arrival Details", rows: arrival }] : []),
    ...((entry.movementType === "departure" || isDot) ? [{ title:"Departure Details", rows: departure }] : []),
    ...(entry.movementType === "shed_shunting" ? [{title:"Shed Shunting",rows:[item("TOC Time",time(entry.shuntingTocTime)),item("TOC Place",entry.shuntingTocPlace),item("Movement Upto",entry.shuntingMovementUpto),item("Stable Time",time(entry.shuntingStableTime)),item("Stable Place",entry.shuntingStablePlace),item("CC Name",entry.shuntingCCName)]}] : []),
    { title:"Other Details", rows: extra },
  ];
  return sections.map(({ title, rows }) => ({ title, rows: rowIf(rows) })).filter(({ rows }) => rows.length);
}

function rounded(ctx, x, y, width, height, radius) {
  ctx.beginPath(); ctx.moveTo(x + radius, y); ctx.arcTo(x + width, y, x + width, y + height, radius); ctx.arcTo(x + width, y + height, x, y + height, radius); ctx.arcTo(x, y + height, x, y, radius); ctx.closePath();
}
function wrap(ctx, text, width) {
  const words = String(text).split(/\s+/); const lines = []; let line = "";
  for (let word of words) {
    while (ctx.measureText(word).width > width) {
      if (line) { lines.push(line); line = ""; }
      let count = 1;
      while (count < word.length && ctx.measureText(word.slice(0,count+1)).width <= width) count++;
      lines.push(word.slice(0,count)); word = word.slice(count);
    }
    const test = line ? line + " " + word : word;
    if (ctx.measureText(test).width > width && line) { lines.push(line); line = word; } else line = test;
  }
  if (line) lines.push(line); return lines;
}
function pageHeight(groups, ctx) {
  ctx.font = `700 11px ${FONT}`;
  return Math.max(CARD_HEIGHT, 101 + groups.reduce((sum,g)=>sum+34+g.rows.reduce((n,f)=>n+Math.max(22,wrap(ctx,f.value,320).length*13+5,wrap(ctx,f.label.toUpperCase(),120).length*11+5),0),0)+55);
}
function paginate(sections) { return [sections]; }
function drawLogoWatermark(ctx, logo) {
  if (!logo) return;
  ctx.save(); ctx.globalAlpha = .10;
  ctx.drawImage(logo, 118, ctx.canvas.height / SCALE / 2 - 152, 304, 304); ctx.restore();
}
function drawPage(canvas, groups, entry, profile, logo, pageNumber, totalPages) {
  const ctx = canvas.getContext("2d");
  const height = pageHeight(groups, ctx); canvas.width = CARD_WIDTH * SCALE; canvas.height = height * SCALE; ctx.scale(SCALE, SCALE);
  ctx.fillStyle = paper; rounded(ctx, 0, 0, CARD_WIDTH, height, 22); ctx.fill();
  ctx.fillStyle = "#f7ecd4"; ctx.fillRect(0, 0, 32, height);
  ctx.strokeStyle = "#7c6650"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(31, 0); ctx.lineTo(31, height); ctx.stroke();
  for (let y = 18; y < height; y += 36) { ctx.fillStyle = "#f9fbfb"; ctx.beginPath(); ctx.arc(31, y, 6, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = "#ae9b85"; ctx.stroke(); }
  drawLogoWatermark(ctx, logo);
  ctx.fillStyle = maroon; ctx.fillRect(49, 26, 7, 54);
  ctx.fillStyle = ink; ctx.font = `800 20px ${FONT}`; ctx.fillText(entry.movementType === "arrival" && entry.isDotTrain ? "DOT DEPARTURE RECORD" : entry.movementType === "arrival" ? "ARRIVAL MOVEMENT RECORD" : entry.movementType === "shed_shunting" ? "SHED SHUNTING RECORD" : "DEPARTURE MOVEMENT RECORD", 68, 49);
  ctx.fillStyle = "#755a48"; ctx.font = `700 10px ${FONT}`; ctx.fillText(longDate(entry.date), 68, 70);
  ctx.fillStyle = "#755a48"; ctx.textAlign = "right"; ctx.fillText("DUTY DIARY", 512, 70); ctx.textAlign = "left";
  let y = 101;
  for (const group of groups) {
    ctx.fillStyle = maroon; ctx.font = `800 12px ${FONT}`; ctx.fillText(group.title.toUpperCase(), 52, y); y += 11;
    ctx.strokeStyle = "#d3c2a7"; ctx.lineWidth = .8; ctx.beginPath(); ctx.moveTo(52, y); ctx.lineTo(510, y); ctx.stroke(); y += 13;
    for (const field of group.rows) {
      ctx.fillStyle = "#6d5447"; ctx.font = `700 9px ${FONT}`; const labels = wrap(ctx, field.label.toUpperCase(), 120); labels.forEach((line,index)=>ctx.fillText(line,52,y+index*11));
      ctx.fillStyle = ink; ctx.font = `700 11px ${FONT}`;
      const lines = wrap(ctx, field.value, 320);
      lines.forEach((line, index) => ctx.fillText(line, 182, y + index * 13));
      y += Math.max(22, lines.length * 13 + 5, labels.length * 11 + 5);
    }
    y += 10;
  }
  ctx.fillStyle = "rgba(123,31,27,.92)"; ctx.fillRect(44, height - 48, 468, 26);
  ctx.fillStyle = "#fff8ef"; ctx.font = `700 9px ${FONT}`; ctx.fillText("RAILWAY LOGBOOK", 55, height - 31);
  ctx.textAlign = "right"; ctx.fillText(`LPS NAME · ${clean(profile?.name) || "—"}`, 501, height - 31); ctx.textAlign = "left";
}
function caption(entry) {
  if (entry.movementType === "arrival" && entry.isDotTrain) return `ARRIVAL TN: ${val(entry.trainNumber)}\nDEP TRAIN NUMBER: ${val(entry.dotTrainNumber)}`;
  return entry.movementType === "arrival" ? `ARRIVAL TN: ${val(entry.trainNumber)}` : `DEP TRAIN NUMBER: ${val(entry.trainNumber)}`;
}
function logoImage() { return new Promise((resolve) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = () => resolve(null); image.src = APP_LOGO; }); }

export async function openExportCard(entry, locomotives, options = {}) {
  const profile = await DB.get("profile", "singleton"); const logo = await logoImage();
  const pages = paginate(detailSections(entry, locomotives)); const canvases = pages.map(() => el("canvas"));
  canvases.forEach((canvas, index) => drawPage(canvas, pages[index], entry, profile, logo, index + 1, canvases.length));
  const overlay = el("div", { class:"overlay" }); const preview = el("div", { class:"duty-card-canvas-wrap", style:"display:grid;gap:12px;" }, canvases);
  const text = caption(entry);
  const captionArea = el("textarea", { readonly:true, rows:2, "aria-label":"WhatsApp caption", style:"width:100%;box-sizing:border-box;resize:none;" }); captionArea.value = text;
  const copy = el("button", { class:"secondary-btn", type:"button", onclick: async () => { try { await navigator.clipboard.writeText(text); copy.textContent = "Caption copied"; } catch { captionArea.focus(); captionArea.select(); copy.textContent = "Copy the selected caption"; } } }, "Copy Caption");
  const files = await Promise.all(canvases.map((canvas, index) => new Promise((resolve,reject) => canvas.toBlob((blob) => blob ? resolve(new File([blob], `railway-logbook-${entry.date || "record"}.png`, {type:"image/png"})) : reject(new Error("Image could not be created")), "image/png"))));
  const share = el("button", { class:"primary-btn", type:"button", onclick: async () => {
    if (navigator.share && navigator.canShare && navigator.canShare({ files })) { try { await navigator.share({ files, title:"Railway Logbook", text }); return; } catch (error) { if (error.name === "AbortError") return; } }
    files.forEach((file) => { const url = URL.createObjectURL(file); const link = el("a",{href:url,download:file.name}); document.body.appendChild(link); link.click(); link.remove(); setTimeout(()=>URL.revokeObjectURL(url),5000); });
  } }, "Share Diary Image");
  const done = el("button", { class:"final-done-btn", type:"button", onclick: async () => { done.disabled=true; try { if(typeof options.onDone === "function") await options.onDone(); overlay.remove(); } finally { done.disabled=false; } } }, options.doneLabel || "Done");
  overlay.appendChild(el("div",{class:"overlay-card share-card-dialog"},[el("h2",{},"Share Duty Diary"),el("p",{},"Complete movement record · one long spiral-diary image"),preview,captionArea,copy,share,done])); document.body.appendChild(overlay);
}
