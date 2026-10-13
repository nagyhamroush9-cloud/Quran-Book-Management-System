/**
 * IndexedDB versioning.
 * Version 1: initial production schema.
 * Future versions must only add stores/indexes or migrate data non-destructively.
 */
export const DB_NAME = "quran-book-ms";
export const DB_VERSION = 1;

export const STORE_NAMES = [
  "students",
  "groups",
  "subscriptionPlans",
  "invoices",
  "payments",
  "paymentAllocations",
  "studentCredits",
  "expenses",
  "attendance",
  "memorizationRecords",
  "settings",
  "auditLogs",
  "reminders",
  "meta",
];

export function applyMigrations(db, oldVersion, _newVersion, tx) {
  if (oldVersion < 1) {
    createV1(db, tx);
  }
}

function createV1(db) {
  const students = db.createObjectStore("students", { keyPath: "id" });
  students.createIndex("fullName", "fullName", { unique: false });
  students.createIndex("status", "status", { unique: false });
  students.createIndex("groupId", "groupId", { unique: false });
  students.createIndex("enrollmentDate", "enrollmentDate", { unique: false });

  const groups = db.createObjectStore("groups", { keyPath: "id" });
  groups.createIndex("name", "name", { unique: false });
  groups.createIndex("status", "status", { unique: false });

  const plans = db.createObjectStore("subscriptionPlans", { keyPath: "id" });
  plans.createIndex("name", "name", { unique: false });
  plans.createIndex("status", "status", { unique: false });

  const invoices = db.createObjectStore("invoices", { keyPath: "id" });
  invoices.createIndex("studentId", "studentId", { unique: false });
  invoices.createIndex("billingPeriod", "billingPeriod", { unique: false });
  invoices.createIndex("status", "status", { unique: false });
  invoices.createIndex("dueDate", "dueDate", { unique: false });
  invoices.createIndex("studentPeriod", "studentPeriod", { unique: false });

  const payments = db.createObjectStore("payments", { keyPath: "id" });
  payments.createIndex("studentId", "studentId", { unique: false });
  payments.createIndex("paidAt", "paidAt", { unique: false });
  payments.createIndex("status", "status", { unique: false });
  payments.createIndex("receiptNumber", "receiptNumber", { unique: false });
  payments.createIndex("idempotencyKey", "idempotencyKey", { unique: false });

  const alloc = db.createObjectStore("paymentAllocations", { keyPath: "id" });
  alloc.createIndex("paymentId", "paymentId", { unique: false });
  alloc.createIndex("invoiceId", "invoiceId", { unique: false });

  const credits = db.createObjectStore("studentCredits", { keyPath: "id" });
  credits.createIndex("studentId", "studentId", { unique: false });

  const expenses = db.createObjectStore("expenses", { keyPath: "id" });
  expenses.createIndex("date", "date", { unique: false });
  expenses.createIndex("category", "category", { unique: false });
  expenses.createIndex("status", "status", { unique: false });

  const attendance = db.createObjectStore("attendance", { keyPath: "id" });
  attendance.createIndex("studentId", "studentId", { unique: false });
  attendance.createIndex("date", "date", { unique: false });
  attendance.createIndex("groupId", "groupId", { unique: false });
  attendance.createIndex("uniqueKey", "uniqueKey", { unique: true });

  const memo = db.createObjectStore("memorizationRecords", { keyPath: "id" });
  memo.createIndex("studentId", "studentId", { unique: false });
  memo.createIndex("date", "date", { unique: false });
  memo.createIndex("surahNumber", "surahNumber", { unique: false });
  memo.createIndex("nextRevisionDate", "nextRevisionDate", { unique: false });

  db.createObjectStore("settings", { keyPath: "key" });

  const audit = db.createObjectStore("auditLogs", { keyPath: "id" });
  audit.createIndex("createdAt", "createdAt", { unique: false });
  audit.createIndex("entityType", "entityType", { unique: false });
  audit.createIndex("entityId", "entityId", { unique: false });

  const reminders = db.createObjectStore("reminders", { keyPath: "id" });
  reminders.createIndex("type", "type", { unique: false });
  reminders.createIndex("dueDate", "dueDate", { unique: false });
  reminders.createIndex("dismissKey", "dismissKey", { unique: false });

  db.createObjectStore("meta", { keyPath: "key" });
}
