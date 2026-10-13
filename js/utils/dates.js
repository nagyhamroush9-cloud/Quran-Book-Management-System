/**
 * Date policy:
 * - Date-only fields (attendance, invoice dates, expenses) use local calendar YYYY-MM-DD.
 * - Billing period is YYYY-MM in the local timezone.
 * - Timestamps (createdAt) are ISO-8601 UTC.
 * - "Today" and month boundaries use the device local timezone.
 */

export function pad2(n) {
  return String(n).padStart(2, "0");
}

export function toLocalDateString(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function todayLocal() {
  return toLocalDateString(new Date());
}

export function currentPeriod(date = new Date()) {
  const d = date instanceof Date ? date : parseLocalDate(date);
  if (!d) return null;
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

export function parseLocalDate(yyyyMmDd) {
  if (!yyyyMmDd || typeof yyyyMmDd !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(yyyyMmDd);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const d = new Date(year, month - 1, day);
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
  return d;
}

export function parsePeriod(yyyyMm) {
  if (!yyyyMm || typeof yyyyMm !== "string") return null;
  const m = /^(\d{4})-(\d{2})$/.exec(yyyyMm);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  return { year, month };
}

export function periodLabel(yyyyMm, locale = "ar-EG") {
  const p = parsePeriod(yyyyMm);
  if (!p) return yyyyMm || "";
  const d = new Date(p.year, p.month - 1, 1);
  return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(d);
}

export function formatDate(yyyyMmDd, locale = "ar-EG") {
  const d = parseLocalDate(yyyyMmDd);
  if (!d) return yyyyMmDd || "—";
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(d);
}

export function formatDateTime(iso, locale = "ar-EG") {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export function addDays(yyyyMmDd, days) {
  const d = parseLocalDate(yyyyMmDd);
  if (!d) return null;
  d.setDate(d.getDate() + days);
  return toLocalDateString(d);
}

export function compareDate(a, b) {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

export function daysBetween(fromYmd, toYmd) {
  const a = parseLocalDate(fromYmd);
  const b = parseLocalDate(toYmd);
  if (!a || !b) return null;
  return Math.round((b - a) / 86400000);
}

export function startOfMonth(yyyyMm) {
  const p = parsePeriod(yyyyMm);
  if (!p) return null;
  return `${p.year}-${pad2(p.month)}-01`;
}

export function endOfMonth(yyyyMm) {
  const p = parsePeriod(yyyyMm);
  if (!p) return null;
  const d = new Date(p.year, p.month, 0);
  return toLocalDateString(d);
}

export function dueDateForPeriod(yyyyMm, dueDay) {
  const p = parsePeriod(yyyyMm);
  if (!p) return null;
  const last = new Date(p.year, p.month, 0).getDate();
  const day = Math.min(Math.max(Number(dueDay) || 1, 1), last);
  return `${p.year}-${pad2(p.month)}-${pad2(day)}`;
}

export function isValidDateString(value) {
  return Boolean(parseLocalDate(value));
}

export function shiftPeriod(yyyyMm, deltaMonths) {
  const p = parsePeriod(yyyyMm);
  if (!p) return null;
  const d = new Date(p.year, p.month - 1 + deltaMonths, 1);
  return currentPeriod(d);
}

export function gregorianHeadline(date = new Date()) {
  const weekday = new Intl.DateTimeFormat("ar-EG", { weekday: "long" }).format(date);
  const day = new Intl.DateTimeFormat("ar-EG", { day: "numeric" }).format(date);
  const month = new Intl.DateTimeFormat("ar-EG", { month: "long" }).format(date);
  const year = new Intl.DateTimeFormat("ar-EG", { year: "numeric" }).format(date);
  return `${weekday} ${day} ${month} ${year}`;
}

export function hijriHeadline(date = new Date()) {
  try {
    return new Intl.DateTimeFormat("ar-EG-u-ca-islamic", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(date);
  } catch {
    return "";
  }
}

export function periodsForYear(year, count = 12) {
  const list = [];
  for (let month = 1; month <= count; month += 1) {
    list.push(`${year}-${pad2(month)}`);
  }
  return list;
}

export function surroundingPeriods(center, before = 3, after = 2) {
  const list = [];
  for (let i = -before; i <= after; i += 1) {
    const period = shiftPeriod(center, i);
    if (period) list.push(period);
  }
  return list;
}
