import { parsePoundsToPiastres } from "./currency.js";
import { isValidDateString } from "./dates.js";

export function required(value, label) {
  if (value === null || value === undefined || String(value).trim() === "") {
    return `${label} مطلوب.`;
  }
  return null;
}

export function maxLength(value, n, label) {
  if (value && String(value).length > n) return `${label} أطول من المسموح (${n} حرفًا).`;
  return null;
}

/**
 * Phone validation is intentionally flexible.
 * Accepts Egyptian mobiles (01xxxxxxxxx), international +20, and other digits/spaces.
 */
export function validatePhone(value, { required: isRequired = true } = {}) {
  const text = String(value ?? "").trim();
  if (!text) return isRequired ? "رقم الهاتف مطلوب." : null;
  const compact = text.replace(/[\s()-]/g, "");
  if (!/^\+?[0-9٠-٩]{8,15}$/.test(compact)) {
    return "رقم الهاتف غير مفهوم. أدخل 8 إلى 15 رقمًا.";
  }
  return null;
}

export function validateAmountInput(value, { allowZero = false, allowNegative = false } = {}) {
  const parsed = parsePoundsToPiastres(value);
  if (!parsed.ok) return parsed.error;
  if (!allowNegative && parsed.piastres < 0n) return "المبلغ لا يمكن أن يكون سالبًا.";
  if (!allowZero && parsed.piastres === 0n) return "المبلغ يجب أن يكون أكبر من صفر.";
  return null;
}

export function validateDate(value, label = "التاريخ") {
  if (!value) return `${label} مطلوب.`;
  if (!isValidDateString(value)) return `${label} غير صحيح.`;
  return null;
}

export function similarName(a, b) {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return false;
  return na === nb;
}

export function normalizeName(name) {
  return String(name ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .toLowerCase();
}

export function collectErrors(checks) {
  return checks.filter(Boolean);
}

export function firstError(checks) {
  return checks.find(Boolean) || null;
}
