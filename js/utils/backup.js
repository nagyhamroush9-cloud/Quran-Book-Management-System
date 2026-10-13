import { moneyFromJson, moneyToJson } from "./currency.js";
import { STORE_NAMES } from "../db/migrations.js";
import { APP_NAME } from "./branding.js";

export const BACKUP_APP_ID = "quran-book-ms";
export const SUPPORTED_SCHEMA_VERSIONS = [1];
export const MAX_BACKUP_BYTES = 40 * 1024 * 1024;
export const MAX_RECORDS_PER_STORE = 100000;

const MONEY_FIELDS = {
  groups: ["defaultFeePiastres"],
  subscriptionPlans: ["amountPiastres"],
  students: ["customFeePiastres"],
  invoices: ["originalAmountPiastres", "discountPiastres", "finalAmountPiastres", "amountPaidPiastres", "outstandingPiastres"],
  payments: ["amountPiastres"],
  paymentAllocations: ["amountPiastres"],
  studentCredits: ["amountPiastres", "originalAmountPiastres"],
  expenses: ["amountPiastres"],
};

export function serializeRecords(recordsByStore) {
  const out = {};
  for (const name of STORE_NAMES) {
    const rows = recordsByStore[name] || [];
    out[name] = rows.map((row) => serializeRow(name, row));
  }
  return out;
}

function serializeRow(store, row) {
  const copy = { ...row };
  for (const field of MONEY_FIELDS[store] || []) {
    if (copy[field] !== undefined && copy[field] !== null && copy[field] !== "") {
      copy[field] = moneyToJson(copy[field]);
    }
  }
  return copy;
}

export function deserializeRecords(recordsByStore) {
  const out = {};
  for (const name of STORE_NAMES) {
    const rows = recordsByStore[name] || [];
    out[name] = rows.map((row) => deserializeRow(name, row));
  }
  return out;
}

function deserializeRow(store, row) {
  const copy = { ...row };
  for (const field of MONEY_FIELDS[store] || []) {
    if (copy[field] !== undefined && copy[field] !== null && copy[field] !== "") {
      copy[field] = moneyFromJson(copy[field]);
    }
  }
  return copy;
}

export async function checksumPayload(records) {
  const json = JSON.stringify(records, (_key, value) => (
    typeof value === "bigint" ? value.toString() : value
  ));
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const buf = new TextEncoder().encode(json);
    const hash = await crypto.subtle.digest("SHA-256", buf);
    return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  return `len:${json.length}`;
}

export async function buildBackupObject(recordsByStore, { schemaVersion = 1 } = {}) {
  const records = serializeRecords(recordsByStore);
  const counts = {};
  for (const name of STORE_NAMES) counts[name] = (records[name] || []).length;
  const checksum = await checksumPayload(records);
  return {
    app: BACKUP_APP_ID,
    schemaVersion,
    exportedAt: new Date().toISOString(),
    integrity: { recordCounts: counts, checksum },
    records,
  };
}

export function validateBackup(raw, { currentByteLength = 0 } = {}) {
  const errors = [];
  if (currentByteLength > MAX_BACKUP_BYTES) {
    return { ok: false, errors: ["ملف النسخة أكبر من الحد المسموح."] };
  }
  if (!raw || typeof raw !== "object") {
    return { ok: false, errors: ["ملف النسخة ليس كائن JSON صالحًا."] };
  }
  if (raw.app !== BACKUP_APP_ID) errors.push(`هذا الملف ليس نسخة من ${APP_NAME}.`);
  if (!SUPPORTED_SCHEMA_VERSIONS.includes(raw.schemaVersion)) {
    errors.push("إصدار قاعدة البيانات في الملف غير مدعوم.");
  }
  if (!raw.records || typeof raw.records !== "object") errors.push("الملف لا يحتوي على سجلات.");
  if (!raw.integrity || typeof raw.integrity !== "object") errors.push("الملف ينقصه بيانات السلامة.");
  if (errors.length) return { ok: false, errors };

  const counts = {};
  for (const name of STORE_NAMES) {
    const rows = raw.records[name];
    if (rows === undefined) {
      counts[name] = 0;
      continue;
    }
    if (!Array.isArray(rows)) {
      errors.push(`مخزن ${name} تالف.`);
      continue;
    }
    if (rows.length > MAX_RECORDS_PER_STORE) errors.push(`عدد السجلات في ${name} أكبر من المسموح.`);
    for (const row of rows) {
      if (!row || typeof row !== "object") {
        errors.push(`سجل تالف في ${name}.`);
        break;
      }
      if (name !== "settings" && name !== "meta" && !row.id) {
        errors.push(`سجل بدون معرف في ${name}.`);
        break;
      }
      if ((name === "settings" || name === "meta") && !row.key) {
        errors.push(`إعداد بدون مفتاح.`);
        break;
      }
    }
    counts[name] = rows.length;
  }

  const extra = Object.keys(raw.records).filter((k) => !STORE_NAMES.includes(k));
  if (extra.length) errors.push("يحتوي الملف على جداول غير معروفة.");

  try {
    deserializeRecords(raw.records);
  } catch (err) {
    errors.push(err.message || "قيم مالية غير صحيحة في الملف.");
  }

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    errors: [],
    preview: {
      exportedAt: raw.exportedAt,
      schemaVersion: raw.schemaVersion,
      counts,
    },
    data: raw,
  };
}

export async function verifyChecksum(backup) {
  const checksum = await checksumPayload(backup.records);
  if (!backup.integrity || !backup.integrity.checksum) return { ok: true, warning: "لا يوجد مجموع تحقق." };
  if (checksum !== backup.integrity.checksum) {
    return { ok: false, error: "مجموع التحقق لا يطابق محتوى الملف. قد يكون الملف معدَّلًا أو تالفًا." };
  }
  return { ok: true };
}
