import { DB } from "./db.js";
import { el } from "./util.js";
import { showToast } from "./toast.js";

// Today plus the previous nine calendar days, based on the movement date.
export function photoDateIsCurrent(date, now = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "")) return false;
  const [y,m,d] = date.split("-").map(Number);
  const movementDay = Date.UTC(y,m-1,d);
  if (new Date(movementDay).toISOString().slice(0,10) !== date) return false;
  const today = Date.UTC(now.getFullYear(),now.getMonth(),now.getDate());
  return movementDay <= today && movementDay > today - 10 * 86400000;
}

export async function pruneStablePhotos() {
  const [photos, entries] = await Promise.all([DB.getAll("stablePhotos"), DB.getAll("dutyEntries")]);
  const dates = new Map(entries.map(e=>[e.id,e.date]));
  await Promise.all(photos.filter(p=>!dates.has(p.id) || !photoDateIsCurrent(dates.get(p.id)) || !photoDateIsCurrent(p.date))
    .map(p=>DB.delete("stablePhotos",p.id)));
}

async function currentPhoto(entry) {
  const photo = await DB.get("stablePhotos", entry.id);
  if (!photo) return null;
  if (!photoDateIsCurrent(entry.date) || !photoDateIsCurrent(photo.date)) {
    await DB.delete("stablePhotos",entry.id);
    return null;
  }
  return photo;
}

export async function stablePhotoPreview(entry) {
  const photo = await currentPhoto(entry);
  if (!photo) return null;
  return el("figure", {class:"stable-photo-preview"}, [
    el("img",{src:photo.data,alt:"Loco stabling photo",loading:"lazy"}),
    el("figcaption",{},"Stable photo · retained for 10 movement-date days on this device"),
  ]);
}

async function compressPhoto(file) {
  if (!file || !file.type.startsWith("image/")) throw new Error("Please select a photo.");
  if (file.size > 25 * 1024 * 1024) throw new Error("Choose a photo smaller than 25 MB.");
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise((resolve,reject)=>{
      const img = new Image(); img.onload=()=>resolve(img); img.onerror=()=>reject(new Error("Photo could not be opened. Try a JPEG photo."));img.src=url;
    });
    const scale = Math.min(1,1280 / Math.max(image.naturalWidth,image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1,Math.round(image.naturalWidth*scale));
    canvas.height = Math.max(1,Math.round(image.naturalHeight*scale));
    canvas.getContext("2d").drawImage(image,0,0,canvas.width,canvas.height);
    return canvas.toDataURL("image/jpeg",.76);
  } finally { URL.revokeObjectURL(url); }
}

export function stableControls(entry, onChange) {
  const holder=el("div",{class:"stable-controls"});
  const other=el("input",{type:"text",value:entry.locoSecuredOther || "",placeholder:"Enter securing details","aria-label":"Loco secured other details",oninput:e=>{entry.locoSecuredOther=e.target.value;onChange();}});
  const select=el("select",{"aria-label":"Loco Secured",onchange:e=>{
    entry.locoSecured=e.target.value;other.hidden=entry.locoSecured!=="Other";onChange();
  }}, ["","4 WW and Hand Brakes and MCE Off","Other"].map(value=>el("option",{value},value || "Select / Not entered")));
  select.value=entry.locoSecured || "";other.hidden=entry.locoSecured!=="Other";
  const preview=el("div");
  const remove=el("button",{class:"secondary-btn",type:"button",onclick:async()=>{
    await DB.delete("stablePhotos",entry.id);entry.hasStablePhoto=false;onChange();await refresh();
  }},"Remove photo");
  async function refresh(){preview.replaceChildren();const photo=await stablePhotoPreview(entry);remove.hidden=!photo;if(photo)preview.appendChild(photo);}
  const file=el("input",{type:"file",accept:"image/*",capture:"environment",hidden:true,"aria-label":"Take stable photo",onchange:async()=>{
    if (!file.files?.length) return;
    file.disabled=true;
    try {
      if (!photoDateIsCurrent(entry.date)) throw new Error("Photos are kept only for today and the previous 9 movement-date days.");
      const data=await compressPhoto(file.files[0]);
      await DB.put("stablePhotos",{id:entry.id,date:entry.date,data});
      entry.hasStablePhoto=true;onChange();await refresh();showToast("Stable photo saved on this device.");
    } catch(error){showToast(error.message || "Could not save photo. Check available storage.");}
    finally {file.disabled=false;file.value="";}
  }});
  holder.append(el("label",{},"Loco Secured"),select,other,el("label",{},"Stable Photo / Camera"),file,
    el("button",{class:"secondary-btn",type:"button",onclick:()=>file.click()},"📷 Take / Choose Stable Photo"),
    el("small",{},"Photo stays on this device for 10 days from movement date; it is not included in Drive backups or the report image. Older movement records remain saved."),preview,remove);
  refresh().catch(()=>showToast("Could not load stable photo."));
  return holder;
}
