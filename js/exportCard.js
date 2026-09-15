import { DB } from "./db.js";
import { UICStatus, kmFieldLabel, uicDisplayStatus } from "./models.js";
import { el, formatDate, formatTime } from "./util.js";





const SCALE = 2;
const CARD_WIDTH = 540;
const CARD_HEIGHT = 675;
const FONT = '"RailwayDiaryHand", "Segoe Print", cursive';
const paper = "#fffaf0";
const ink = "#3d1f1c";
const maroon = "#7b1f1b";
const gold = "#c99128";

function val(value, fallback = "—") {
  return value === undefined || value === null || String(value).trim() === "" ? fallback : String(value).trim();
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
function joinDetails(values) { return values.filter(v => v != null && String(v).trim() && v !== "—").join(" · "); }
function atPlace(value, place) { return (value ? time(value) : "") + (clean(place) ? (value ? " @ " : "@ ") + clean(place) : ""); }
function volts(value) { return clean(value) ? clean(value).replace(/\s*(volts|v)$/i, "") + " Volts" : "—"; }
function spareSummary(entry) {
  const items = entry.spareItems || {};
  const labels = {bp:"BP",fp:"FP",sc:"SC",tsc:"TSC",fourWw:"4WW",fireExt:"2+2 Fire Ext.",ptFuse:"2 PT-Fuse"};
  const selected = Object.entries(labels).filter(([key]) => items[key] === true).map(([,label]) => label);
  if (items.other && clean(items.otherText)) selected.push(clean(items.otherText));
  return selected.join(", ");
}
function rowIf(items) { return items.filter(({ value }) => value !== "—" && clean(value)); }

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
  const locoNumber = entry.locomotiveNumberSnapshot ?? loco?.number;
  const locoType = entry.locomotiveType ?? loco?.locoClass;
  const locoShed = entry.locomotiveShed ?? loco?.shed;
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
    item("SR/BUR Make", [entry.srMake === "Other" ? entry.srMakeOther : entry.srMake, entry.burMake === "Other" ? entry.burMakeOther : entry.burMake].filter(v=>clean(v)).join(" / ")),
    item("Brake System", entry.brakeSystem),
    item("HOG Make", entry.hogMake === "Other" ? entry.hogMakeOther : entry.hogMake),
    item("HOG Status", entry.hogStatus),
    item("UIC Status", entry.uicStatus ? uicDisplayStatus(entry) : ""),
    item("RTIS", entry.rtisFitted === "Not Fitted" ? "Not Fitted" : entry.rtisStatus || entry.rtisFitted),
    item("AC", entry.acFitted === "Not Fitted" ? "Not Fitted" : entry.acStatus || entry.acFitted),
    item("Kavach Make", entry.kavachMake), item("Kavach Status", entry.kavachStatus),
    item("SPM Make", entry.spmMake === "Other" ? entry.spmMakeOther : entry.spmMake),
    item("MC %", entry.mcStatus), item("UBA DJ Open", volts(entry.ubaDjOpen)), item("UBA DJ Closed", volts(entry.ubaDjClosed)),
    {...item("Spare Items", spareSummary(entry)), fullWidth:true},
  ];
  for (const field of components) {
    if (["SR/BUR Make", "Brake System"].includes(field.label)) field.pairKey = "make-brake";
    if (["Kavach Make", "Kavach Status"].includes(field.label)) field.pairKey = "kavach";
    if (["SPM Make", "MC %"].includes(field.label)) field.pairKey = "spm";
    if (["UBA DJ Open", "UBA DJ Closed"].includes(field.label)) field.pairKey = "uba";
  }
  const minorEntries = (entry.minorSchedules || []).filter(m => m.type || m.date || m.km !== "" && m.km !== null && m.km !== undefined);
  if (!minorEntries.length && (entry.minorScheduleTIDate || entry.kmSinceLastSchedule != null)) {
    minorEntries.push({type:"TI",date:entry.minorScheduleTIDate,km:entry.kmSinceLastSchedule});
  }
  const minorField = (schedule,index) => ({ ...item(
    "Minor Schedule" + (index ? " " + (index+1) : ""),
    joinDetails([schedule.type, date(schedule.date), schedule.km != null && schedule.km !== "" ? "KM-" + schedule.km : ""])
  ), alert: schedule.km !== "" && schedule.km != null && Number(schedule.km) > 4500 });
  const schedules = [
    {...item("Major Schedule", joinDetails([entry.majorScheduleTypeCode, date(entry.majorScheduleDate)]) + (majorScheduleOverdue(entry.majorScheduleDate, entry.date) ? " (OVERDUE)" : "")), alert:majorScheduleOverdue(entry.majorScheduleDate, entry.date)},
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
    {...item("Loco Takeover / Place", atPlace(entry.locoTakeoverTime, entry.locoTakeoverPlace)), pairKey:"takeover-checked"}, {...item("Checked Upto Time", time(entry.locoCheckedUptoTime)), pairKey:"takeover-checked"},
    {...item("Loco Offer", [atPlace(entry.locoOfferTime, offerPlace), entry.locoOfferDepartureTime ? "DEP " + time(entry.locoOfferDepartureTime) : ""].filter(Boolean).join(" ")), fullWidth:true},
    {...item("Engine On Train", atPlace(entry.engineOnTrainTime, entry.engineOnTrainPlace)), pairKey:"eot-bpfp"},
    {...item("BP/FP Buildup", atPlace(entry.bpFpTime, entry.bpFpPlace === "Other" ? entry.bpFpPlaceOther : entry.bpFpPlace)), pairKey:"eot-bpfp"},
    item("HOG Attached From", entry.hogAttachedTime ? atPlace(entry.hogAttachedTime, entry.hogAttachedPlace) : ""),
    item("HOG Attached To", entry.hogAttachedToTime ? atPlace(entry.hogAttachedToTime, entry.hogAttachedPlace) : ""),
    ...(!entry.hogAttachedTime && !entry.hogAttachedToTime ? [item("HOG Place",entry.hogAttachedPlace)] : []),
    item("Yard Dep", time(entry.departureTime)), item("Yard Signal", entry.yardSignal),
    item("Placement Time", time(entry.placementTime)), item("PF No.", entry.placementPfNumber),
    {...item("Continuity Time", time(entry.continuityTime)), pairKey:"continuity", always:true}, {...item("BPC Time", time(entry.bpcTime)), pairKey:"continuity", always:true},
    item("Made Over Charge", entry.madeOverChargeName), item("HQ", entry.madeOverChargeHQ), item("Made Over Time", time(entry.madeOverChargeTime)),
    {...item("Departure Time", time(entry.finalDepartureTime)), always:true},
  ];
  const officials = (entry.officialDetails || []).filter(official => clean(official.name)).map((official, index) => item(`Official ${index + 1}`, joinDetails([official.designation, official.name])));
  const additional = (entry.additionalLocomotives || []).map((loco, index) => item(`Additional Loco ${index + 1}`, joinDetails([loco.locomotiveNumberSnapshot,loco.locomotiveType,loco.locomotiveShed,loco.cabSelection,loco.ptType])));
  const extra = [
    item("Repair List", entry.repairList), item("Remarks", entry.remarks),
    ...additional,
  ];
  const pnRecords = (entry.privateNumberDetails || []).filter(p => Object.entries(p).some(([k,v]) => !["id","isComplete"].includes(k) && v !== "" && v != null));
  if (!pnRecords.length && (entry.privateNumber || entry.yardMasterName || entry.pmName)) {
    pnRecords.push({signalNumber:entry.privateNumber,yardMasterName:entry.yardMasterName,pmName:entry.pmName});
  }
  const pnLabels = {signalNumber:"No.",fromLine:"From",toLine:"To",departureTime:"Dep",yardMasterName:"YM",pmName:"PM"};
  const privateNumbers = pnRecords.map((p,i) => item("PN " + (i+1),
    Object.entries(p).filter(([k,v]) => !["id","isComplete"].includes(k) && v !== "" && v != null)
      .map(([k,v]) => (pnLabels[k] || k) + ": " + (/Time$/.test(k) ? time(v) : v)).join(" · ")));
  if (entry.movementType === "departure" || entry.movementType === "arrival") {
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
  ctx.beginPath(); ctx.moveTo(x + radius, y); ctx.arcTo(x + width, y, x + width, y + height, radius); ctx.arcTo(x + width, y + height, x, y + height, radius); ctx.arcTo(x, y + height, x, y, radius); ctx.arcTo(x, y, x + width, y, radius); ctx.closePath();
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

function timelineFor(group, entry) {
  if (group.title === "Departure Details" && entry.locoTakeoverTime && entry.finalDepartureTime) return {
    start:time(entry.locoTakeoverTime), end:time(entry.finalDepartureTime),
    startLabel:"LOCO TAKEOVER", endLabel:"DEPARTURE", keys:[],
  };
  if (group.title === "Arrival Details" && entry.arrivalTime && entry.arrivalShedArrivalTime) return {
    start:time(entry.arrivalTime), end:time(entry.arrivalShedArrivalTime),
    startLabel:"ARRIVAL", endLabel:"SHED ARRIVAL", keys:["Arrival Time","Shed Arrival Time"],
  };
  return null;
}
function prepareDiary(ctx, groups, entry = {}) {
  return groups.map(group => {
    const timeline = timelineFor(group,entry);
    const fields = group.rows.filter(f => !f.inHeader && !timeline?.keys.includes(f.label) && (group.title !== "Movement Identity" || !["Date","Movement","Loco Number","Loco Type","Shed"].includes(f.label)));
    const pairs = []; let pending=[];
    for (const f of fields) {
      if (f.fullWidth) {if(pending.length)pairs.push(pending);pending=[];pairs.push([f]);continue;}
      if (pending.length && (pending[0].pairKey || f.pairKey) && pending[0].pairKey !== f.pairKey) {pairs.push(pending);pending=[];}
      pending.push(f);
      if(pending.length===2){pairs.push(pending);pending=[];}
    }
    if(pending.length)pairs.push(pending);
    const rows=pairs.map(pairFields=>{
      const pair=pairFields.map(f=>{
        const stacked=group.title==="Schedule Details";
        ctx.font="700 8.5px Arial";
        const labels=wrap(ctx,f.label.toUpperCase(),stacked?236:91);
        ctx.font=`700 11.5px ${FONT}`;
        const values=stacked?[f.value]:wrap(ctx,f.value,f.fullWidth?398:140);
        return {labels,values,stacked,fullWidth:f.fullWidth,alert:f.alert};
      });
      return {pair,height:Math.max(25,...pair.map(f=>f.stacked?40:Math.max(f.labels.length*10.5,f.values.length*14)+12))};
    });
    return {title:group.title,rows,timeline};
  }).filter(g=>g.rows.length||g.timeline);
}
function drawPage(canvas, groups, entry, profile, logo) {
  const ctx=canvas.getContext("2d"), margin=12, width=516, half=258;
  const displayGroups=groups.map(g=>({...g,rows:g.rows.filter(f=>!["Working Cab","PT Type","AC","UIC Status","RTIS"].includes(f.label))}));
  const layout=prepareDiary(ctx,displayGroups,entry);
  const train=joinDetails([entry.trainNumber,entry.trainName]);
  const dotTrain=joinDetails([entry.dotTrainNumber,entry.dotTrainName]);
  const headings=entry.movementType==="arrival"&&entry.isDotTrain?
    [train?"ARRIVAL: "+train:"",dotTrain?"DEP: "+dotTrain:""]:
    ["arrival","departure"].includes(entry.movementType)?[train]:[];
  ctx.font="800 19px Arial";
  const trainLines=headings.filter(Boolean).flatMap(t=>wrap(ctx,t,492));
  const trainHeight=trainLines.length?trainLines.length*23+16:8;
  const identity=groups.find(g=>g.title==="Movement Identity")?.rows||[];
  const blocks=[["LOCO NUMBER","Loco Number"],["TYPE","Loco Type"],["SHED","Shed"]]
    .map(([label,key])=>[label,identity.find(f=>f.label===key)?.value]).filter(([,value])=>value&&value!=="—");
  const cabBlocks=[["WORKING CAB","Working Cab"],["PANTO TYPE","PT Type"]]
    .map(([label,key])=>[label,identity.find(f=>f.label===key)?.value]).filter(([,value])=>clean(value)&&value!=="—");
  const fields=groups.flatMap(g=>g.rows);
  const statuses=[["AC","AC"],["UIC","UIC Status"],["RTIS","RTIS"]]
    .map(([label,key])=>[label,fields.find(f=>f.label===key)?.value]).filter(([,value])=>clean(value)&&value!=="—");
  const bandHeight=(blocks.length?64:0)+(cabBlocks.length?36:0);
  const locoHeight=bandHeight+(statuses.length?50:0);
  const contentTop=72+trainHeight+locoHeight;
  const contentHeight=layout.reduce((n,g)=>n+(g.title==="Movement Identity"?0:24)+(g.timeline?55:0)+g.rows.reduce((a,r)=>a+r.height,0)+5,0);
  const height=Math.max(675,contentTop+contentHeight+46);
  canvas.width=1080;canvas.height=Math.ceil(height*2);ctx.scale(2,2);
  ctx.fillStyle="#fff";ctx.fillRect(0,0,540,height);
  const gradient=ctx.createLinearGradient(12,0,528,65);gradient.addColorStop(0,"#ff792c");gradient.addColorStop(1,"#760e32");
  ctx.fillStyle=gradient;rounded(ctx,margin,8,width,60,6);ctx.fill();
  const title=entry.movementType==="arrival"&&entry.isDotTrain?"DOT MOVEMENT":
    entry.movementType==="arrival"?"ARRIVAL MOVEMENT":entry.movementType==="shed_shunting"?"SHED SHUNTING":"DEPARTURE MOVEMENT";
  ctx.fillStyle="#fff";ctx.font="800 23px Arial";ctx.fillText(title,24,35,492);
  if(entry.date){ctx.font="600 12px Arial";ctx.fillText(longDate(entry.date),24,55,492);}
  ctx.fillStyle="#760e32";ctx.font="800 19px Arial";ctx.textAlign="center";
  trainLines.forEach((line,i)=>ctx.fillText(line,270,94+i*23,492));ctx.textAlign="left";
  let y=72+trainHeight;
  if(bandHeight) {
    ctx.fillStyle="#790f30";ctx.fillRect(margin,y,width,bandHeight);
    blocks.forEach(([label,value],i)=>{
      const blockWidth=width/blocks.length,x=margin+i*blockWidth;
      ctx.textAlign="center";ctx.fillStyle="#ffe7d4";ctx.font="700 9px Arial";ctx.fillText(label,x+blockWidth/2,y+17,blockWidth-16);
      ctx.fillStyle="#fff";ctx.font="800 27px Arial";ctx.fillText(value,x+blockWidth/2,y+49,blockWidth-16);
      if(i){ctx.strokeStyle="#bd8290";ctx.beginPath();ctx.moveTo(x,y+8);ctx.lineTo(x,y+56);ctx.stroke();}
    });ctx.textAlign="left";
    if(cabBlocks.length){
      const cabY=y+(blocks.length?64:0);
      if(blocks.length){ctx.strokeStyle="#bd8290";ctx.beginPath();ctx.moveTo(24,cabY-2);ctx.lineTo(516,cabY-2);ctx.stroke();}
      ctx.font="700 13px Arial";ctx.fillStyle="#fff";ctx.textAlign="center";
      cabBlocks.forEach(([label,value],i)=>{const w=width/cabBlocks.length;ctx.fillText(label+"  ·  "+value,margin+w*(i+.5),cabY+21,w-20);});
      ctx.textAlign="left";
    }
    y+=bandHeight;
  }
  if(statuses.length){
    y+=6;ctx.fillStyle="#f7e7dc";rounded(ctx,margin,y,width,38,4);ctx.fill();
    statuses.forEach(([label,value],i)=>{
      const w=width/statuses.length,x=margin+i*w;
      ctx.textAlign="center";ctx.fillStyle="#790f30";ctx.font="800 9px Arial";ctx.fillText(label,x+w/2,y+12);
      ctx.fillStyle="#182542";ctx.font="700 11px Arial";ctx.fillText(value,x+w/2,y+28,w-14);
      if(i){ctx.strokeStyle="#dcc3b4";ctx.beginPath();ctx.moveTo(x,y+7);ctx.lineTo(x,y+31);ctx.stroke();}
    });ctx.textAlign="left";y+=44;
  }
  if(logo){ctx.save();ctx.globalAlpha=.065;const size=320;ctx.drawImage(logo,110,Math.max(y+90,(height-size)/2),size,size);ctx.restore();}
  function rule(x1,y1,x2,y2){ctx.strokeStyle="#c9cdd2";ctx.lineWidth=.6;ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();}
  for(const group of layout){
    if(group.title!=="Movement Identity"){
      const strip=ctx.createLinearGradient(12,0,528,0);strip.addColorStop(0,"#e3e5e7");strip.addColorStop(1,"#f2f3f4");
      ctx.fillStyle=strip;rounded(ctx,12,y,516,20,2);ctx.fill();
      ctx.fillStyle="#760e32";ctx.font="800 11px Arial";
      const label=group.title==="Departure Details"?"MOVEMENT TIMELINE":group.title==="Arrival Details"?"ARRIVAL TIMELINE":group.title.toUpperCase();
      ctx.fillText(label,20,y+14,500);y+=24;
    }
    if(group.timeline){
      const t=group.timeline;
      ctx.fillStyle="#760e32";ctx.font="800 23px Arial";ctx.fillText(t.start,25,y+24,103);
      ctx.textAlign="right";ctx.fillText(t.end,515,y+24,103);ctx.textAlign="left";
      ctx.font="700 8px Arial";ctx.fillStyle="#303640";ctx.fillText(t.startLabel,25,y+42,110);
      ctx.textAlign="right";ctx.fillText(t.endLabel,515,y+42,110);ctx.textAlign="left";
      ctx.strokeStyle="#f77a31";ctx.lineWidth=1.7;ctx.beginPath();ctx.moveTo(145,y+21);ctx.lineTo(395,y+21);ctx.stroke();
      for(const x of [145,395]){ctx.fillStyle="#fff";ctx.beginPath();ctx.arc(x,y+21,4,0,Math.PI*2);ctx.fill();ctx.stroke();}
      if(logo)ctx.drawImage(logo,255,y+6,30,30);
      y+=55;
    }
    for(const row of group.rows){
      row.pair.forEach((f,i)=>{
        const x=margin+i*half,cellWidth=f.fullWidth?width:half;
        ctx.fillStyle="rgba(237,239,241,.60)";ctx.fillRect(x,y,f.stacked?cellWidth:100,row.height);
        ctx.fillStyle="#29313d";ctx.font="700 8.5px Arial";
        f.labels.forEach((line,j)=>ctx.fillText(line,x+7,y+14+j*10.5,f.stacked?236:91));
        ctx.fillStyle=f.alert?"#be1926":"#182542";ctx.font=`700 11.5px ${FONT}`;
        f.values.forEach((line,j)=>ctx.fillText(line,x+(f.stacked?7:108),y+(f.stacked?31:15)+j*14,f.stacked?236:f.fullWidth?398:140));
        rule(x,y,x+cellWidth,y);rule(x,y,x,y+row.height);rule(x+cellWidth,y,x+cellWidth,y+row.height);
        if(!f.stacked)rule(x+100,y,x+100,y+row.height);
      });
      rule(margin,y+row.height,margin+width,y+row.height);y+=row.height;
    }
    y+=5;
  }
  const footerY=height-34;ctx.fillStyle="#790f30";rounded(ctx,12,footerY,516,26,3);ctx.fill();
  ctx.fillStyle="#fff";ctx.font="700 10px Arial";ctx.fillText("RAILWAY LOGBOOK",24,footerY+17);
  if(clean(profile?.name)){ctx.textAlign="right";ctx.fillText("LPS · "+clean(profile.name),516,footerY+17,300);ctx.textAlign="left";}
}
function caption(entry) {
  if (entry.movementType === "arrival" && entry.isDotTrain) return `ARRIVAL TN: ${val(entry.trainNumber)}\nDEP TRAIN NUMBER: ${val(entry.dotTrainNumber)}`;
  return entry.movementType === "arrival" ? `ARRIVAL TN: ${val(entry.trainNumber)}` : `DEP TRAIN NUMBER: ${val(entry.trainNumber)}`;
}
async function logoImage() {
  const { APP_LOGO } = await import("./shareLogo.js");
  return new Promise((resolve) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = () => resolve(null); image.src = APP_LOGO; });
}

export async function openExportCard(entry, locomotives, options = {}) {
  const { loadDiaryFont } = await import("./diaryFont.js");
  await loadDiaryFont();
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
  } }, "Share Report Image");
  const done = el("button", { class:"final-done-btn", type:"button", onclick: async () => { done.disabled=true; try { if(typeof options.onDone === "function") await options.onDone(); overlay.remove(); } finally { done.disabled=false; } } }, options.doneLabel || "Done");
  overlay.appendChild(el("div",{class:"overlay-card share-card-dialog"},[el("h2",{},"Share Movement Report"),el("p",{},"Ticket-style movement report · single share image"),preview,captionArea,copy,share,done])); document.body.appendChild(overlay);
}

