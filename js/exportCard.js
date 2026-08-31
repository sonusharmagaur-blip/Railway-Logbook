import { DB } from "./db.js";
import { kmFieldLabel } from "./models.js";
import { UICStatus } from "./models.js";
import { el, formatDate, formatTime } from "./util.js";

const SCALE = 3; // render at 3x for a crisp shareable image
const CARD_WIDTH = 390;
const WATERMARK_URL = new URL("../wap7-share-watermark.png", import.meta.url).href;

const COLORS = {
  headerBg: "#7b1e14",
  headerText: "#faf0e1",
  cardBg: "#ffffff",
  label: "#7a6f63",
  value: "#241a15",
  divider: "#e0d8ca",
};

function wrapText(ctx, text, maxWidth) {
  const words = String(text).split(" ");
  const lines = [];
  let line = "";
  for (const word of words) {
    const test = line ? line + " " + word : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function buildFields(entry, locomotives, profile) {
  const loco = locomotives.find((l) => l.id === entry.locomotiveId);
  const locoNumber = (loco && loco.number) || entry.locomotiveNumberSnapshot || "—";
  const locoType = entry.locomotiveType || (loco && loco.locoClass) || "—";
  const locoShed = entry.locomotiveShed || (loco && loco.shed) || "—";

  if (entry.movementType === "shed_shunting") {
    return [
      { label: "Movement", value: "Shed Shunting" },
      { label: "Date", value: formatDate(entry.date) || "—" },
      { label: "Locomotive", value: locoNumber },
      { label: "Shed", value: locoShed },
      { label: "TOC Time", value: entry.shuntingTocTime ? formatTime(entry.shuntingTocTime) : "—" },
      { label: "TOC Place", value: entry.shuntingTocPlace || "—" },
      { label: "Movement Upto", value: entry.shuntingMovementUpto || "—" },
      { label: "Stable Time", value: entry.shuntingStableTime ? formatTime(entry.shuntingStableTime) : "—" },
      { label: "Stable Place", value: entry.shuntingStablePlace || "—" },
      { label: "CC Name", value: entry.shuntingCCName || "—" },
      { label: "LPS Name", value: (profile && profile.name) || "—" },
    ];
  }

  let uicValue = entry.uicStatus || "—";
  if (entry.uicStatus === UICStatus.MODIFIED && entry.uicCableOption) {
    uicValue += ` (${entry.uicCableOption})`;
  }

  const privateNumberSummary = (entry.privateNumberDetails || [])
    .filter((detail) => detail.signalNumber || detail.fromLine || detail.toLine || detail.departureTime || detail.yardMasterName || detail.pmName)
    .map((detail, index) => {
      const route = [detail.fromLine, detail.toLine].filter(Boolean).join(" → ");
      return `#${index + 1} Signal ${detail.signalNumber || "—"}${route ? ` · ${route}` : ""}${detail.departureTime ? ` · ${formatTime(detail.departureTime)}` : ""}`;
    })
    .join(" | ") || "None";
  const officialsSummary = (entry.officialDetails || [])
    .filter((detail) => detail.designation || detail.name)
    .map((detail) => `${detail.designation || "Official"}: ${detail.name || "—"}`)
    .join(" | ") || "None";

  return [
    { label: "Movement", value: entry.movementType === "arrival" ? "Arrival" : "Departure" },
    { label: "Date", value: formatDate(entry.date) || "—" },
    { label: "Train", value: `${entry.trainNumber || "—"}${entry.trainName ? " — " + entry.trainName : ""}` },
    { label: "Locomotive", value: locoNumber },
    { label: "Loco Type", value: locoType },
    { label: "Shed", value: locoShed },
    { label: "Cab", value: entry.cabSelection || "—" },
    { label: "AC", value: entry.acStatus || "—" },
    { label: "UIC", value: uicValue },
    { label: "RTIS", value: entry.rtisStatus || "—" },
    { label: "Major Schedule", value: `${entry.majorScheduleTypeCode || "—"}${entry.majorScheduleDate ? " — " + formatDate(entry.majorScheduleDate) : ""}` },
    { label: "Minor Schedule / TI", value: entry.minorScheduleTIDate ? formatDate(entry.minorScheduleTIDate) : "Not available" },
    { label: kmFieldLabel(entry), value: entry.kmSinceLastSchedule != null ? String(entry.kmSinceLastSchedule) : "—" },
    { label: "Loco Takeover", value: entry.locoTakeoverTime ? formatTime(entry.locoTakeoverTime) : "—" },
    { label: "Loco Offer", value: entry.locoOfferTime ? formatTime(entry.locoOfferTime) : "—" },
    { label: "Yard Departure", value: entry.departureTime ? formatTime(entry.departureTime) : "—" },
    { label: "Placement", value: entry.placementTime ? formatTime(entry.placementTime) : "—" },
    { label: "Private Number Details", value: privateNumberSummary },
    { label: "Officials", value: officialsSummary },
    { label: "Repair List", value: entry.repairList || "—" },
    { label: "Remarks", value: entry.remarks || "—" },
    { label: "LPS Name", value: (profile && profile.name) || "—" },
  ];
}

function loadImage(src) {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

function drawCard(canvas, fields, watermarkImage) {
  const cellPadding = 9;
  const labelSize = 9;
  const valueSize = 13;
  const valueLineHeight = 16;
  const headerHeight = 76;
  const bodyInset = 12;
  const cellGap = 7;
  const ctx = canvas.getContext("2d");

  // Compact two-column cards keep the exported image close to a phone-screen portrait.
  const fullWidthLabels = new Set(["Train", "Private Number Details", "Officials", "Repair List", "Remarks"]);
  const rows = [];
  let pendingField = null;
  for (const field of fields) {
    if (fullWidthLabels.has(field.label)) {
      if (pendingField) rows.push([pendingField]);
      pendingField = null;
      rows.push([field]);
    } else if (pendingField) {
      rows.push([pendingField, field]);
      pendingField = null;
    } else {
      pendingField = field;
    }
  }
  if (pendingField) rows.push([pendingField]);

  const measureCanvas = document.createElement("canvas");
  const mctx = measureCanvas.getContext("2d");
  mctx.font = `600 ${valueSize}px -apple-system, sans-serif`;
  const innerWidth = CARD_WIDTH - bodyInset * 2;
  const columnWidth = (innerWidth - cellGap) / 2;
  const rowHeights = rows.map((row) => {
    const cellWidth = row.length === 1 ? innerWidth : columnWidth;
    return Math.max(...row.map((field) => {
      const lines = wrapText(mctx, field.value, cellWidth - cellPadding * 2);
      return cellPadding * 2 + labelSize + 5 + lines.length * valueLineHeight;
    }));
  });
  const bodyHeight = rowHeights.reduce((a, b) => a + b, 0) + Math.max(0, rows.length - 1) * cellGap;
  const totalHeight = Math.max(780, headerHeight + bodyHeight + bodyInset * 2);

  canvas.width = CARD_WIDTH * SCALE;
  canvas.height = totalHeight * SCALE;
  canvas.style.width = CARD_WIDTH + "px";
  canvas.style.height = totalHeight + "px";
  ctx.scale(SCALE, SCALE);

  // Card background
  ctx.fillStyle = COLORS.cardBg;
  roundRect(ctx, 0, 0, CARD_WIDTH, totalHeight, 22);
  ctx.fill();

  if (watermarkImage) {
    const imageWidth = CARD_WIDTH - 20;
    const imageHeight = imageWidth * (watermarkImage.naturalHeight / watermarkImage.naturalWidth);
    const imageY = headerHeight + Math.max(30, (totalHeight - headerHeight - imageHeight) / 2);
    ctx.save();
    roundRect(ctx, 0, 0, CARD_WIDTH, totalHeight, 22);
    ctx.clip();
    ctx.globalAlpha = 0.15;
    ctx.drawImage(watermarkImage, 10, imageY, imageWidth, imageHeight);
    ctx.restore();
  }

  // Header
  ctx.save();
  roundRect(ctx, 0, 0, CARD_WIDTH, totalHeight, 22);
  ctx.clip();
  ctx.fillStyle = COLORS.headerBg;
  ctx.fillRect(0, 0, CARD_WIDTH, headerHeight);
  ctx.restore();

  ctx.fillStyle = COLORS.headerText;
  ctx.font = "700 19px -apple-system, sans-serif";
  ctx.textBaseline = "alphabetic";
  ctx.fillText("Daily Loco Movement Record", 17, 37);
  ctx.font = "500 11px -apple-system, sans-serif";
  ctx.fillText("RAILWAY LOGBOOK • MOBILE DUTY CARD", 17, 57);

  let y = headerHeight + bodyInset;
  rows.forEach((row, rowIndex) => {
    const rowHeight = rowHeights[rowIndex];
    const cellWidth = row.length === 1 ? innerWidth : columnWidth;
    row.forEach((field, columnIndex) => {
      const x = bodyInset + columnIndex * (columnWidth + cellGap);
      ctx.fillStyle = "rgba(255, 253, 249, 0.91)";
      roundRect(ctx, x, y, cellWidth, rowHeight, 9);
      ctx.fill();
      ctx.strokeStyle = COLORS.divider;
      ctx.lineWidth = 1;
      ctx.stroke();

      const labelY = y + cellPadding + labelSize;
      ctx.fillStyle = COLORS.label;
      ctx.font = `600 ${labelSize}px -apple-system, sans-serif`;
      ctx.fillText(field.label.toUpperCase(), x + cellPadding, labelY);

      ctx.fillStyle = COLORS.value;
      ctx.font = `650 ${valueSize}px -apple-system, sans-serif`;
      const lines = wrapText(ctx, field.value, cellWidth - cellPadding * 2);
      lines.forEach((line, lineIndex) => {
        ctx.fillText(line, x + cellPadding, labelY + 5 + (lineIndex + 1) * valueLineHeight);
      });
    });
    y += rowHeight + cellGap;
  });

  ctx.strokeStyle = COLORS.headerBg;
  ctx.lineWidth = 2;
  roundRect(ctx, 1, 1, CARD_WIDTH - 2, totalHeight - 2, 21);
  ctx.stroke();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export async function openExportCard(entry, locomotives, options = {}) {
  const profile = await DB.get("profile", "singleton");
  const fields = buildFields(entry, locomotives, profile);
  const watermarkImage = await loadImage(WATERMARK_URL);

  const overlay = el("div", { class: "overlay" });
  const canvasWrap = el("div", { class: "duty-card-canvas-wrap" });
  const canvas = el("canvas");
  canvasWrap.appendChild(canvas);
  drawCard(canvas, fields, watermarkImage);

  const shareBtn = el("button", { class: "primary-btn", onclick: async () => {
    canvas.toBlob(async (blob) => {
      const filename = `duty-card-${entry.date || "entry"}.png`;
      if (navigator.canShare && navigator.canShare({ files: [new File([blob], filename, { type: "image/png" })] })) {
        try {
          await navigator.share({ files: [new File([blob], filename, { type: "image/png" })], title: "Duty Card" });
          return;
        } catch (e) {
          // user cancelled or share failed — fall through to download
        }
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    }, "image/png");
  } }, "Share / Save Image");

  const doneBtn = el("button", {
    class: "final-done-btn",
    type: "button",
    onclick: async () => {
      doneBtn.disabled = true;
      try {
        if (typeof options.onDone === "function") await options.onDone();
        overlay.remove();
      } finally {
        doneBtn.disabled = false;
      }
    },
  }, options.doneLabel || "Done");

  const card = el("div", { class: "overlay-card share-card-dialog" }, [
    el("h2", {}, "Share Duty Card"),
    el("p", {}, "Save or share the movement card, then tap Done at the end."),
    canvasWrap,
    shareBtn,
    doneBtn,
  ]);
  overlay.appendChild(card);
  document.body.appendChild(overlay);
}
