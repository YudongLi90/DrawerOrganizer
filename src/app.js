import { makeDesign, setDrawer, splitCell, findCell, moveDivider, resizeCell, canResize, removeSplit } from "./model.js";
import { render } from "./render.js";
import { CONFIG } from "./config.js";
import { UNITS, format } from "./units.js";
import { encode, decode } from "./codec.js";

const svg = document.getElementById("canvas");
const inputs = {
  L: document.getElementById("in-L"),
  W: document.getElementById("in-W"),
  H: document.getElementById("in-H"),
};
const unitToggle = document.getElementById("in-unit");
const unitButtons = unitToggle.querySelectorAll("button[data-unit-value]");
const unitSuffixes = document.querySelectorAll("[data-unit]");
const btnSplitV = document.getElementById("btn-split-v");
const btnSplitH = document.getElementById("btn-split-h");
const btnRemoveSplit = document.getElementById("btn-remove-split");
const selInfo = document.getElementById("sel-info");
const selW = document.getElementById("sel-w");
const selH = document.getElementById("sel-h");
const selWFixed = document.getElementById("sel-w-fixed");
const selHFixed = document.getElementById("sel-h-fixed");
const canvasEditor = document.getElementById("canvas-editor");
const canvasWrap = document.getElementById("canvas-wrap");
const txExport = document.getElementById("tx-export");
const txImport = document.getElementById("tx-import");
const btnCopy = document.getElementById("btn-copy");
const btnReset = document.getElementById("btn-reset");
const btnImport = document.getElementById("btn-import");
const importMsg = document.getElementById("import-msg");

let unit = unitToggle.dataset.value;

function readInputMm(input) {
  const v = Number(input.value);
  if (!Number.isFinite(v)) return NaN;
  return UNITS[unit].toMm(v);
}
function writeInputFromMm(input, mm) {
  input.value = format(mm, unit);
}

let design = makeDesign({
  L: readInputMm(inputs.L),
  W: readInputMm(inputs.W),
  H: readInputMm(inputs.H),
  dividerThickness: CONFIG.dividerThickness,
});

let selectedId = null;
let currentScale = 1;

function redraw() {
  currentScale = render(svg, design, { selectedId, unit });
  updateSelectionUI();
  updateExport();
}

function updateSelectionUI() {
  const cell = selectedId ? findCell(design.root, selectedId) : null;
  const isLeaf = !!cell && !cell.split;
  const isSplit = !!cell && !!cell.split;
  btnSplitV.disabled = !isLeaf;
  btnSplitH.disabled = !isLeaf;
  btnRemoveSplit.disabled = !isSplit;
  const uLabel = UNITS[unit].label;
  const hint = `<div class="hint">Click a cell in the canvas to select it.</div>`;
  if (cell) {
    const kind = isSplit ? "split cell" : "leaf";
    selInfo.innerHTML =
      `<strong>${cell.id}</strong> · ${kind} · ${format(cell.w, unit)} × ${format(cell.h, unit)} ${uLabel}${hint}`;
  } else {
    selInfo.innerHTML = hint;
  }
  applyDimField(selW, selWFixed, cell, isLeaf ? canResize(design, cell.id, "x") : false, cell?.w, uLabel);
  applyDimField(selH, selHFixed, cell, isLeaf ? canResize(design, cell.id, "y") : false, cell?.h, uLabel);
}

function applyDimField(inputEl, fixedEl, cell, editable, mmValue, uLabel) {
  if (!cell || cell.split) {
    inputEl.hidden = false;
    fixedEl.hidden = true;
    inputEl.value = "";
    inputEl.disabled = true;
    return;
  }
  if (editable) {
    inputEl.hidden = false;
    fixedEl.hidden = true;
    inputEl.disabled = false;
    if (document.activeElement !== inputEl) inputEl.value = format(mmValue, unit);
  } else {
    inputEl.hidden = true;
    fixedEl.hidden = false;
    fixedEl.textContent = `${format(mmValue, unit)} ${uLabel} — fills drawer`;
  }
}

function updateUnitDisplay() {
  const uLabel = UNITS[unit].label;
  for (const s of unitSuffixes) s.textContent = uLabel;
  const step = UNITS[unit].step;
  for (const input of Object.values(inputs)) input.step = step;
  selW.step = step;
  selH.step = step;
  canvasEditor.step = step;
}

function updateExport() {
  txExport.value = encode(design);
}

function onInputChange() {
  setDrawer(design, {
    L: readInputMm(inputs.L),
    W: readInputMm(inputs.W),
    H: readInputMm(inputs.H),
  });
  redraw();
}

for (const el of Object.values(inputs)) el.addEventListener("input", onInputChange);

unitToggle.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-unit-value]");
  if (!btn) return;
  const value = btn.dataset.unitValue;
  if (value === unit) return;
  unit = value;
  unitToggle.dataset.value = value;
  for (const b of unitButtons) {
    const active = b === btn;
    b.classList.toggle("active", active);
    b.setAttribute("aria-checked", String(active));
  }
  updateUnitDisplay();
  writeInputFromMm(inputs.L, design.drawer.L);
  writeInputFromMm(inputs.W, design.drawer.W);
  writeInputFromMm(inputs.H, design.drawer.H);
  redraw();
});

