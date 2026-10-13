/**
 * Exact money: integer piastres (1 جنيه = 100 قرش).
 * Never use floating-point arithmetic for totals.
 */

const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

export const PIASTRES_PER_POUND = 100n;

export function normalizeDigits(input) {
  const raw = String(input ?? "");
  let out = "";
  for (const ch of raw) {
    const a = ARABIC_DIGITS.indexOf(ch);
    if (a >= 0) {
      out += String(a);
      continue;
    }
    const p = PERSIAN_DIGITS.indexOf(ch);
    if (p >= 0) {
      out += String(p);
      continue;
    }
    out += ch;
  }
  return out;
}

/**
 * Parse a teacher-entered amount (pounds, optional decimals) into piastres.
 * Accepts 200, 200.50, 200,50, ٢٠٠. Accepts at most 2 decimal places.
 * @returns {{ ok: true, piastres: bigint } | { ok: false, error: string }}
 */
export function parsePoundsToPiastres(input) {
  const text = normalizeDigits(input).trim();
  if (!text) return { ok: false, error: "أدخل المبلغ." };
  const compact = text.replace(/\s+/g, "").replace(/,/g, ".");
  if (!/^-?\d+(\.\d{1,2})?$/.test(compact)) {
    return { ok: false, error: "صيغة المبلغ غير صحيحة. استخدم مثل 200 أو 200.50" };
  }
  const negative = compact.startsWith("-");
  const unsigned = negative ? compact.slice(1) : compact;
  const [wholeRaw, fracRaw = ""] = unsigned.split(".");
  const whole = BigInt(wholeRaw || "0");
  const frac = BigInt((fracRaw + "00").slice(0, 2));
  let piastres = whole * PIASTRES_PER_POUND + frac;
  if (negative) piastres = -piastres;
  return { ok: true, piastres };
}

export function piastresToNumberSafe(piastres) {
  const v = BigInt(piastres);
  if (v > BigInt(Number.MAX_SAFE_INTEGER) || v < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new Error("المبلغ أكبر من الحد المسموح للعرض.");
  }
  return Number(v);
}

export function formatPiastres(piastres, options = {}) {
  const { withCurrency = true, locale = "ar-EG", trimZeros = false } = options;
  const v = BigInt(piastres ?? 0);
  const negative = v < 0n;
  const abs = negative ? -v : v;
  const pounds = abs / PIASTRES_PER_POUND;
  const frac = abs % PIASTRES_PER_POUND;
  const poundsNum = Number(pounds);
  const formattedPounds = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 0,
  }).format(poundsNum);
  const fracStr = frac.toString().padStart(2, "0");
  const amount = trimZeros && frac === 0n
    ? `${negative ? "−" : ""}${formattedPounds}`
    : `${negative ? "−" : ""}${formattedPounds}.${fracStr}`;
  if (!withCurrency) return amount;
  return `${amount} ج.م`;
}

export function formatMoney(piastres, options = {}) {
  return formatPiastres(piastres, { trimZeros: true, ...options });
}

export function addMoney(...values) {
  return values.reduce((acc, v) => acc + BigInt(v ?? 0), 0n);
}

export function subMoney(a, b) {
  return BigInt(a ?? 0) - BigInt(b ?? 0);
}

export function minMoney(a, b) {
  const x = BigInt(a);
  const y = BigInt(b);
  return x < y ? x : y;
}

export function maxMoney(a, b) {
  const x = BigInt(a);
  const y = BigInt(b);
  return x > y ? x : y;
}

export function isNonNegative(piastres) {
  return BigInt(piastres ?? 0) >= 0n;
}

export function toPiastresNumber(piastres) {
  return Number(BigInt(piastres ?? 0));
}

/** Convert bigint fields to strings for JSON backup. */
export function moneyToJson(piastres) {
  return String(BigInt(piastres ?? 0));
}

export function moneyFromJson(value) {
  if (value === null || value === undefined || value === "") return 0n;
  if (typeof value === "bigint") return value;
  if (typeof value === "number") {
    if (!Number.isInteger(value)) {
      throw new Error("قيمة مالية غير صحيحة في ملف النسخة.");
    }
    return BigInt(value);
  }
  if (typeof value === "string" && /^-?\d+$/.test(value)) return BigInt(value);
  throw new Error("قيمة مالية غير صحيحة في ملف النسخة.");
}
