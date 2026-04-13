export const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

export const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// Returns 'YYYY-MM-01' for a given year + 1-indexed month
export function periodMonthString(year, month1) {
  const mm = String(month1).padStart(2, '0');
  return `${year}-${mm}-01`;
}

// Parse 'YYYY-MM' into { year, month1 }
export function parseMonthParam(s) {
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  return { year: Number(m[1]), month1: Number(m[2]) };
}

export function monthParamOf(year, month1) {
  return `${year}-${String(month1).padStart(2, '0')}`;
}

export function todayMonthParam() {
  const d = new Date();
  return monthParamOf(d.getFullYear(), d.getMonth() + 1);
}

// Build a list of month params from (startYear, Jan) to (endYear, Dec), newest first
export function monthOptions(startYear, endYear) {
  const out = [];
  for (let y = endYear; y >= startYear; y--) {
    for (let m = 12; m >= 1; m--) {
      out.push({ value: monthParamOf(y, m), label: `${MONTHS_LONG[m - 1]} ${y}` });
    }
  }
  return out;
}
