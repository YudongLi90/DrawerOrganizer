// Split-tree data model for the drawer designer.
// Coordinates are in millimeters, absolute within the drawer.

let idCounter = 0;
export const nextId = () => `c${++idCounter}`;

export function makeDesign({ L = 300, W = 200, H = 50, dividerThickness = 3 } = {}) {
  const t = dividerThickness;
  return {
    version: 1,
    drawer: { L, W, H },
    dividerThickness,
    // Canvas convention: W is horizontal (x-axis), L is vertical (y-axis).
    // Root is inset by `t` on all sides — outer walls are as thick as dividers.
    root: makeLeaf(t, t, Math.max(0, W - 2 * t), Math.max(0, L - 2 * t)),
  };
}

export function makeLeaf(x, y, w, h) {
  return { id: nextId(), x, y, w, h, split: null };
}

// Update the drawer dimensions. If splits exist, the subtree is remapped
// proportionally while keeping divider thickness fixed.
export function setDrawer(design, { L, W, H, dividerThickness }) {
  if (Number.isFinite(L)) design.drawer.L = L;
  if (Number.isFinite(W)) design.drawer.W = W;
  if (Number.isFinite(H)) design.drawer.H = H;
  if (Number.isFinite(dividerThickness)) design.dividerThickness = dividerThickness;
  const t = design.dividerThickness;
  // Root spans the drawer minus outer walls of thickness `t` on each side.
  const innerW = Math.max(0, design.drawer.W - 2 * t);
  const innerL = Math.max(0, design.drawer.L - 2 * t);
  remapSubtree(design.root, "x", t, innerW, t);
  remapSubtree(design.root, "y", t, innerL, t);
  return design;
}

// Depth-first search for a cell by id. Returns the cell or null.
export function findCell(cell, id) {
  if (cell.id === id) return cell;
  if (!cell.split) return null;
  for (const c of cell.split.children) {
    const found = findCell(c, id);
    if (found) return found;
  }
  return null;
}

// Collect all leaf cells (in-order) for hit-testing and UI.
export function leaves(cell, out = []) {
  if (!cell.split) { out.push(cell); return out; }
  for (const c of cell.split.children) leaves(c, out);
  return out;
}

// Split a leaf cell at its midpoint. Orientation "vertical" adds a vertical
// divider (children arranged left/right); "horizontal" adds a horizontal
// divider (children arranged top/bottom).
//
// Returns true on success, false if the cell isn't a leaf or is too small.
export function splitCell(design, cellId, orientation) {
  const cell = findCell(design.root, cellId);
  if (!cell || cell.split) return false;

  const t = design.dividerThickness;
  const minChild = 5; // mm — smallest allowed subsection

  if (orientation === "vertical") {
    if (cell.w < 2 * minChild + t) return false;
    const position = cell.x + cell.w / 2;
    const leftW = position - t / 2 - cell.x;
    const rightW = cell.x + cell.w - (position + t / 2);
    cell.split = {
      orientation,
      position,
      children: [
        makeLeaf(cell.x, cell.y, leftW, cell.h),
        makeLeaf(position + t / 2, cell.y, rightW, cell.h),
      ],
    };
  } else if (orientation === "horizontal") {
    if (cell.h < 2 * minChild + t) return false;
    const position = cell.y + cell.h / 2;
    const topH = position - t / 2 - cell.y;
    const botH = cell.y + cell.h - (position + t / 2);
    cell.split = {
      orientation,
      position,
      children: [
        makeLeaf(cell.x, cell.y, cell.w, topH),
        makeLeaf(cell.x, position + t / 2, cell.w, botH),
      ],
    };
  } else {
    return false;
  }
  return true;
}

// Minimum subsection size in mm along a split axis.
export const MIN_CHILD_MM = 5;

