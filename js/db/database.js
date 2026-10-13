import { applyMigrations, DB_NAME, DB_VERSION, STORE_NAMES } from "./migrations.js";
import { createId, nowIso } from "../utils/ids.js";

let dbPromise = null;

export class DatabaseError extends Error {
  constructor(message, { userMessage, cause } = {}) {
    super(message);
    this.name = "DatabaseError";
    this.userMessage = userMessage || "تعذر الوصول إلى قاعدة البيانات المحلية.";
    if (cause) this.cause = cause;
  }
}

export function openDatabase() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!("indexedDB" in globalThis)) {
      reject(new DatabaseError("IndexedDB unavailable", {
        userMessage: "المتصفح لا يدعم التخزين المحلي اللازم لهذا التطبيق.",
      }));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (event) => {
      applyMigrations(req.result, event.oldVersion, event.newVersion, req.transaction);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      reject(new DatabaseError("IndexedDB open failed", {
        userMessage: "تعذر فتح قاعدة البيانات. قد يكون التخزين محظورًا أو ممتلئًا.",
        cause: req.error,
      }));
    };
    req.onblocked = () => {
      reject(new DatabaseError("IndexedDB blocked", {
        userMessage: "قاعدة البيانات قيد الاستخدام في نافذة أخرى. أغلق النوافذ الأخرى ثم أعد المحاولة.",
      }));
    };
  });
  return dbPromise;
}

export function resetDbPromise() {
  dbPromise = null;
}

function requestToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(new DatabaseError("IndexedDB request failed", {
      userMessage: mapIdbError(req.error),
      cause: req.error,
    }));
  });
}

function mapIdbError(error) {
  const name = error && error.name;
  if (name === "QuotaExceededError") return "مساحة التخزين ممتلئة. احذف بيانات غير لازمة أو انقل نسخة احتياطية إلى مكان آخر.";
  if (name === "ConstraintError") return "البيانات تتعارض مع سجل موجود (مثل حضور مكرر لنفس اليوم).";
  return "فشل حفظ أو قراءة البيانات المحلية.";
}

export async function withStore(storeName, mode, fn) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    let result;
    Promise.resolve(fn(store, tx))
      .then((value) => {
        result = value;
      })
      .catch(reject);
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(new DatabaseError("transaction failed", {
      userMessage: mapIdbError(tx.error),
      cause: tx.error,
    }));
    tx.onabort = () => reject(new DatabaseError("transaction aborted", {
      userMessage: mapIdbError(tx.error),
      cause: tx.error,
    }));
  });
}

export async function withTransaction(storeNames, mode, fn) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeNames, mode);
    const stores = {};
    for (const name of storeNames) stores[name] = tx.objectStore(name);
    let result;
    Promise.resolve(fn(stores, tx))
      .then((value) => {
        result = value;
      })
      .catch((err) => {
        try { tx.abort(); } catch { /* already completed */ }
        reject(err);
      });
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(new DatabaseError("transaction failed", {
      userMessage: mapIdbError(tx.error),
      cause: tx.error,
    }));
    tx.onabort = () => reject(new DatabaseError("transaction aborted", {
      userMessage: mapIdbError(tx.error),
      cause: tx.error,
    }));
  });
}

function encodeValue(value) {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(encodeValue);
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = encodeValue(v);
    return out;
  }
  return value;
}

export function getAll(store) {
  return requestToPromise(store.getAll());
}

export function getById(store, id) {
  return requestToPromise(store.get(id));
}

export function putRecord(store, record) {
  return requestToPromise(store.put(encodeValue(record)));
}

export function deleteById(store, id) {
  return requestToPromise(store.delete(id));
}

export function indexGetAll(store, indexName, query) {
  return requestToPromise(store.index(indexName).getAll(query));
}

export function clearStore(store) {
  return requestToPromise(store.clear());
}

export function putSync(store, record) {
  store.put(encodeValue(record));
}

export function deleteSync(store, id) {
  store.delete(id);
}

export function clearSync(store) {
  store.clear();
}

export function addAuditSync(stores, { action, entityType, entityId, details }) {
  const log = {
    id: createId(),
    action,
    entityType,
    entityId: entityId || null,
    details: details ? JSON.stringify(details) : null,
    createdAt: nowIso(),
  };
  putSync(stores.auditLogs, log);
  return log;
}

/** All writes must be queued synchronously so the IndexedDB transaction stays open. */
export async function withWrite(storeNames, writer) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeNames, "readwrite");
    const stores = {};
    for (const name of storeNames) stores[name] = tx.objectStore(name);
    let result;
    try {
      result = writer(stores, tx);
    } catch (err) {
      try { tx.abort(); } catch { /* already done */ }
      reject(err);
      return;
    }
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(new DatabaseError("transaction failed", {
      userMessage: mapIdbError(tx.error),
      cause: tx.error,
    }));
    tx.onabort = () => reject(new DatabaseError("transaction aborted", {
      userMessage: mapIdbError(tx.error),
      cause: tx.error,
    }));
  });
}

export async function addAudit(stores, { action, entityType, entityId, details }) {
  return addAuditSync(stores, { action, entityType, entityId, details });
}

export async function getMeta(key) {
  return withStore("meta", "readonly", (store) => getById(store, key));
}

export async function setMeta(key, value) {
  return withStore("meta", "readwrite", (store) => putRecord(store, { key, value, updatedAt: nowIso() }));
}

export { STORE_NAMES, requestToPromise };
