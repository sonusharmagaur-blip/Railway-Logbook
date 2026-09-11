import { DB } from "./db.js";
import { UICStatus, kmFieldLabel, uicDisplayStatus } from "./models.js";
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
function atPlace(value, place) { return time(value) + (clean(place) ? " @ " + clean(place) : ""); }
function volts(value) { return clean(value) ? clean(value).replace(/\s*(volts|v)$/i, "") + " Volts" : "—"; }
function spareSummary(entry) {
  const items = entry.spareItems || {};
  const labels = {bp:"BP",fp:"FP",sc:"SC",tsc:"TSC",fourWw:"4WW",fireExt:"2+2 Fire Ext.",ptFuse:"2 PT-Fuse"};
  const selected = Object.entries(labels).filter(([key]) => items[key] === true).map(([,label]) => label);
  if (items.other && clean(items.otherText)) selected.push(clean(items.otherText));
  return selected.join(", ");
}
function rowIf(items) { return items.filter(({ value, always, pairKey }) => always || value !== "—" || pairKey && items.some(f => f.pairKey === pairKey && f.value !== "—")); }

function majorScheduleOverdue(value, movementDate) {
  const day = (input) => {
    const parts = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(String(input || ""));
    if (!parts) return NaN;
    const stamp = Date.UTC(Number(parts[1]), Number(parts[2])-1, Number(parts[3]));
    return new Date(stamp).toISOString().slice(0,10) === input ? stamp : NaN;
  };
  return (day(movementDate)-day(value))/86400000 > 90;
}
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
    item("UIC Status", uicDisplayStatus(entry)),
    item("RTIS", entry.rtisFitted === "Not Fitted" ? "Not Fitted" : entry.rtisStatus),
    item("AC", entry.acFitted === "Not Fitted" ? "Not Fitted" : entry.acStatus),
    item("Kavach Make", entry.kavachMake), item("Kavach Status", entry.kavachStatus),
    item("Brake System", entry.brakeSystem), item("SPM Make", entry.spmMake === "Other" ? entry.spmMakeOther : entry.spmMake),
    item("MC %", entry.mcStatus), item("UBA DJ Open", volts(entry.ubaDjOpen)), item("UBA DJ Closed", volts(entry.ubaDjClosed)),
    {...item("Spare Items", spareSummary(entry)), fullWidth:true},
  ];
  for (const field of components) {
    if (["SPM Make", "MC %"].includes(field.label)) field.pairKey = "spm";
    if (["UBA DJ Open", "UBA DJ Closed"].includes(field.label)) field.pairKey = "uba";
  }
  const minorEntries = (entry.minorSchedules || []).filter(m => m.date || m.km !== null && m.km !== undefined);
  if (!minorEntries.length && (entry.minorScheduleTIDate || entry.kmSinceLastSchedule != null)) {
    minorEntries.push({type:"TI",date:entry.minorScheduleTIDate,km:entry.kmSinceLastSchedule});
  }
  const minorField = (schedule,index) => ({ ...item(
    "Minor Schedule" + (index ? " " + (index+1) : ""),
    `${val(schedule.type)} · ${date(schedule.date)}${schedule.km != null && schedule.km !== "" ? " · KM-" + schedule.km : ""}`
  ), alert: schedule.km !== "" && schedule.km != null && Number(schedule.km) > 4500 });
  const schedules = [
    {...item("Major Schedule", `${val(entry.majorScheduleTypeCode)} · ${date(entry.majorScheduleDate)}${majorScheduleOverdue(entry.majorScheduleDate, entry.date) ? " (OVERDUE)" : ""}`), alert:majorScheduleOverdue(entry.majorScheduleDate, entry.date)},
    ...(minorEntries.length ? minorEntries.map(minorField) : [item("Minor Schedule", "—")]),
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
    item("HOG Attached From", atPlace(entry.hogAttachedTime, entry.hogAttachedPlace)), item("HOG Attached To", atPlace(entry.hogAttachedToTime, entry.hogAttachedPlace)),
    item("BP/FP Buildup", atPlace(entry.bpFpTime, entry.bpFpPlace === "Other" ? entry.bpFpPlaceOther : entry.bpFpPlace)),
    item("Yard Dep", time(entry.departureTime)), item("Yard Signal", entry.yardSignal),
    item("Placement Time", time(entry.placementTime)), item("PF No.", entry.placementPfNumber),
    {...item("Continuity Time", time(entry.continuityTime)), pairKey:"continuity", always:true}, {...item("BPC Time", time(entry.bpcTime)), pairKey:"continuity", always:true},
    item("Made Over Charge", entry.madeOverChargeName), item("HQ", entry.madeOverChargeHQ), item("Made Over Time", time(entry.madeOverChargeTime)),
    {...item("Departure Time", time(entry.finalDepartureTime)), always:true},
  ];
  const officials = (entry.officialDetails || []).map((official, index) => item(`Official ${index + 1}`, `${val(official.designation)} · ${val(official.name)}`));
  const additional = (entry.additionalLocomotives || []).map((loco, index) => item(`Additional Loco ${index + 1}`, `${val(loco.locomotiveNumberSnapshot)} · ${val(loco.locomotiveType)} · ${val(loco.locomotiveShed)} · ${val(loco.cabSelection)} · ${val(loco.ptType)}`));
  const extra = [
    item("Repair List", entry.repairList), item("Remarks", entry.remarks),
    ...additional,
  ];
  const privateNumbers = [
    ...(entry.privateNumberDetails || []).flatMap((p,i) => Object.entries(p).filter(([k,v]) => !["id","isComplete"].includes(k) && v !== "" && v != null).map(([k,v]) => item("PN " + (i+1) + " · " + k.replace(/([A-Z])/g," $1"), /Time$/.test(k) ? time(v) : v))),
    ...["privateNumber","yardMasterName","pmName"].filter(k=>entry[k]).map(k=>item(k.replace(/([A-Z])/g," $1"),entry[k])),
  ];
  if (entry.movementType === "departure" || isDot) {
    trainRows.forEach(f => {
      if (["Train Number","Train Name","Arrival Train","Departure Train","Arrival Train Name","Departure Train Name"].includes(f.label)) f.inHeader = true;
    });
  }
  [...extra, ...privateNumbers].forEach(f => { f.fullWidth = true; });
  const sections = [
    { title:"Movement Identity", rows: trainRows },
    { title:"Loco Components", rows: components },
    { title:"Schedule Details", rows: schedules },
    ...(entry.movementType === "arrival" ? [{ title:"Arrival Details", rows: arrival }] : []),
    ...((entry.movementType === "departure" || isDot) ? [{ title:"Departure Details", rows: departure }] : []),
    ...(entry.movementType === "shed_shunting" ? [{title:"Shed Shunting",rows:[item("TOC Time",time(entry.shuntingTocTime)),item("TOC Place",entry.shuntingTocPlace),item("Movement Upto",entry.shuntingMovementUpto),item("Stable Time",time(entry.shuntingStableTime)),item("Stable Place",entry.shuntingStablePlace),item("CC Name",entry.shuntingCCName)]}] : []),
    { title:"Other Details", rows: extra },
    { title:"Private Number Details", rows: privateNumbers },
    { title:"Officials", rows: officials },
  ];
  return sections.map(({ title, rows }) => ({ title, rows: rowIf(rows) })).filter(({ rows }) => rows.length);
}

