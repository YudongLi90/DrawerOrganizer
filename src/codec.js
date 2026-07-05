// Encode/decode a Design to a shareable, human-readable JSON string.

const CURRENT_VERSION = 1;

export function encode(design) {
  const out = {
    version: CURRENT_VERSION,
    units: "mm",
    drawer: {
      L: round3(design.drawer.L),
      W: round3(design.drawer.W),
      H: round3(design.drawer.H),
    },
    dividerThickness: round3(design.dividerThickness),
    root: stripCell(design.root),
  };
  return JSON.stringify(out, null, 2);
}

export function decode(str) {
  if (typeof str !== "string" || !str.trim()) throw new Error("empty code");
  let parsed;
  try { parsed = JSON.parse(str); }
  catch (e) { throw new Error("not valid JSON"); }
  if (!parsed || typeof parsed !== "object") throw new Error("payload is not an object");
  const version = parsed.version ?? parsed.v;
  if (version !== CURRENT_VERSION) throw new Error(`unsupported version: ${version}`);
  if (!parsed.drawer || !Number.isFinite(parsed.drawer.L) || !Number.isFinite(parsed.drawer.W)) {
    throw new Error("missing drawer dimensions");
  }
  const thickness = parsed.dividerThickness ?? parsed.t;
  return {
    version: CURRENT_VERSION,
    drawer: {
      L: Number(parsed.drawer.L),
      W: Number(parsed.drawer.W),
      H: Number(parsed.drawer.H) || 0,
    },
    dividerThickness: Number(thickness) || 3,
    root: rehydrateCell(parsed.root),
  };
}

function stripCell(cell) {
  const c = {
    id: cell.id,
    x: round3(cell.x),
    y: round3(cell.y),
    w: round3(cell.w),
    h: round3(cell.h),
  };
  if (cell.split) {
    c.split = {
      orientation: cell.split.orientation,
      position: round3(cell.split.position),
      children: cell.split.children.map(stripCell),
    };
  }
  return c;
}

let idCounter = 0;
function rehydrateCell(raw) {
  if (!raw || typeof raw !== "object") throw new Error("bad cell");
  const cell = {
    id: typeof raw.id === "string" ? raw.id : `r${++idCounter}`,
    x: Number(raw.x),
    y: Number(raw.y),
    w: Number(raw.w),
    h: Number(raw.h),
    split: null,
  };
  for (const k of ["x", "y", "w", "h"]) {
    if (!Number.isFinite(cell[k])) throw new Error(`bad cell.${k}`);
  }
  if (raw.split) {
    const s = raw.split;
    if (s.orientation !== "vertical" && s.orientation !== "horizontal") {
      throw new Error("bad split.orientation");
    }
    if (!Array.isArray(s.children) || s.children.length !== 2) {
      throw new Error("split.children must have length 2");
    }
    cell.split = {
      orientation: s.orientation,
      position: Number(s.position),
      children: s.children.map(rehydrateCell),
    };
    if (!Number.isFinite(cell.split.position)) throw new Error("bad split.position");
  }
  return cell;
}

function round3(n) { return Math.round(n * 1000) / 1000; }
