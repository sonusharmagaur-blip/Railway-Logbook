import { DB } from "./db.js";
import { el } from "./util.js";
import { MAJOR_SCHEDULE_OPTIONS, MINOR_SCHEDULE_TYPE_OPTIONS } from "./models.js";

function categories(row) {
  return row.categories || [MINOR_SCHEDULE_TYPE_OPTIONS.includes(row.code) ? "minor" : "major"];
}
export function scheduleOptions(rows, category, current = "") {
  const defaults = category === "minor" ? MINOR_SCHEDULE_TYPE_OPTIONS : MAJOR_SCHEDULE_OPTIONS;
  return [...new Set([...defaults, ...rows.filter(row => categories(row).includes(category)).map(row => row.code), ...(current ? [current] : [])])];
}
export async function renderScheduleTypeManager(container) {
  container.innerHTML = "";
  container.appendChild(el("h2", {}, "Manage Major & Minor Schedules"));
  const list = el("div", { class:"form-section" });
  const kind = el("select", { "aria-label":"Schedule category" }, [
    el("option", {value:"major"}, "Major Schedule"),
    el("option", {value:"minor"}, "Minor Schedule"),
  ]);
  const codeInput = el("input", {type:"text",placeholder:"e.g. AOH or STR","aria-label":"New schedule option"});
  const message = el("p", {role:"status"});
  async function refresh() {
    const rows = await DB.getAll("scheduleTypes");
    list.innerHTML = "";
    for (const category of ["major","minor"]) {
      list.appendChild(el("h3",{},category === "major" ? "Major Schedule" : "Minor Schedule"));
      list.appendChild(el("p",{},scheduleOptions(rows,category).join(" · ")));
    }
  }
  const add = el("button",{class:"primary-btn",type:"button",onclick:async()=>{
    const code = codeInput.value.trim().replace(/\s+/g," ").toUpperCase();
    if (!code) { message.textContent = "Enter a schedule option."; return; }
    add.disabled=true;
    try {
      const rows=await DB.getAll("scheduleTypes");
      if (scheduleOptions(rows,kind.value).some(v=>v.toUpperCase()===code)) {message.textContent="This option already exists.";return;}
      const previous=rows.find(r=>r.code===code);
      await DB.put("scheduleTypes",{...previous,code,displayOrder:previous?.displayOrder ?? rows.length,isUserAdded:true,categories:[...new Set([...(previous?categories(previous):[]),kind.value])]});
      codeInput.value=""; message.textContent="Option added. Available in Arrival and Departure forms.";
      await refresh();
    } catch(error) {message.textContent=error.message || "Could not save option.";}
    finally {add.disabled=false;}
  }},"Add Schedule Option");
  container.appendChild(el("div",{class:"form-section"},[
    el("label",{},"Add option to"),kind,el("label",{},"Schedule code"),codeInput,add,message,
  ]));
  container.appendChild(list);
  await refresh();
}

