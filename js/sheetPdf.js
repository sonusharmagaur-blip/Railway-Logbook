import { el } from "./util.js";
import { Constants } from "./constants.js";
import { getValidAccessToken } from "./drive.js";
import { DB } from "./db.js";

const DEFAULT_SHEETS=[
  {name:"DIESEL",url:""},
  {name:"ELECTRIC",url:""},
];

export async function renderSheetPdfSettings(holder){
  const saved=await DB.get("meta","sheetPdfLinks");
  const links=DEFAULT_SHEETS.map((fallback,i)=>({...fallback,...saved?.value?.[i]}));
  holder.appendChild(el("p",{},"Save two Sheet links. Share PDF creates an A4 table PDF with your logo watermark. One visible worksheet is selected automatically; otherwise choose the worksheet."));
  for(let i=0;i<links.length;i++){
    const item=links[i];
    const name=el("input",{type:"text",value:item.name,"aria-label":`Sheet ${i+1} name`,oninput:e=>{item.name=e.target.value;}});
    const url=el("input",{type:"url",value:item.url,"aria-label":`Sheet ${i+1} link`,autocapitalize:"none",spellcheck:"false",oninput:e=>{item.url=e.target.value;}});
    const message=el("span",{role:"status"});
    holder.appendChild(el("div",{class:"form-row sheet-pdf-saved"},[
      el("label",{},item.name),name,url,
      el("button",{type:"button",class:"primary-btn",onclick:async()=>{
        try{
          parseSheetLink(item.url);await DB.put("meta",{key:"sheetPdfLinks",value:links});
          const overlay=el("div",{class:"overlay"});const content=el("div");
          overlay.appendChild(el("div",{class:"overlay-card sheet-pdf-dialog"},[content]));document.body.appendChild(overlay);
          await mountSheetPdfTab(content,()=>{}, {link:item.url,auto:true});
        }catch(error){message.textContent=error.message;}
      }},"Share PDF"),message,
    ]));
  }
  const status=el("p",{role:"status"});
  holder.append(el("button",{type:"button",class:"secondary-btn",onclick:async()=>{
    try{links.forEach(item=>parseSheetLink(item.url));await DB.put("meta",{key:"sheetPdfLinks",value:links});status.textContent="Both Sheet links saved on this device.";}
    catch(error){status.textContent=error.message;}
  }},"Save Sheet Links"),status);
}

