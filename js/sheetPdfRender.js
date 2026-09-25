const A4={portrait:[595.28,841.89],landscape:[841.89,595.28]};
const colour=(c,fallback="#000")=>c?`rgb(${Math.round((c.red||0)*255)},${Math.round((c.green||0)*255)},${Math.round((c.blue||0)*255)})`:fallback;
function linesFor(ctx,text,width){
  const lines=[];
  for(const paragraph of String(text).split(/\r?\n/)){
    let line="";
    for(const ch of paragraph){if(line && ctx.measureText(line+ch).width>width){lines.push(line);line="";}line+=ch;}
    lines.push(line);
  }
  return lines;
}
function formatCell(cell,defaults){const f={...defaults,...cell.effectiveFormat};f.textFormat={...defaults.textFormat,...cell.effectiveFormat?.textFormat};return f;}
function font(f){const t=f.textFormat||{};return `${t.italic?"italic ":""}${t.bold?"bold ":""}${(t.fontSize||10)*96/72}px ${JSON.stringify(t.fontFamily||"Arial")},sans-serif`;}

export async function renderWorksheet(sheet,bounds,defaults={},orientation="portrait",mode="width"){
  const grid=sheet.data?.[0]||{},rows=grid.rowData||[],r0=grid.startRow??bounds.r0,c0=grid.startColumn??bounds.c0;
  let lastR=bounds.r0,lastC=bounds.c0,hasText=false;
  for(let r=0;r<rows.length;r++)for(let c=0;c<(rows[r].values||[]).length;c++)if(rows[r].values[c].formattedValue!==undefined && rows[r].values[c].formattedValue!==""){
    hasText=true;lastR=Math.max(lastR,r0+r);lastC=Math.max(lastC,c0+c);
  }
  if(!hasText)throw new Error("The selected worksheet/range has no displayed cell values.");
  const merges=(sheet.merges||[]).filter(m=>m.startRowIndex<=lastR && m.startColumnIndex<=lastC && m.endRowIndex>bounds.r0 && m.endColumnIndex>bounds.c0);
  for(const m of merges){
    if(m.startRowIndex<bounds.r0||m.startColumnIndex<bounds.c0||m.endRowIndex>bounds.r1||m.endColumnIndex>bounds.c1)throw new Error("The print range cuts through a merged cell. Expand the range to include the whole merged cell.");
    lastR=Math.max(lastR,m.endRowIndex-1);lastC=Math.max(lastC,m.endColumnIndex-1);
  }
  const rowIds=[],colIds=[],heights=new Map(),widths=new Map();
  for(let r=bounds.r0;r<=lastR;r++){const meta=grid.rowMetadata?.[r-r0]||{};if(!meta.hiddenByUser&&!meta.hiddenByFilter){rowIds.push(r);heights.set(r,meta.pixelSize||21);}}
  for(let c=bounds.c0;c<=lastC;c++){const meta=grid.columnMetadata?.[c-c0]||{};if(!meta.hiddenByUser&&!meta.hiddenByFilter){colIds.push(c);widths.set(c,meta.pixelSize||100);}}
  if(!rowIds.length||!colIds.length)throw new Error("The selected range only contains hidden rows/columns.");
  const covered=new Set(),mergeAt=new Map();
  for(const m of merges){mergeAt.set(`${m.startRowIndex}:${m.startColumnIndex}`,m);for(let r=m.startRowIndex;r<m.endRowIndex;r++)for(let c=m.startColumnIndex;c<m.endColumnIndex;c++)if(r!==m.startRowIndex||c!==m.startColumnIndex)covered.add(`${r}:${c}`);}
  const measure=document.createElement("canvas").getContext("2d"),cells=[];
  for(const r of rowIds)for(const c of colIds){
    if(covered.has(`${r}:${c}`))continue;
    const cell=rows[r-r0]?.values?.[c-c0]||{},f=formatCell(cell,defaults),m=mergeAt.get(`${r}:${c}`);
    const rs=rowIds.filter(i=>i>=r&&i<(m?.endRowIndex||r+1)),cs=colIds.filter(i=>i>=c&&i<(m?.endColumnIndex||c+1));
    const w=cs.reduce((s,i)=>s+widths.get(i),0);
    measure.font=font(f);const text=String(cell.formattedValue??""),lines=linesFor(measure,text,Math.max(5,w-8)),lineHeight=(f.textFormat.fontSize||10)*96/72*1.18;
    const required=lines.length*lineHeight+7,available=rs.reduce((s,i)=>s+heights.get(i),0);
    if(required>available && text)heights.set(rs[rs.length-1],heights.get(rs[rs.length-1])+required-available);
    cells.push({r,c,rs,cs,w,f,text,lines,lineHeight});
  }
  const totalWidth=colIds.reduce((s,c)=>s+widths.get(c),0),totalHeight=rowIds.reduce((s,r)=>s+heights.get(r),0);
  const [pw,ph]=A4[orientation],margin=24,footer=16;
  let scale=Math.min((pw-2*margin)/totalWidth,1);
  if(mode==="one")scale=Math.min(scale,(ph-2*margin-footer)/totalHeight);
  if(scale<.18)throw new Error("Too much data for a readable A4 PDF. Choose a smaller range, landscape, or multiple pages.");
  const capacity=(ph-2*margin-footer)/scale,groups=[];let current=[],used=0;
  for(let i=0;i<rowIds.length;){
    let end=i+1,changed=true;
    while(changed){changed=false;for(const m of merges){if(m.startRowIndex<=rowIds[end-1]&&m.endRowIndex>rowIds[i]){while(end<rowIds.length&&rowIds[end]<m.endRowIndex){end++;changed=true;}}}}
    const block=rowIds.slice(i,end),height=block.reduce((s,r)=>s+heights.get(r),0);
    if(height>capacity+.1)throw new Error("A merged row group is taller than one page. Try Fit worksheet on one page or a smaller range.");
    if(current.length&&used+height>capacity){groups.push(current);current=[];used=0;}
    current.push(...block);used+=height;i=end;
  }
  if(current.length)groups.push(current);
  if(groups.length>30)throw new Error("PDF would exceed 30 pages. Choose a smaller range.");
  const logo=await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error("Logo could not load. Reopen the app and retry."));img.src=new URL("../icons/icon-512.png",import.meta.url).href;});
  const pages=[];
  for(let pageIndex=0;pageIndex<groups.length;pageIndex++){
    const ids=groups[pageIndex],canvas=document.createElement("canvas");canvas.width=Math.round(pw*2);canvas.height=Math.round(ph*2);canvas.setAttribute("aria-label",`PDF page ${pageIndex+1}`);
    const ctx=canvas.getContext("2d");ctx.scale(2,2);ctx.fillStyle="#fff";ctx.fillRect(0,0,pw,ph);
    const x=new Map(),y=new Map();let xx=0,yy=0;
    for(const c of colIds){x.set(c,xx);xx+=widths.get(c);}for(const r of ids){y.set(r,yy);yy+=heights.get(r);}
    const pageCells=cells.filter(cell=>y.has(cell.r));
    ctx.save();ctx.translate(margin,margin);ctx.scale(scale,scale);
    for(const cell of pageCells){ctx.fillStyle=colour(cell.f.backgroundColor,"#fff");ctx.fillRect(x.get(cell.c),y.get(cell.r),cell.w,cell.rs.reduce((s,r)=>s+heights.get(r),0));}
    ctx.restore();ctx.save();ctx.globalAlpha=.075;const size=Math.min(pw,ph)*.55;ctx.drawImage(logo,(pw-size)/2,(ph-size)/2,size,size);ctx.restore();
    ctx.save();ctx.translate(margin,margin);ctx.scale(scale,scale);
    for(const cell of pageCells){
      const cx=x.get(cell.c),cy=y.get(cell.r),h=cell.rs.reduce((s,r)=>s+heights.get(r),0),f=cell.f;
      for(const [side,coords] of Object.entries({top:[cx,cy,cx+cell.w,cy],bottom:[cx,cy+h,cx+cell.w,cy+h],left:[cx,cy,cx,cy+h],right:[cx+cell.w,cy,cx+cell.w,cy+h]})){
        const b=f.borders?.[side];if(!b?.style||b.style==="NONE")continue;
        ctx.strokeStyle=colour(b.color);ctx.lineWidth=b.style.includes("THICK")?3:b.style.includes("MEDIUM")?2:1;
        ctx.setLineDash(b.style==="DASHED"?[4,3]:b.style==="DOTTED"?[1,2]:[]);ctx.beginPath();ctx.moveTo(...coords.slice(0,2));ctx.lineTo(...coords.slice(2));ctx.stroke();
      }
      ctx.setLineDash([]);ctx.save();ctx.beginPath();ctx.rect(cx,cy,cell.w,h);ctx.clip();ctx.font=font(f);ctx.fillStyle=colour(f.textFormat.foregroundColor);ctx.textBaseline="top";
      const align=f.horizontalAlignment||"LEFT";ctx.textAlign=align==="CENTER"?"center":align==="RIGHT"?"right":"left";
      const tx=align==="CENTER"?cx+cell.w/2:align==="RIGHT"?cx+cell.w-4:cx+4;
      const th=cell.lines.length*cell.lineHeight;const ty=cy+(f.verticalAlignment==="TOP"?3:f.verticalAlignment==="MIDDLE"?Math.max(3,(h-th)/2):Math.max(3,h-th-3));
      cell.lines.forEach((line,i)=>ctx.fillText(line,tx,ty+i*cell.lineHeight));ctx.restore();
    }
    ctx.restore();ctx.fillStyle="#666";ctx.font="8px Arial";ctx.textAlign="right";ctx.fillText(`${pageIndex+1} / ${groups.length}`,pw-margin,ph-12);
    pages.push(canvas);await new Promise(resolve=>setTimeout(resolve,0));
  }
  return pages;
}

