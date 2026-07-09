// Pure SVG renderer: reads a Design, writes DOM into the target <svg> element.
// Scales drawer mm coordinates to fit the available viewport while preserving aspect.

import { format, UNITS } from "./units.js";
import { canResize } from "./model.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const VIEWPORT_PADDING = 20; // px around the drawing

function el(name, attrs = {}) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

// A leaf cell's usable dimensions above the perimeter trim (Z > perim height).
// Perimeter walls have quarter-round cross-section: thickness `t` at the base,
// tapering to zero at Z = t. Above Z = t there's no wall material, so cells
// touching a perimeter reclaim `t` per touching edge.
function upperSize(design, cell, t) {
  const { W, L } = design.drawer;
  const eps = 1e-6;
  const touchesLeft   = cell.x <= t + eps;
  const touchesRight  = cell.x + cell.w >= W - t - eps;
  const touchesTop    = cell.y <= t + eps;
  const touchesBottom = cell.y + cell.h >= L - t - eps;
  return {
    w: cell.w + (touchesLeft ? t : 0) + (touchesRight ? t : 0),
    h: cell.h + (touchesTop ? t : 0) + (touchesBottom ? t : 0),
  };
}

// Compute a scale that fits the drawer W (horizontal) × L (vertical) into the container box.
function computeScale(container, drawer) {
  const box = container.getBoundingClientRect();
  const availW = Math.max(100, box.width - 2 * VIEWPORT_PADDING);
  const availH = Math.max(100, box.height - 2 * VIEWPORT_PADDING);
  const s = Math.min(availW / drawer.W, availH / drawer.L);
  return s;
}

export function render(svg, design, { selectedId = null, unit = "mm" } = {}) {
  // Clear
  while (svg.firstChild) svg.removeChild(svg.firstChild);

  const scale = computeScale(svg.parentElement, design.drawer);
  const drawWpx = design.drawer.W * scale;
  const drawHpx = design.drawer.L * scale;
  const NOTE_HEIGHT = 24; // extra space under the drawer for the legend note
  const totalWpx = drawWpx + 2 * VIEWPORT_PADDING;
  const totalHpx = drawHpx + 2 * VIEWPORT_PADDING + NOTE_HEIGHT;

  svg.setAttribute("width", totalWpx);
  svg.setAttribute("height", totalHpx);
  svg.setAttribute("viewBox", `0 0 ${totalWpx} ${totalHpx}`);

  // Defs: a 10mm grid pattern that lives inside the drawer only.
  const defs = el("defs");
  const gridStep = 10 * scale; // 10 mm in px
  const pattern = el("pattern", {
    id: "grid-pattern",
    width: gridStep, height: gridStep,
    patternUnits: "userSpaceOnUse",
  });
  pattern.appendChild(el("path", {
    d: `M ${gridStep} 0 L 0 0 0 ${gridStep}`,
    fill: "none",
    stroke: "var(--grid)",
    "stroke-width": 1,
  }));
  defs.appendChild(pattern);
  svg.appendChild(defs);

  const gRoot = el("g", { transform: `translate(${VIEWPORT_PADDING}, ${VIEWPORT_PADDING})` });
  svg.appendChild(gRoot);

  // Drawer outline (outer, painted like the walls themselves).
  gRoot.appendChild(el("rect", {
    x: 0, y: 0,
    width: drawWpx, height: drawHpx,
    fill: "var(--wall-fill)",
    stroke: "var(--drawer-stroke)",
    "stroke-width": 2,
    rx: 6,
  }));

  // Inner usable area (drawer floor) — inset by wall thickness on all sides.
  const tpxInner = design.dividerThickness * scale;
  const innerX = tpxInner;
  const innerY = tpxInner;
  const innerW = Math.max(0, drawWpx - 2 * tpxInner);
  const innerH = Math.max(0, drawHpx - 2 * tpxInner);
  gRoot.appendChild(el("rect", {
    x: innerX, y: innerY,
    width: innerW, height: innerH,
    fill: "var(--drawer-fill)",
  }));
  gRoot.appendChild(el("rect", {
    x: innerX, y: innerY,
    width: innerW, height: innerH,
    fill: "url(#grid-pattern)",
    "pointer-events": "none",
  }));

  // Recursively render cells
  renderCell(gRoot, design, design.root, scale, design.dividerThickness, selectedId, unit);

  // Dimension labels
  const label = (x, y, text, anchor = "middle") =>
    Object.assign(el("text", {
      x, y, "text-anchor": anchor,
      "font-size": 11,
      fill: "var(--muted)",
    }), { textContent: text });

  const dimGroup = el("g");
  const uLabel = UNITS[unit].label;
  dimGroup.appendChild(label(drawWpx / 2, drawHpx + 14, `W = ${format(design.drawer.W, unit)} ${uLabel}`));
  const rotY = el("text", {
    x: -6, y: drawHpx / 2,
    "text-anchor": "end",
    "font-size": 11,
    fill: "var(--muted)",
    transform: `rotate(-90 -6 ${drawHpx / 2})`,
  });
  rotY.textContent = `L = ${format(design.drawer.L, unit)} ${uLabel}`;
  dimGroup.appendChild(rotY);
  // Legend explaining the "upper (lower)" size format on cells that touch a
  // perimeter wall. The perimeter is a 10 mm-tall quarter-round, so above
  // Z = 10 mm the cell reclaims that space.
  const note = el("text", {
    x: drawWpx / 2,
    y: drawHpx + 32,
    "text-anchor": "middle",
    "font-size": 13,
    "font-style": "italic",
    fill: "var(--muted)",
  });
  note.textContent =
    `Cells touching a wall show "upper (lower)": upper = usable size above the ${format(design.dividerThickness, unit)} ${uLabel} trim, lower = at trim level.`;
  dimGroup.appendChild(note);
  gRoot.appendChild(dimGroup);
  return scale;
}