export function parseSheetLink(value) {
  let url;
  try {url=new URL(value.trim());} catch {throw new Error("Paste a complete Google Sheets link.");}
  const match=/^\/spreadsheets\/d\/([A-Za-z0-9_-]+)(?:\/|$)/.exec(url.pathname);
  if(url.hostname!=="docs.google.com" || !match)throw new Error("Use a docs.google.com/spreadsheets link.");
  return {id:match[1],gid:new URLSearchParams(url.hash.slice(1)).get("gid") || url.searchParams.get("gid")};
}
export function columnName(n){let result="";for(n++;n;n=Math.floor((n-1)/26))result=String.fromCharCode(65+(n-1)%26)+result;return result;}
export function parsePrintRange(value, props) {
  const text=value.trim().toUpperCase() || `A1:${columnName(props.gridProperties.columnCount-1)}${props.gridProperties.rowCount}`;
  const m=/^([A-Z]+)([1-9]\d*):([A-Z]+)([1-9]\d*)$/.exec(text);
  if(!m)throw new Error("Enter a range like A1:G59, or leave it blank for the worksheet.");
  const col=s=>[...s].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0)-1;
  const range={r0:Number(m[2])-1,r1:Number(m[4]),c0:col(m[1]),c1:col(m[3])+1,text};
  const rows=range.r1-range.r0,cols=range.c1-range.c0;
  if(rows<1||cols<1||range.r1>props.gridProperties.rowCount||range.c1>props.gridProperties.columnCount)throw new Error("This range is outside the selected worksheet.");
  if(rows*cols>20000||cols>50||rows>1000)throw new Error("This worksheet is large. Enter a smaller print range (up to 20,000 cells, 50 columns and 1,000 rows).");
  return range;
}
async function sheetsGet(id,query,token) {
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);
  try {
    const response=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}?${new URLSearchParams(query)}`,{headers:{Authorization:`Bearer ${token}`},signal:controller.signal});
    if(!response.ok)throw new Error(response.status===401?"Google access expired. Tap Load Worksheets and reconnect.":response.status===403?"Google access denied. Use an account with access to this Sheet and enable Google Sheets API.":response.status===404?"Sheet not found or not shared with your Google account.":`Google Sheets error ${response.status}. Please try again.`);
    return await response.json();
  } catch(error){if(error.name==="AbortError")throw new Error("Google Sheets took too long. Check your connection and retry.");throw error;}finally{clearTimeout(timer);}
}

export async function mountSheetPdfTab(container,setHeaderTitle,options={}) {
  setHeaderTitle("Sheet PDF");container.replaceChildren();
  let book=null,loadedId=null,generation=0;
  const page=el("div",{class:"sheet-pdf-page"});
  const link=el("input",{type:"url",placeholder:"Paste Google Sheet link","aria-label":"Google Sheet link",autocapitalize:"none",spellcheck:"false"});
  const tabs=el("select",{"aria-label":"Worksheet"});tabs.disabled=true;
  const range=el("input",{type:"text",placeholder:"Optional: A1:G59","aria-label":"Print range"});
  const mode=el("select",{"aria-label":"PDF layout"},[el("option",{value:"width"},"Fit width / multiple pages"),el("option",{value:"one"},"Fit worksheet on one page")]);
  const orientation=el("select",{"aria-label":"PDF orientation"},[el("option",{value:"portrait"},"A4 Portrait"),el("option",{value:"landscape"},"A4 Landscape")]);
  const status=el("p",{role:"status","aria-live":"polite"});
  const results=el("div",{class:"sheet-pdf-results"});
  const generate=el("button",{type:"button",class:"primary-btn",onclick:build},"Generate Watermarked PDF");generate.disabled=true;
  function invalidate(){generation++;results.replaceChildren();}
  link.addEventListener("input",()=>{invalidate();book=null;loadedId=null;tabs.replaceChildren();tabs.disabled=true;generate.disabled=true;status.textContent="Load worksheets for this link.";});
  for(const control of [tabs,range,mode,orientation])control.addEventListener("change",invalidate);
  tabs.addEventListener("change",()=>{range.value="";});
  const load=el("button",{type:"button",class:"secondary-btn",onclick:async()=>{
    load.disabled=true;generate.disabled=true;invalidate();const version=generation;
    try{
      const target=parseSheetLink(link.value);status.textContent="Connecting to Google…";
      const token=await getValidAccessToken({interactive:true,requiredScopes:[Constants.sheetsScope]});
      const data=await sheetsGet(target.id,{fields:"spreadsheetId,properties(title),sheets(properties,charts(chartId))"},token);
      if(!page.isConnected||version!==generation)return;
      const worksheets=(data.sheets||[]).filter(s=>s.properties.sheetType==="GRID"||!s.properties.sheetType);
      if(!worksheets.length)throw new Error("No grid worksheets found.");
      book=data;loadedId=target.id;tabs.replaceChildren(...worksheets.map(s=>el("option",{value:String(s.properties.sheetId)},s.properties.title+(s.properties.hidden?" (hidden)":""))));
      const visible=worksheets.filter(s=>!s.properties.hidden);
      const selected=(visible.length===1?visible[0]:worksheets.find(s=>String(s.properties.sheetId)===target.gid))||visible[0]||worksheets[0];
      tabs.value=String(selected.properties.sheetId);tabs.disabled=false;range.value="";generate.disabled=false;
      status.textContent=`${data.properties.title} · ${selected.properties.title} selected. Original Sheet stays unchanged.`;
      if(options.auto && visible.length===1){await build();}
      else if(options.auto){status.textContent+=" Multiple worksheets: confirm the worksheet and tap Generate. The app cannot detect a tab open in another browser.";}
    }catch(error){status.textContent=error.message;}finally{load.disabled=false;}
  }},"Load Worksheets / Connect Google");
  async function build(){
    if(!book)return;
    invalidate();const version=generation;generate.disabled=true;load.disabled=true;
    const sourceId=loadedId,selected=book.sheets.find(s=>String(s.properties.sheetId)===tabs.value);
    try{
      const bounds=parsePrintRange(range.value,selected.properties);
      if(selected.charts?.length)throw new Error("This worksheet contains charts. This version exports cell tables only; choose a table-only worksheet.");
      status.textContent="Reading selected worksheet…";
      const token=await getValidAccessToken({interactive:true,requiredScopes:[Constants.sheetsScope]});
      const data=await sheetsGet(sourceId,{ranges:`'${selected.properties.title.replace(/'/g,"''")}'!${bounds.text}`,includeGridData:"true",fields:"properties(title,defaultFormat),sheets(properties,merges,data(startRow,startColumn,rowData(values(formattedValue,effectiveValue,effectiveFormat)),rowMetadata(pixelSize,hiddenByUser,hiddenByFilter),columnMetadata(pixelSize,hiddenByUser,hiddenByFilter)))"},token);
      const sheet=data.sheets?.find(s=>s.properties.sheetId===selected.properties.sheetId);
      if(!sheet)throw new Error("Selected worksheet could not be read. Reload the worksheet list.");
      status.textContent="Adding watermark and building PDF…";
      const {renderWorksheet,canvasesToPdf}=await import("./sheetPdfRender.js");
      const pages=await renderWorksheet(sheet,bounds,data.properties?.defaultFormat||{},orientation.value,mode.value);
      const blob=await canvasesToPdf(pages,orientation.value);
      if(!page.isConnected||version!==generation)return;
      const filename=`${book.properties.title}-${selected.properties.title}`.replace(/[<>:"/\\|?*\x00-\x1f]/g,"-").slice(0,150)+".pdf";
      const file=new File([blob],filename,{type:"application/pdf"});
      const download=()=>{const url=URL.createObjectURL(file);const a=el("a",{href:url,download:filename});a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);};
      results.append(el("div",{class:"sheet-pdf-actions"},[
        el("button",{type:"button",class:"secondary-btn",onclick:download},"Download PDF"),
        el("button",{type:"button",class:"primary-btn",onclick:async()=>{
          try{if(navigator.canShare?.({files:[file]})){await navigator.share({files:[file],title:selected.properties.title});}else{download();status.textContent="PDF downloaded. Attach it in WhatsApp or another app.";}}
          catch(error){if(error.name!=="AbortError")status.textContent="Sharing was unavailable. Use Download PDF.";}
        }},"Share PDF"),
      ]),el("h3",{},`PDF Preview · ${pages.length} page${pages.length===1?"":"s"}`),...pages);
      status.textContent="PDF ready with a light Railway Logbook watermark on every page. Check the preview before sharing.";
    }catch(error){if(version===generation)status.textContent=error.message;}finally{generate.disabled=!book;load.disabled=false;}
  }
  page.append(el("div",{class:"card"},[
    el("h2",{},"Google Sheet → Watermarked PDF"),
    el("p",{},"Paste a link, choose the worksheet, then generate and share. Uses your Google connection from Settings."),
    el("label",{},"Google Sheet link"),link,load,el("label",{},"Worksheet"),tabs,
    el("label",{},"Print range (optional)"),range,orientation,mode,generate,status,
    el("small",{},"Table PDF: cell values, colours and merged cells are rendered on this device. Google print layouts, charts, drawings and images are not reproduced. Nothing is written to the original Sheet or uploaded elsewhere."),
  ]),results);container.appendChild(page);
  if(options.link){link.value=options.link;load.click();}
}
