import { DB } from "./db.js";
import { kmFieldLabel } from "./models.js";
import { UICStatus } from "./models.js";
import { el, formatDate, formatTime } from "./util.js";

// 540 × 675 logical pixels at 2x produces an exact 1080 × 1350 (4:5) image.
const SCALE = 2;
const CARD_WIDTH = 540;
const CARD_HEIGHT = 675;
import { SHARE_PHOTO } from "./sharePhoto.js";
const BACKGROUND_URL = SHARE_PHOTO;
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

function formatLongDate(isoDateStr) {
  if (!isoDateStr) return "—";
  const date = new Date(isoDateStr + "T00:00:00");
  if (isNaN(date)) return isoDateStr;
  const weekday = date.toLocaleDateString("en-GB", { weekday: "long" });
  const day = String(date.getDate()).padStart(2, "0");
  const month = date.toLocaleDateString("en-GB", { month: "long" });
  return `${weekday}, ${day} ${month} ${date.getFullYear()}`;
}

function buildFields(entry, locomotives, profile) {
  const loco = locomotives.find((l) => l.id === entry.locomotiveId);
  const locoNumber = (loco && loco.number) || entry.locomotiveNumberSnapshot || "—";
  const locoType = entry.locomotiveType || (loco && loco.locoClass) || "—";
  const locoShed = entry.locomotiveShed || (loco && loco.shed) || "—";
  const locoSummary = `${locoNumber}   ·   ${locoType}   ·   ${locoShed}`;

  if (entry.movementType === "shed_shunting") {
    return [
      { label: "Loco Number · Type · Shed", value: locoSummary, fullWidth: true },
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

  const isDot = entry.movementType === "arrival" && entry.isDotTrain === true;
  const offerPlace = entry.locoOfferPlace === "Other"
    ? entry.locoOfferPlaceOther
    : entry.locoOfferPlace;
  const dotOffer = /DOT/i.test(offerPlace || "") ? offerPlace : "";
  const fields = [
    {
      label: isDot ? "Arrival Train → Departure Train" : "Train Number · Name",
      value: isDot ? `${entry.trainNumber || "—"} → ${entry.dotTrainNumber || "—"}${entry.dotTrainName ? " · " + entry.dotTrainName : ""}` : `${entry.trainNumber || "—"}${entry.trainName ? " — " + entry.trainName : ""}`,
      fullWidth: !dotOffer,
    },
  ];
  if (dotOffer) fields.push({ label: "Loco Offer Place", value: dotOffer });
  fields.push(
    { label: "Loco Number · Type · Shed", value: locoSummary, fullWidth: true },
    { label: "PT Type", value: entry.locomotivePTType || "—" },
    { label: "Working Cab", value: entry.cabSelection || "—" },
    { label: "AC", value: entry.acFitted === "Not Fitted" ? "Not Fitted" : (entry.acStatus || "—") },
    { label: "UIC", value: uicValue },
    { label: "RTIS", value: entry.rtisFitted === "Not Fitted" ? "Not Fitted" : (entry.rtisStatus || "—") },
    { label: "Major Schedule", value: `${entry.majorScheduleTypeCode || "—"}${entry.majorScheduleDate ? " — " + formatDate(entry.majorScheduleDate) : ""}` },
    { label: "Minor Schedule / TI", value: entry.minorScheduleTIDate ? formatDate(entry.minorScheduleTIDate) : "Not available" },
    { label: kmFieldLabel(entry), value: entry.kmSinceLastSchedule != null ? String(entry.kmSinceLastSchedule) : "—" },
  );
  return fields;
}

function drawDynamicLocoIdentity(ctx, entry) {
  const locoNumber = String(entry.locomotiveNumberSnapshot || "").trim();
  const locoShed = String(entry.locomotiveShed || "").trim().toUpperCase();
  const rawType = String(entry.locomotiveType || "").trim().toUpperCase().replace(/\s+/g, "");
  const typeLabels = {
    WAP5: "WAP-5",
    WAP7: "WAP-7",
    WAG9: "WAG-9",
    WAP4: "WAP-4",
    WAG12: "WAG-12",
    DSLLOCO: "DSL",
  };
  const locoType = typeLabels[rawType] || String(entry.locomotiveType || "").trim().toUpperCase();
  if (!locoNumber && !locoShed && !locoType) return;

  ctx.save();
  ctx.fillStyle = "rgba(18, 18, 17, 0.92)";
  ctx.strokeStyle = "rgba(245, 241, 226, 0.14)";
  ctx.lineWidth = 0.45;
  ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(255, 255, 255, 0.16)";
  ctx.shadowBlur = 0.7;

  // Front markings: positioned and weighted like the locomotive's original lettering.
  ctx.textAlign = "center";
  ctx.font = `900 13px "Arial Narrow", "Roboto Condensed", ${FONT_STACK}`;
  if (locoType) {
    ctx.fillText(locoType, 123, 467);
    ctx.strokeText(locoType, 123, 467);
  }
  if (locoShed) {
    ctx.font = `900 11px "Arial Narrow", "Roboto Condensed", ${FONT_STACK}`;
    ctx.fillText(locoShed, 194, 467);
    ctx.strokeText(locoShed, 194, 467);
  }
  if (locoNumber) {
    ctx.font = `900 13px "Arial Narrow", "Roboto Condensed", ${FONT_STACK}`;
    ctx.fillText(locoNumber, 265, 467);
    ctx.strokeText(locoNumber, 265, 467);
  }

  // The side carries only the locomotive number, aligned on the white panel above the red stripe.
  ctx.translate(421, 417);
  ctx.rotate(0.035);
  ctx.scale(0.58, 1);
  ctx.font = `900 12px "Arial Narrow", "Roboto Condensed", ${FONT_STACK}`;
  if (locoNumber) {
    ctx.fillText(locoNumber, 0, 0);
    ctx.strokeText(locoNumber, 0, 0);
  }
  ctx.restore();
}

function loadImage(src) {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

function drawCard(canvas, fields, backgroundImage, lpsName, entry) {
  const cellPadding = 8;
  const labelSize = 9.5;
  const valueSize = 14;
  const valueLineHeight = 18;
  const headerHeight = 92;
  const bodyInset = 12;
  const cellGap = 6;
  const ctx = canvas.getContext("2d");

  // Compact two-column cards keep the exported image close to a phone-screen portrait.
  const rows = [];
  let pendingField = null;
  for (const field of fields) {
    if (field.fullWidth) {
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
  mctx.font = `700 ${valueSize}px ${FONT_STACK}`;
  const innerWidth = CARD_WIDTH - bodyInset * 2;
  const columnWidth = (innerWidth - cellGap) / 2;
  const rowHeights = rows.map((row) => {
    const cellWidth = row.length === 1 ? innerWidth : columnWidth;
    return Math.max(...row.map((field) => {
      const lines = wrapText(mctx, field.value, cellWidth - cellPadding * 2);
      return cellPadding * 2 + labelSize + 6 + lines.length * valueLineHeight;
    }));
  });
  const firstBottomRow = rows.findIndex((row) => row.some((field) => field.label === "AC" || field.label === "UIC"));
  const topRowCount = firstBottomRow >= 0 ? firstBottomRow : Math.min(4, rows.length);
  const bottomRowCount = Math.max(0, rows.length - topRowCount);
  const topRowsHeight = rowHeights.slice(0, topRowCount).reduce((a, b) => a + b, 0)
    + Math.max(0, topRowCount - 1) * cellGap;
  const bottomRowsHeight = rowHeights.slice(topRowCount).reduce((a, b) => a + b, 0)
    + Math.max(0, bottomRowCount - 1) * cellGap;
  const totalHeight = CARD_HEIGHT;

  canvas.width = CARD_WIDTH * SCALE;
  canvas.height = totalHeight * SCALE;
  canvas.style.width = CARD_WIDTH + "px";
  canvas.style.height = totalHeight + "px";
  ctx.scale(SCALE, SCALE);

  // Crop the original portrait uniformly; never squash the locomotive.
  // Identity lettering uses the same transform as the new 540 × 675 artwork.
  ctx.fillStyle = COLORS.fallbackBg;
  roundRect(ctx, 0, 0, CARD_WIDTH, totalHeight, 22);
  ctx.fill();

  if (backgroundImage) {
    ctx.save();
    roundRect(ctx, 0, 0, CARD_WIDTH, totalHeight, 22);
    ctx.clip();
    const photoScale = Math.max(CARD_WIDTH / 540, totalHeight / 675);
    ctx.translate((CARD_WIDTH - 540 * photoScale) / 2, (totalHeight - 675 * photoScale) / 2);
    ctx.scale(photoScale, photoScale);
    ctx.drawImage(backgroundImage, 0, 0, 540, 675);
    drawDynamicLocoIdentity(ctx, entry);
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
  const movementTitle = entry.movementType === "arrival" && entry.isDotTrain ? "Departure Movement · DOT" : entry.movementType === "arrival"
    ? "Arrival Movement"
    : entry.movementType === "shed_shunting" ? "Shed Shunting" : "Departure Movement";
  ctx.fillText(movementTitle, 18, 42);
  ctx.font = `700 12.5px ${FONT_STACK}`;
  ctx.fillStyle = "#ffe3ba";
  ctx.fillText(`LPS Name · ${lpsName}`, 18, 67);
  ctx.shadowBlur = 0;
  ctx.fillStyle = COLORS.accent;
  ctx.fillRect(18, 82, 74, 3);
  ctx.fillStyle = "rgba(255, 255, 255, 0.82)";
  ctx.font = `700 9px ${FONT_STACK}`;
  ctx.fillText(formatLongDate(entry.date), 103, 86);

  // Split the seven detail rows around the locomotive: four rows at the top
  // and the remaining rows at the bottom leave a clear portrait window.
  let topY = headerHeight + bodyInset;
  let bottomY = Math.max(topY + topRowsHeight + 72, totalHeight - bottomRowsHeight - 28);
  rows.forEach((row, rowIndex) => {
    const isTopRow = rowIndex < topRowCount;
    const y = isTopRow ? topY : bottomY;
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
      ctx.font = `700 ${labelSize}px ${FONT_STACK}`;
      ctx.fillText(field.label.toUpperCase(), x + cellPadding, labelY);

      ctx.fillStyle = COLORS.value;
      ctx.font = `700 ${valueSize}px ${FONT_STACK}`;
      const lines = wrapText(ctx, field.value, cellWidth - cellPadding * 2);
      lines.forEach((line, lineIndex) => {
        ctx.fillText(line, x + cellPadding, labelY + 5 + (lineIndex + 1) * valueLineHeight);
      });
    });
    if (isTopRow) topY += rowHeight + cellGap;
    else bottomY += rowHeight + cellGap;
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

function buildShareCaption(entry) {
  if (entry.movementType === "arrival" && entry.isDotTrain) {
    return `ARRIVAL TN: ${entry.trainNumber || "—"}\nDEP TRAIN NUMBER: ${entry.dotTrainNumber || "—"}`;
  }
  if (entry.movementType === "arrival") return `ARRIVAL TN: ${entry.trainNumber || "—"}`;
  if (entry.movementType === "shed_shunting") return `SHED SHUNTING · LOCO: ${entry.locomotiveNumberSnapshot || "—"}`;
  return `DEP TRAIN NUMBER: ${entry.trainNumber || "—"}`;
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
  drawCard(canvas, fields, backgroundImage, lpsName, entry);

  const caption = buildShareCaption(entry);
  // Encode before the tap so native sharing retains the user's activation.
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Could not create the share image. Please try again.");
  const filename = `duty-card-${entry.date || "entry"}.png`;
  const file = new File([blob], filename, { type: "image/png" });
  const captionInput = el("textarea", {
    readonly: true, "aria-label": "Image caption", rows: 2,
    style: "width:100%;box-sizing:border-box;resize:none;",
  });
  captionInput.value = caption;
  const copyCaptionBtn = el("button", {
    class: "secondary-btn", type: "button",
    onclick: async () => {
      try {
        await navigator.clipboard.writeText(caption);
        copyCaptionBtn.textContent = "Caption copied";
      } catch {
        captionInput.focus();
        captionInput.select();
        copyCaptionBtn.textContent = "Select and copy the caption above";
      }
    },
  }, "Copy Caption");
  const shareBtn = el("button", { class: "primary-btn", onclick: async () => {
    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: "Duty Card", text: caption });
        return;
      } catch (error) {
        if (error.name === "AbortError") return;
      }
    }
    const url = URL.createObjectURL(blob);
    const link = el("a", { href: url, download: filename });
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
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
    el("p", {}, "1080 × 1350 px · 4:5 image · Save or share, then tap Done."),
    canvasWrap,
    captionInput,
    copyCaptionBtn,
    el("p", {}, "If WhatsApp does not attach the caption, tap Copy Caption and paste it before sending."),
    shareBtn,
    doneBtn,
  ]);
  overlay.appendChild(card);
  document.body.appendChild(overlay);
}