window.addEventListener("resize", redraw);

// --- Interaction: selection + divider drag -------------------------------------

let dragState = null;
let lastDragMoved = false;

svg.addEventListener("pointerdown", (e) => {
  const divider = e.target.closest("[data-divider-cell-id]");
  if (!divider) return;
  const cellId = divider.getAttribute("data-divider-cell-id");
  const cell = findCell(design.root, cellId);
  if (!cell || !cell.split) return;
  const axis = cell.split.orientation === "vertical" ? "x" : "y";
  divider.setPointerCapture(e.pointerId);
  dragState = {
    cellId,
    axis,
    dividerEl: divider,
    startPointer: axis === "x" ? e.clientX : e.clientY,
    startPos: cell.split.position,
    pointerId: e.pointerId,
    moved: false,
  };
  lastDragMoved = false;
  e.preventDefault();
});

svg.addEventListener("pointermove", (e) => {
  if (!dragState) return;
  const nowPointer = dragState.axis === "x" ? e.clientX : e.clientY;
  const deltaPx = nowPointer - dragState.startPointer;
  // Ignore sub-pixel jitter so a click-without-drag still selects.
  if (Math.abs(deltaPx) < 2 && !dragState.moved) return;
  const deltaMm = deltaPx / currentScale;
  if (moveDivider(design, dragState.cellId, dragState.startPos + deltaMm)) {
    dragState.moved = true;
    redraw();
  }
});

function endDrag() {
  if (!dragState) return;
  lastDragMoved = dragState.moved;
  try { dragState.dividerEl.releasePointerCapture(dragState.pointerId); } catch {}
  dragState = null;
}
svg.addEventListener("pointerup", endDrag);
svg.addEventListener("pointercancel", endDrag);

svg.addEventListener("click", (e) => {
  // Dimension label edit takes priority.
  const dimLabel = e.target.closest("[data-dim-cell-id]");
  if (dimLabel) {
    openCanvasEditor(dimLabel);
    return;
  }
  // If this click came at the end of a drag, don't change selection.
  if (lastDragMoved) { lastDragMoved = false; return; }
  const cellTarget = e.target.closest("[data-cell-id]");
  selectedId = cellTarget ? cellTarget.getAttribute("data-cell-id") : null;
  hideCanvasEditor();
  redraw();
});

// --- In-canvas dimension editing -----------------------------------------------

let editorContext = null;

function openCanvasEditor(labelEl) {
  const cellId = labelEl.getAttribute("data-dim-cell-id");
  const axis = labelEl.getAttribute("data-dim-axis");
  const cell = findCell(design.root, cellId);
  if (!cell) return;
  const mm = axis === "x" ? cell.w : cell.h;
  const labelRect = labelEl.getBoundingClientRect();
  const wrapRect = canvasWrap.getBoundingClientRect();
  canvasEditor.hidden = false;
  canvasEditor.value = format(mm, unit);
  canvasEditor.style.left = `${labelRect.left - wrapRect.left + labelRect.width / 2 - 42}px`;
  canvasEditor.style.top = `${labelRect.top - wrapRect.top - 6}px`;
  editorContext = { cellId, axis };
  canvasEditor.focus();
  canvasEditor.select();
}

function hideCanvasEditor() {
  canvasEditor.hidden = true;
  editorContext = null;
}

function commitCanvasEditor() {
  if (!editorContext) return;
  const v = Number(canvasEditor.value);
  if (Number.isFinite(v) && v > 0) {
    const mm = UNITS[unit].toMm(v);
    resizeCell(design, editorContext.cellId, editorContext.axis, mm);
  }
  hideCanvasEditor();
  redraw();
}
canvasEditor.addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); commitCanvasEditor(); }
  else if (e.key === "Escape") { e.preventDefault(); hideCanvasEditor(); }
});
canvasEditor.addEventListener("blur", () => { if (editorContext) commitCanvasEditor(); });

// --- Split / remove buttons ----------------------------------------------------

btnSplitV.addEventListener("click", () => {
  if (!selectedId) return;
  const parent = findCell(design.root, selectedId);
  if (splitCell(design, selectedId, "vertical")) {
    // Vertical split → left/right children; select the left (first) child.
    selectedId = parent.split.children[0].id;
    redraw();
  }
});
btnSplitH.addEventListener("click", () => {
  if (!selectedId) return;
  const parent = findCell(design.root, selectedId);
  if (splitCell(design, selectedId, "horizontal")) {
    // Horizontal split → top/bottom children; select the top (first) child.
    selectedId = parent.split.children[0].id;
    redraw();
  }
});
btnRemoveSplit.addEventListener("click", () => {
  if (!selectedId) return;
  if (removeSplit(design, selectedId)) { autoSelectIfSingleLeaf(); redraw(); }
});

// If the design has only one leaf cell (the root), select it automatically —
// there's no ambiguity about what the user wants to act on.
function autoSelectIfSingleLeaf() {
  if (!design.root.split) selectedId = design.root.id;
}