function renderCell(parentG, design, cell, scale, thickness, selectedId, unit) {
  if (!cell.split) {
    const isSelected = cell.id === selectedId;
    const rect = el("rect", {
      x: cell.x * scale,
      y: cell.y * scale,
      width: cell.w * scale,
      height: cell.h * scale,
      fill: isSelected ? "rgba(99, 102, 241, 0.12)" : "transparent",
      stroke: isSelected ? "var(--accent)" : "none",
      "stroke-width": isSelected ? 2 : 0,
      "data-cell-id": cell.id,
      style: "cursor: pointer;",
      rx: 2,
    });
    parentG.appendChild(rect);

    // Dimension labels inside the cell (only if it fits).
    const wpx = cell.w * scale;
    const hpx = cell.h * scale;
    if (wpx > 42 && hpx > 26) {
      const cx = (cell.x + cell.w / 2) * scale;
      const cy = (cell.y + cell.h / 2) * scale;
      const wEditable = canResize(design, cell.id, "x");
      const hEditable = canResize(design, cell.id, "y");
      // Perimeter walls are quarter-round: thickness `t` × height `t` (== 10mm).
      // Above the trim (Z > t) the cell extends to the drawer's outer edge, so
      // its "upper" size is larger than the "lower" size by `t` per perim edge
      // the cell touches. Show "W upper (lower)" when they differ.
      const upper = upperSize(design, cell, thickness);
      // Upper line: L (cell's length = extent along drawer's Y/length axis).
      const lLabel = el("text", {
        x: cx, y: cy - 2,
        "text-anchor": "middle",
        "font-size": 11,
        "font-weight": isSelected ? 600 : 500,
        fill: isSelected ? "var(--accent)" : "var(--muted)",
        class: `dim-label ${hEditable ? "" : "fixed"}`,
      });
      lLabel.textContent = upper.h > cell.h + 1e-6
        ? `L ${format(upper.h, unit)} (${format(cell.h, unit)})`
        : `L ${format(cell.h, unit)}`;
      if (isSelected && hEditable) {
        lLabel.setAttribute("data-dim-cell-id", cell.id);
        lLabel.setAttribute("data-dim-axis", "y");
      } else {
        lLabel.setAttribute("pointer-events", "none");
      }
      parentG.appendChild(lLabel);
      // Lower line: W (cell's width = extent along drawer's X/width axis).
      const wLabel = el("text", {
        x: cx, y: cy + 12,
        "text-anchor": "middle",
        "font-size": 11,
        "font-weight": isSelected ? 600 : 500,
        fill: isSelected ? "var(--accent)" : "var(--muted)",
        class: `dim-label ${wEditable ? "" : "fixed"}`,
      });
      wLabel.textContent = upper.w > cell.w + 1e-6
        ? `W ${format(upper.w, unit)} (${format(cell.w, unit)})`
        : `W ${format(cell.w, unit)}`;
      if (isSelected && wEditable) {
        wLabel.setAttribute("data-dim-cell-id", cell.id);
        wLabel.setAttribute("data-dim-axis", "x");
      } else {
        wLabel.setAttribute("pointer-events", "none");
      }
      parentG.appendChild(wLabel);
    }
    return;
  }
  // Non-leaf: recurse into children, then draw divider on top.
  for (const child of cell.split.children) renderCell(parentG, design, child, scale, thickness, selectedId, unit);

  const tpx = thickness * scale;
  const isVertical = cell.split.orientation === "vertical";
  const isSelected = cell.id === selectedId;
  const dividerAttrs = isVertical
    ? {
        x: (cell.split.position - thickness / 2) * scale,
        y: cell.y * scale,
        width: tpx,
        height: cell.h * scale,
      }
    : {
        x: cell.x * scale,
        y: (cell.split.position - thickness / 2) * scale,
        width: cell.w * scale,
        height: tpx,
      };
  parentG.appendChild(el("rect", {
    ...dividerAttrs,
    fill: isSelected ? "var(--accent)" : "var(--divider)",
    "data-divider-cell-id": cell.id,
    "data-cell-id": cell.id,
    style: `cursor: ${isVertical ? "ew-resize" : "ns-resize"};`,
    rx: Math.min(2, tpx / 2),
  }));
}