// Image-only PDF keeps the browser-rendered Unicode glyphs and watermark intact.
// All offsets and stream lengths are measured in bytes, not string characters.
export async function canvasesToPdf(pages,orientation="portrait"){
  const encoder=new TextEncoder(),parts=[],offsets=[0];let size=0;
  const add=part=>{const bytes=typeof part==="string"?encoder.encode(part):part;parts.push(bytes);size+=bytes.length;};
  const object=(id,body)=>{offsets[id]=size;add(`${id} 0 obj\n${body}\nendobj\n`);};
  const [w,h]=A4[orientation];add("%PDF-1.4\n");object(1,"<< /Type /Catalog /Pages 2 0 R >>");
  object(2,`<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_,i)=>`${3+i*3} 0 R`).join(" ")}] >>`);
  for(let i=0;i<pages.length;i++){
    const canvas=pages[i],id=3+i*3;
    const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error("PDF image encoding failed.")),"image/jpeg",.96));
    const bytes=new Uint8Array(await blob.arrayBuffer());
    object(id,`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im${i} ${id+1} 0 R >> >> /Contents ${id+2} 0 R >>`);
    offsets[id+1]=size;add(`${id+1} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${canvas.width} /Height ${canvas.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${bytes.length} >>\nstream\n`);add(bytes);add("\nendstream\nendobj\n");
    const stream=`q\n${w} 0 0 ${h} 0 0 cm\n/Im${i} Do\nQ\n`;object(id+2,`<< /Length ${encoder.encode(stream).length} >>\nstream\n${stream}endstream`);
  }
  const xref=size;add(`xref\n0 ${offsets.length}\n0000000000 65535 f \n`);for(const offset of offsets.slice(1))add(`${String(offset).padStart(10,"0")} 00000 n \n`);
  add(`trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);return new Blob(parts,{type:"application/pdf"});
}
