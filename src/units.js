// Unit handling. Model always stores millimeters; UI can display/edit in mm or inch.

const MM_PER_IN = 25.4;

export const UNITS = {
  mm: {
    label: "mm",
    toMm: (v) => v,
    fromMm: (mm) => mm,
    step: 0.1,
    decimals: 1,
  },
  in: {
    label: "in",
    toMm: (v) => v * MM_PER_IN,
    fromMm: (mm) => mm / MM_PER_IN,
    step: 0.01,
    decimals: 2,
  },
};

export function format(mm, unit) {
  const u = UNITS[unit];
  return u.fromMm(mm).toFixed(u.decimals);
}

export function formatWithUnit(mm, unit) {
  return `${format(mm, unit)} ${UNITS[unit].label}`;
}