// Rewrite a subtree so that `cell` occupies [newStart, newStart+newSize] along `axis`
// ('x' or 'y'), preserving descendant proportions and keeping divider thicknesses
// fixed at `thickness`. Cells that don't split along `axis` just span the full extent.
function remapSubtree(cell, axis, newStart, newSize, thickness) {
  const posAttr = axis;
  const sizeAttr = axis === "x" ? "w" : "h";

  cell[posAttr] = newStart;
  cell[sizeAttr] = newSize;

  if (!cell.split) return;

  const splitAxis = cell.split.orientation === "vertical" ? "x" : "y";
  if (splitAxis !== axis) {
    // Split perpendicular to our axis: children span full extent along this axis.
    for (const child of cell.split.children) {
      remapSubtree(child, axis, newStart, newSize, thickness);
    }
    return;
  }
  // Split along our axis: preserve child proportions, keep divider thickness fixed.
  const [c1, c2] = cell.split.children;
  const oldA = c1[sizeAttr];
  const oldB = c2[sizeAttr];
  const oldUsable = oldA + oldB;
  const newUsable = Math.max(0, newSize - thickness);
  const ratio = oldUsable > 0 ? oldA / oldUsable : 0.5;
  const newA = ratio * newUsable;
  const newB = newUsable - newA;

  cell.split.position = newStart + newA + thickness / 2;
  remapSubtree(c1, axis, newStart, newA, thickness);
  remapSubtree(c2, axis, newStart + newA + thickness, newB, thickness);
}

// Move the divider inside `cell` to `newPosition` (absolute mm coordinate along the
// split axis). Clamps to keep both children ≥ MIN_CHILD_MM. Returns true if moved.
export function moveDivider(design, cellId, newPosition) {
  const cell = findCell(design.root, cellId);
  if (!cell || !cell.split) return false;
  const t = design.dividerThickness;
  const axis = cell.split.orientation === "vertical" ? "x" : "y";
  const sizeAttr = axis === "x" ? "w" : "h";
  const cellStart = cell[axis];
  const cellSize = cell[sizeAttr];

  const minPos = cellStart + MIN_CHILD_MM + t / 2;
  const maxPos = cellStart + cellSize - MIN_CHILD_MM - t / 2;
  if (maxPos < minPos) return false;
  const clamped = Math.max(minPos, Math.min(maxPos, newPosition));

  const newA = clamped - t / 2 - cellStart;
  const newB = cellStart + cellSize - clamped - t / 2;
  const [c1, c2] = cell.split.children;
  remapSubtree(c1, axis, cellStart, newA, t);
  remapSubtree(c2, axis, clamped + t / 2, newB, t);
  cell.split.position = clamped;
  return true;
}

// Return the array of ancestors from root down to (and including) `cellId`,
// or null if not found. Used to locate the nearest divider affecting a cell.
export function findPath(root, cellId, path = []) {
  path.push(root);
  if (root.id === cellId) return path.slice();
  if (root.split) {
    for (const c of root.split.children) {
      const p = findPath(c, cellId, path);
      if (p) return p;
    }
  }
  path.pop();
  return null;
}

// Find the nearest ancestor cell whose split affects `cellId` on the given axis.
// Returns { ancestor, side: 0|1 } (side is which child of the ancestor contains
// the target), or null if the cell spans the drawer on that axis.
function nearestAncestorOnAxis(design, cellId, axis) {
  const path = findPath(design.root, cellId);
  if (!path || path.length < 2) return null;
  const orient = axis === "x" ? "vertical" : "horizontal";
  for (let i = path.length - 2; i >= 0; i--) {
    const anc = path[i];
    if (anc.split && anc.split.orientation === orient) {
      const childIdx = anc.split.children.indexOf(path[i + 1]);
      return { ancestor: anc, side: childIdx };
    }
  }
  return null;
}

// Return true if the cell's dimension on `axis` ('x' = width, 'y' = height) is
// editable — i.e. there is an ancestor divider on that axis to move.
export function canResize(design, cellId, axis) {
  return nearestAncestorOnAxis(design, cellId, axis) !== null;
}

// Attempt to set the cell's size along `axis` to `targetMm` by moving the
// nearest ancestor divider on that axis. Returns true if the design changed.
export function resizeCell(design, cellId, axis, targetMm) {
  const info = nearestAncestorOnAxis(design, cellId, axis);
  if (!info) return false;
  const { ancestor, side } = info;
  const t = design.dividerThickness;
  const sizeAttr = axis === "x" ? "w" : "h";
  const ancStart = ancestor[axis];
  const ancSize = ancestor[sizeAttr];
  const newPosition = side === 0
    ? ancStart + targetMm + t / 2
    : ancStart + ancSize - targetMm - t / 2;
  return moveDivider(design, ancestor.id, newPosition);
}

// Collapse the split at `cellId` back into a leaf spanning the parent's region.
// Returns true if a split was removed.
export function removeSplit(design, cellId) {
  const cell = findCell(design.root, cellId);
  if (!cell || !cell.split) return false;
  cell.split = null;
  return true;
}
