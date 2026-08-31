import { DB } from "./db.js";
import { kmFieldLabel } from "./models.js";
import { UICStatus } from "./models.js";
import { el, formatDate, formatTime } from "./util.js";

const SCALE = 3; // render at 3x for a crisp shareable image
// iPhone 15 Plus portrait output: 430 × 932 logical pixels rendered at 3x.
// The resulting PNG is exactly 1290 × 2796 pixels (approximately 19.5:9).
const CARD_WIDTH = 430;
const CARD_HEIGHT = 932;
const BACKGROUND_URL = new URL("../wap7-share-background.png", import.meta.url).href;
const FONT_STACK = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Avenir Next", "Segoe UI", sans-serif';

const COLORS = {
  fallbackBg: "#07131f",
  headerText: "#fff9ed",
  accent: "#f4a33b",
  label: "#ffd497",
  value: "#ffffff",
  panel: "rgba(5, 18, 29, 0.76)",
  panelBorder: "rgba(255, 215, 158, 0.52)",
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
    ];
  }

  let uicValue = entry.uicStatus || "—";
  if (entry.uicStatus === UICStatus.MODIFIED && entry.uicCableOption) {
    uicValue += ` (${entry.uicCableOption})`;
  }

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

function drawCard(canvas, fields, backgroundImage, lpsName) {
  const cellPadding = 11;
  const labelSize = 9.5;
  const valueSize = 14;
  const valueLineHeight = 18;
  const headerHeight = 104;
  const bodyInset = 12;
  const cellGap = 8;
  const ctx = canvas.getContext("2d");

  // Compact two-column cards keep the exported image close to a phone-screen portrait.
  const fullWidthLabels = new Set(["Train"]);
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
  mctx.font = `650 ${valueSize}px ${FONT_STACK}`;
  const innerWidth = CARD_WIDTH - bodyInset * 2;
  const columnWidth = (innerWidth - cellGap) / 2;
  const rowHeights = rows.map((row) => {
    const cellWidth = row.length === 1 ? innerWidth : columnWidth;
    return Math.max(...row.map((field) => {
      const lines = wrapText(mctx, field.value, cellWidth - cellPadding * 2);
      return cellPadding * 2 + labelSize + 6 + lines.length * valueLineHeight;
    }));
  });
  const bodyHeight = rowHeights.reduce((a, b) => a + b, 0) + Math.max(0, rows.length - 1) * cellGap;
  const totalHeight = CARD_HEIGHT;

  canvas.width = CARD_WIDTH * SCALE;
  canvas.height = totalHeight * SCALE;
  canvas.style.width = CARD_WIDTH + "px";
  canvas.style.height = totalHeight + "px";
  ctx.scale(SCALE, SCALE);

  // Full-bleed user-provided WAP-7 portrait. Its aspect ratio already closely
  // matches the iPhone 15 Plus canvas, so the complete image is retained.
  ctx.fillStyle = COLORS.fallbackBg;
  roundRect(ctx, 0, 0, CARD_WIDTH, totalHeight, 22);
  ctx.fill();

  if (backgroundImage) {
    ctx.save();
    roundRect(ctx, 0, 0, CARD_WIDTH, totalHeight, 22);
    ctx.clip();
    ctx.drawImage(backgroundImage, 0, 0, CARD_WIDTH, totalHeight);
    ctx.restore();
  }

  // A cinematic shade preserves the photograph while keeping all text readable.
  ctx.save();
  roundRect(ctx, 0, 0, CARD_WIDTH, totalHeight, 22);
  ctx.clip();
  const shade = ctx.createLinearGradient(0, 0, 0, totalHeight);
  shade.addColorStop(0, "rgba(2, 10, 18, 0.82)");
  shade.addColorStop(0.16, "rgba(2, 10, 18, 0.22)");
  shade.addColorStop(0.56, "rgba(2, 10, 18, 0.14)");
  shade.addColorStop(1, "rgba(2, 10, 18, 0.72)");
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, CARD_WIDTH, totalHeight);
  ctx.restore();

  // Premium compact header leaves the sunset and locomotive visible.
  ctx.fillStyle = COLORS.headerText;
  ctx.shadowColor = "rgba(0, 0, 0, 0.55)";
  ctx.shadowBlur = 8;
  ctx.font = `800 23px ${FONT_STACK}`;
  ctx.textBaseline = "alphabetic";
  ctx.fillText("Daily Loco Movement Record", 18, 42);
  ctx.font = `650 12.5px ${FONT_STACK}`;
  ctx.fillStyle = "#ffe3ba";
  ctx.fillText(`LPS Name · ${lpsName}`, 18, 67);
  ctx.shadowBlur = 0;
  ctx.fillStyle = COLORS.accent;
  ctx.fillRect(18, 82, 74, 3);
  ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
  ctx.font = `650 9px ${FONT_STACK}`;
  ctx.fillText("RAILWAY LOGBOOK · MOBILE DUTY CARD", 103, 86);

  // Anchor details near the lower half so the full portrait remains the hero.
  let y = Math.max(headerHeight + bodyInset, totalHeight - bodyHeight - 72);
  rows.forEach((row, rowIndex) => {
    const rowHeight = rowHeights[rowIndex];
    const cellWidth = row.length === 1 ? innerWidth : columnWidth;
    row.forEach((field, columnIndex) => {
      const x = bodyInset + columnIndex * (columnWidth + cellGap);
      ctx.fillStyle = COLORS.panel;
      roundRect(ctx, x, y, cellWidth, rowHeight, 12);
      ctx.fill();
      ctx.strokeStyle = COLORS.panelBorder;
      ctx.lineWidth = 0.9;
      ctx.stroke();

      const labelY = y + cellPadding + labelSize;
      ctx.fillStyle = COLORS.label;
      ctx.font = `750 ${labelSize}px ${FONT_STACK}`;
      ctx.fillText(field.label.toUpperCase(), x + cellPadding, labelY);

      ctx.fillStyle = COLORS.value;
      ctx.font = `700 ${valueSize}px ${FONT_STACK}`;
      const lines = wrapText(ctx, field.value, cellWidth - cellPadding * 2);
      lines.forEach((line, lineIndex) => {
        ctx.fillText(line, x + cellPadding, labelY + 5 + (lineIndex + 1) * valueLineHeight);
      });
    });
    y += rowHeight + cellGap;
  });

  ctx.strokeStyle = "rgba(255, 207, 137, 0.88)";
  ctx.lineWidth = 1.5;
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
  const backgroundImage = await loadImage(BACKGROUND_URL);
  const lpsName = (profile && profile.name) || "Tripurari Sharma";

  const overlay = el("div", { class: "overlay" });
  const canvasWrap = el("div", { class: "duty-card-canvas-wrap" });
  const canvas = el("canvas");
  canvasWrap.appendChild(canvas);
  drawCard(canvas, fields, backgroundImage, lpsName);

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
    el("p", {}, "1290 × 2796 px portrait image · Save or share, then tap Done."),
    canvasWrap,
    shareBtn,
    doneBtn,
  ]);
  overlay.appendChild(card);
  document.body.appendChild(overlay);
}