function rounded(ctx, x, y, width, height, radius) {
  ctx.beginPath(); ctx.moveTo(x + radius, y); ctx.arcTo(x + width, y, x + width, y + height, radius); ctx.arcTo(x + width, y + height, x, y + height, radius); ctx.arcTo(x, y + height, x, y, radius); ctx.closePath();
}
function wrap(ctx, text, width) {
  if (String(text).includes("\n")) return String(text).split("\n").flatMap(line => wrap(ctx,line,width));
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
function paginate(sections) { return [sections]; }
function prepareDiary(ctx, groups) {
  return groups.map(group => {
    const fields = group.rows.filter(f => !f.inHeader && (group.title !== "Movement Identity" || !["Date","Movement","Loco Number","Loco Type","Shed"].includes(f.label)));
    const rows = [];
    const pairs = [];
    let pending = [];
    for (const f of fields) {
      if (f.fullWidth) {
        if (pending.length) { pairs.push(pending); pending = []; }
        pairs.push([f]); continue;
      }
      if (pending.length && (pending[0].pairKey || f.pairKey) && pending[0].pairKey !== f.pairKey) {
        pairs.push(pending); pending = [];
      }
      pending.push(f);
      if (pending.length === 2) { pairs.push(pending); pending = []; }
    }
    if (pending.length) pairs.push(pending);
    for (const fieldsPair of pairs) {
      const pair = fieldsPair.map(f => {
        const stacked = group.title === "Schedule Details";
        ctx.font = `700 8.5px ${FONT}`;
        const labels = wrap(ctx, f.label.toUpperCase(), stacked ? 217 : 94);
        ctx.font = `700 11px ${FONT}`;
        const values = stacked ? [f.value] : wrap(ctx, f.value, f.fullWidth ? 362 : 117);
        return { labels, values, stacked, alert:f.alert, fullWidth:f.fullWidth };
      });
      rows.push({pair, height:Math.max(25,...pair.map(f=>f.stacked ? 38 : Math.max(f.labels.length*10,f.values.length*13)+9))});
    }
    return {title:group.title,rows};
  }).filter(g=>g.rows.length);
}
function drawPage(canvas, groups, entry, profile, logo) {
  const ctx = canvas.getContext("2d");
  const layout = prepareDiary(ctx, groups);
  const headerTrains = entry.movementType === "departure" ? [`${val(entry.trainNumber)} · ${val(entry.trainName)}`] :
    entry.movementType === "arrival" && entry.isDotTrain ? [`ARRIVAL: ${val(entry.trainNumber)} · ${val(entry.trainName)}`, `DEP: ${val(entry.dotTrainNumber)} · ${val(entry.dotTrainName)}`] : [];
  ctx.font = `800 14px ${FONT}`;
  const trainLines = headerTrains.flatMap(text => wrap(ctx,text,462));
  const trainHeight = trainLines.length ? trainLines.length*18+12 : 0;
  const height = Math.max(CARD_HEIGHT,180 + trainHeight + layout.reduce((n,g)=>n+(g.title === "Movement Identity" ? 7 : 30)+g.rows.reduce((v,r)=>v+r.height,0),0)+52);
  canvas.width=CARD_WIDTH*SCALE; canvas.height=Math.ceil(height*SCALE); ctx.scale(SCALE,SCALE);
  ctx.fillStyle=paper; rounded(ctx,0,0,CARD_WIDTH,height,22); ctx.fill();
  ctx.fillStyle="#f7ecd4"; ctx.fillRect(0,0,32,height);
  ctx.strokeStyle="#cbb79b"; ctx.lineWidth=1; ctx.beginPath();ctx.moveTo(31,0);ctx.lineTo(31,height);ctx.stroke();
  for(let y=20;y<height;y+=36) {
    ctx.fillStyle="#fff";ctx.beginPath();ctx.arc(28,y,5,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle="#8d7862";ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(22,y,12,5,0,0,Math.PI*2);ctx.stroke();
  }
  if(logo) {ctx.save();ctx.globalAlpha=.08;ctx.drawImage(logo,118,height/2-152,304,304);ctx.restore();}
  ctx.fillStyle=maroon;ctx.fillRect(49,24,6,45);
  ctx.fillStyle=ink;ctx.font=`800 19px ${FONT}`;
  const title=entry.movementType==="arrival"&&entry.isDotTrain?"DOT DEPARTURE RECORD":entry.movementType==="arrival"?"ARRIVAL MOVEMENT RECORD":entry.movementType==="shed_shunting"?"SHED SHUNTING RECORD":"DEPARTURE MOVEMENT RECORD";
  ctx.fillText(title,66,43,444);ctx.font=`700 10px ${FONT}`;ctx.fillStyle="#755a48";ctx.fillText(longDate(entry.date),66,64);
  // Prominent locomotive identity; use resolved values from the existing field builder.
  const identity=groups.find(g=>g.title==="Movement Identity")?.rows||[];
  const field=name=>identity.find(f=>f.label===name)?.value||"—";
  ctx.fillStyle=ink;ctx.font=`800 14px ${FONT}`;
  trainLines.forEach((line,i)=>ctx.fillText(line,50,89+i*18,462));
  ctx.fillStyle=maroon;rounded(ctx,48,82+trainHeight,465,76,10);ctx.fill();
  const blocks=[["LOCO NUMBER",field("Loco Number")],["TYPE",field("Loco Type")],["SHED",field("Shed")]];
  blocks.forEach(([label,value],i)=>{
    const x=62+i*153;
    ctx.fillStyle="#ffdc98";ctx.font=`700 9px ${FONT}`;ctx.fillText(label,x,102+trainHeight);
    ctx.fillStyle="#fffaf0";ctx.font=`800 23px ${FONT}`;ctx.fillText(value,x,137+trainHeight,136);
  });
  let y=180+trainHeight;
  for(const group of layout) {
    if (group.title !== "Movement Identity") {
    ctx.fillStyle=maroon;ctx.font=`800 11px ${FONT}`;ctx.fillText(group.title.toUpperCase(),50,y);
    ctx.strokeStyle="#cbb79b";ctx.lineWidth=.7;ctx.beginPath();ctx.moveTo(50,y+7);ctx.lineTo(512,y+7);ctx.stroke();y+=23;
    }
    for(const row of group.rows) {
      row.pair.forEach((f,index)=>{
        const x=50+index*236;
        ctx.fillStyle=group.title === "Movement Identity" ? ink : "#71594b";ctx.font=`800 8.5px ${FONT}`;f.labels.forEach((line,i)=>ctx.fillText(line,x,y+i*10));
        ctx.fillStyle=f.alert ? "#c01620" : ink;ctx.font=`700 11px ${FONT}`;f.values.forEach((line,i)=>ctx.fillText(line,f.stacked ? x : x+100,y+(f.stacked ? 16 : 0)+i*13,f.stacked ? 217 : f.fullWidth ? 362 : 117));
      });
      ctx.strokeStyle="rgba(170,143,109,.20)";ctx.beginPath();ctx.moveTo(50,y+row.height-11);ctx.lineTo(512,y+row.height-11);ctx.stroke();
      y+=row.height;
    }
    y+=7;
  }
  ctx.fillStyle=maroon;ctx.fillRect(44,height-39,468,25);
  ctx.fillStyle="#fff8ef";ctx.font=`700 9px ${FONT}`;ctx.fillText("RAILWAY LOGBOOK",54,height-23);
  ctx.textAlign="right";ctx.fillText(`LPS · ${clean(profile?.name)||"—"}`,502,height-23,320);ctx.textAlign="left";
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
  overlay.appendChild(el("div",{class:"overlay-card share-card-dialog"},[el("h2",{},"Share Duty Diary"),el("p",{},"Complete movement record · compact single-image duty diary"),preview,captionArea,copy,share,done])); document.body.appendChild(overlay);
}