function commitSelDim(axis, inputEl) {
  if (!selectedId) return;
  const v = Number(inputEl.value);
  if (!Number.isFinite(v) || v <= 0) return;
  const mm = UNITS[unit].toMm(v);
  resizeCell(design, selectedId, axis, mm);
  redraw();
}
selW.addEventListener("change", () => commitSelDim("x", selW));
selH.addEventListener("change", () => commitSelDim("y", selH));

// --- Export / Import / Reset ---------------------------------------------------

btnCopy.addEventListener("click", async () => {
  txExport.select();
  try {
    await navigator.clipboard.writeText(txExport.value);
    flashButton(btnCopy, "Copied");
  } catch {
    document.execCommand?.("copy");
    flashButton(btnCopy, "Copied");
  }
});

btnReset.addEventListener("click", () => {
  design = makeDesign({
    L: readInputMm(inputs.L),
    W: readInputMm(inputs.W),
    H: readInputMm(inputs.H),
    dividerThickness: CONFIG.dividerThickness,
  });
  selectedId = null;
  autoSelectIfSingleLeaf();
  redraw();
  goToStep(1);
});

btnImport.addEventListener("click", () => {
  const raw = txImport.value.trim();
  if (!raw) { setImportMsg("Paste a design code first.", "err"); return; }
  try {
    const loaded = decode(raw);
    design = loaded;
    selectedId = null;
    autoSelectIfSingleLeaf();
    writeInputFromMm(inputs.L, design.drawer.L);
    writeInputFromMm(inputs.W, design.drawer.W);
    writeInputFromMm(inputs.H, design.drawer.H);
    txImport.value = "";
    setImportMsg("Design loaded.", "ok");
    redraw();
  } catch (e) {
    setImportMsg(`Import failed: ${e.message}`, "err");
  }
});

function setImportMsg(text, kind) {
  importMsg.textContent = text;
  importMsg.style.color = kind === "err" ? "var(--danger)" : "var(--accent)";
  clearTimeout(setImportMsg._t);
  setImportMsg._t = setTimeout(() => { importMsg.textContent = ""; }, 4000);
}

function flashButton(btn, label) {
  const original = btn.textContent;
  btn.textContent = label;
  btn.disabled = true;
  setTimeout(() => { btn.textContent = original; btn.disabled = false; }, 900);
}

updateUnitDisplay();
autoSelectIfSingleLeaf();
requestAnimationFrame(redraw);

// --- Wizard step navigation ----------------------------------------------------

const stepEls = {
  1: document.getElementById("step-1"),
  2: document.getElementById("step-2"),
  3: document.getElementById("step-3"),
};
const stepIndicators = document.querySelectorAll(".step-indicator li");
const drawerSummary = document.getElementById("drawer-summary");
const btnNext1 = document.getElementById("btn-next-1");
const btnNext2 = document.getElementById("btn-next-2");
const btnBack2 = document.getElementById("btn-back-2");
const btnBack3 = document.getElementById("btn-back-3");

let currentStep = 1;

function goToStep(n) {
  currentStep = n;
  for (const [k, el] of Object.entries(stepEls)) {
    el.classList.toggle("active", Number(k) === n);
  }
  for (const li of stepIndicators) {
    const s = Number(li.dataset.step);
    li.classList.toggle("active", s === n);
    li.classList.toggle("done", s < n);
  }
  if (n === 2) {
    updateDrawerSummary();
    // Re-render because the canvas was hidden and needs new dimensions.
    requestAnimationFrame(redraw);
  }
  if (n === 3) updateExport();
}

function updateDrawerSummary() {
  const uLabel = UNITS[unit].label;
  drawerSummary.innerHTML =
    `L <strong>${format(design.drawer.L, unit)}</strong> · ` +
    `W <strong>${format(design.drawer.W, unit)}</strong> · ` +
    `H <strong>${format(design.drawer.H, unit)}</strong> ${uLabel}`;
}

function commitDimensionsFromInputs() {
  const L = readInputMm(inputs.L);
  const W = readInputMm(inputs.W);
  const H = readInputMm(inputs.H);
  if (!Number.isFinite(L) || !Number.isFinite(W) || !Number.isFinite(H) || L <= 0 || W <= 0 || H <= 0) {
    inputs.L.reportValidity?.();
    return false;
  }
  setDrawer(design, { L, W, H });
  return true;
}

btnNext1.addEventListener("click", () => {
  if (commitDimensionsFromInputs()) goToStep(2);
});
btnNext2.addEventListener("click", () => goToStep(3));
btnBack2.addEventListener("click", () => goToStep(1));
btnBack3.addEventListener("click", () => goToStep(2));

// Clickable step indicator: navigate to any step. Forward navigation from
// step 1 commits the current dimension inputs first.
for (const li of stepIndicators) {
  li.addEventListener("click", () => {
    const target = Number(li.dataset.step);
    if (target === currentStep) return;
    if (currentStep === 1 && target > 1) {
      if (!commitDimensionsFromInputs()) return;
    }
    goToStep(target);
  });
  li.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); li.click(); }
  });
}
