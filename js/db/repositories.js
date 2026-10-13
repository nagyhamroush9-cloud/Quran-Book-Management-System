import {
  addAuditSync,
  clearSync,
  getAll,
  getById,
  indexGetAll,
  putRecord,
  putSync,
  deleteById,
  deleteSync,
  STORE_NAMES,
  withStore,
  withWrite,
  setMeta,
} from "./database.js";
import { createId, nowIso } from "../utils/ids.js";
import {
  allocatePayment,
  applyAllocationsToInvoices,
  canBillPeriod,
  computeInvoiceAmounts,
  deriveInvoiceStatus,
  findDuplicateInvoice,
  invoicePeriodKey,
  previewMonthlyInvoices,
  reverseAllocations,
  studentFeePiastres,
} from "../utils/finance.js";
import { dueDateForPeriod, startOfMonth, todayLocal } from "../utils/dates.js";
import { buildBackupObject, deserializeRecords, validateBackup, verifyChecksum } from "../utils/backup.js";
import { APP_NAME, LEGACY_APP_NAMES } from "../utils/branding.js";

function repo(storeName) {
  return {
    async all() {
      return withStore(storeName, "readonly", (s) => getAll(s));
    },
    async get(id) {
      return withStore(storeName, "readonly", (s) => getById(s, id));
    },
    async put(record) {
      return withStore(storeName, "readwrite", (s) => putRecord(s, record));
    },
    async remove(id) {
      return withStore(storeName, "readwrite", (s) => deleteById(s, id));
    },
    async byIndex(index, value) {
      return withStore(storeName, "readonly", (s) => indexGetAll(s, index, value));
    },
  };
}

export const studentsRepo = repo("students");
export const groupsRepo = repo("groups");
export const plansRepo = repo("subscriptionPlans");
export const invoicesRepo = repo("invoices");
export const paymentsRepo = repo("payments");
export const allocationsRepo = repo("paymentAllocations");
export const creditsRepo = repo("studentCredits");
export const expensesRepo = repo("expenses");
export const attendanceRepo = repo("attendance");
export const memorizationRepo = repo("memorizationRecords");
export const auditRepo = repo("auditLogs");
export const remindersRepo = repo("reminders");

export async function getSettingsMap() {
  const rows = await withStore("settings", "readonly", (s) => getAll(s));
  const map = {};
  for (const row of rows) map[row.key] = row.value;
  return map;
}

export async function saveSettings(partial) {
  return withWrite(["settings", "auditLogs"], (stores) => {
    for (const [key, value] of Object.entries(partial)) {
      putSync(stores.settings, { key, value, updatedAt: nowIso() });
    }
    addAuditSync(stores, { action: "settings.update", entityType: "settings", details: { keys: Object.keys(partial) } });
  });
}

export async function getDefaultSettings() {
  return {
    appName: APP_NAME,
    teacherName: "",
    teacherPhone: "",
    currency: "EGP",
    defaultDueDay: 5,
    reminderDaysBeforeDue: 3,
    absenceThreshold: 3,
    backupReminderDays: 7,
    theme: "light",
    setupComplete: false,
    pinEnabled: false,
    pinHash: "",
    allowFutureInvoices: false,
    allowDuplicateInvoiceException: false,
  };
}

export async function loadSettings() {
  const defaults = await getDefaultSettings();
  const stored = await getSettingsMap();
  if (LEGACY_APP_NAMES.has(stored.appName)) {
    await saveSettings({ appName: APP_NAME });
    stored.appName = APP_NAME;
  }
  return { ...defaults, ...stored };
}

export async function saveStudent(student, { warnDuplicates = true } = {}) {
  const all = await studentsRepo.all();
  const duplicates = warnDuplicates
    ? all.filter((s) => s.id !== student.id && normalize(s.fullName) === normalize(student.fullName))
    : [];
  const existing = student.id ? await studentsRepo.get(student.id) : null;
  const record = {
    ...existing,
    ...student,
    id: student.id || createId(),
    createdAt: existing?.createdAt || nowIso(),
    updatedAt: nowIso(),
  };
  await withWrite(["students", "auditLogs"], (stores) => {
    putSync(stores.students, record);
    addAuditSync(stores, {
      action: existing ? "student.update" : "student.create",
      entityType: "student",
      entityId: record.id,
    });
  });
  return { record, duplicates };
}

function normalize(name) {
  return String(name || "").trim().replace(/\s+/g, " ").replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").toLowerCase();
}

export async function archiveStudent(id, status = "archived") {
  const student = await studentsRepo.get(id);
  if (!student) throw Object.assign(new Error("missing"), { userMessage: "الطالب غير موجود." });
  student.status = status;
  student.updatedAt = nowIso();
  await withWrite(["students", "auditLogs"], (stores) => {
    putSync(stores.students, student);
    addAuditSync(stores, { action: "student.archive", entityType: "student", entityId: id, details: { status } });
  });
  return student;
}

export async function restoreStudent(id) {
  return archiveStudent(id, "active");
}

export async function saveGroup(group) {
  const existing = group.id ? await groupsRepo.get(group.id) : null;
  const record = {
    classSessions: [{ id: "default", name: "الحصة الأساسية", time: "" }],
    ...existing,
    ...group,
    id: group.id || createId(),
    createdAt: existing?.createdAt || nowIso(),
    updatedAt: nowIso(),
  };
  await withWrite(["groups", "auditLogs"], (stores) => {
    putSync(stores.groups, record);
    addAuditSync(stores, { action: existing ? "group.update" : "group.create", entityType: "group", entityId: record.id });
  });
  return record;
}

export async function savePlan(plan) {
  const existing = plan.id ? await plansRepo.get(plan.id) : null;
  const record = {
    ...existing,
    ...plan,
    id: plan.id || createId(),
    createdAt: existing?.createdAt || nowIso(),
    updatedAt: nowIso(),
  };
  await withWrite(["subscriptionPlans", "auditLogs"], (stores) => {
    putSync(stores.subscriptionPlans, record);
    addAuditSync(stores, { action: existing ? "plan.update" : "plan.create", entityType: "plan", entityId: record.id });
  });
  return record;
}

export async function createInvoice(input) {
  const amounts = computeInvoiceAmounts({
    originalPiastres: input.originalAmountPiastres,
    discountPiastres: input.discountPiastres || 0n,
    amountPaidPiastres: 0n,
  });
  const existing = await invoicesRepo.all();
  if (!input.allowException) {
    const dup = findDuplicateInvoice(existing, input.studentId, input.billingPeriod);
    if (dup) {
      throw Object.assign(new Error("duplicate invoice"), {
        userMessage: "توجد فاتورة لنفس الطالب ونفس شهر الاشتراك. هذا ممنوع إلا باستثناء يدوي موثّق.",
      });
    }
  } else if (!input.exceptionReason) {
    throw Object.assign(new Error("reason required"), { userMessage: "سبب الاستثناء مطلوب لإنشاء فاتورة مكررة." });
  }
  const today = todayLocal();
  const record = {
    id: createId(),
    studentId: input.studentId,
    groupId: input.groupId || null,
    planId: input.planId || null,
    billingPeriod: input.billingPeriod,
    studentPeriod: invoicePeriodKey(input.studentId, input.billingPeriod),
    issueDate: input.issueDate,
    dueDate: input.dueDate,
    originalAmountPiastres: amounts.originalPiastres,
    discountPiastres: amounts.discountPiastres,
    finalAmountPiastres: amounts.finalAmountPiastres,
    amountPaidPiastres: 0n,
    outstandingPiastres: amounts.outstandingPiastres,
    status: deriveInvoiceStatus({ ...amounts, dueDate: input.dueDate, status: "unpaid" }, today),
    notes: input.notes || "",
    exceptionReason: input.exceptionReason || "",
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  await withWrite(["invoices", "auditLogs"], (stores) => {
    putSync(stores.invoices, record);
    addAuditSync(stores, { action: "invoice.create", entityType: "invoice", entityId: record.id });
  });
  return record;
}

export async function ensureInvoiceForPeriod({ studentId, period, settings }) {
  const existing = await invoicesRepo.byIndex("studentId", studentId);
  const dup = findDuplicateInvoice(existing, studentId, period);
  if (dup) return dup;
  const student = await studentsRepo.get(studentId);
  if (!student) {
    throw Object.assign(new Error("missing student"), { userMessage: "الطالب غير موجود." });
  }
  if (!canBillPeriod(student, period)) {
    throw Object.assign(new Error("before enrollment"), {
      userMessage: "لا يُنشأ مستحق لشهر قبل بداية اشتراك الطالب.",
    });
  }
  const [groups, plans, loaded] = await Promise.all([
    groupsRepo.all(),
    plansRepo.all(),
    settings ? Promise.resolve(settings) : loadSettings(),
  ]);
  const group = groups.find((g) => g.id === student.groupId);
  const plan = plans.find((p) => p.id === student.planId);
  const original = studentFeePiastres(student, group, plan);
  if (original <= 0n) {
    throw Object.assign(new Error("no fee"), {
      userMessage: "حدد قيمة الاشتراك الشهري للطالب قبل تسجيل الدفع.",
    });
  }
  const dueDay = Number(loaded?.defaultDueDay || 5);
  return createInvoice({
    studentId,
    groupId: student.groupId,
    planId: student.planId,
    billingPeriod: period,
    issueDate: startOfMonth(period) || todayLocal(),
    dueDate: dueDateForPeriod(period, dueDay) || todayLocal(),
    originalAmountPiastres: original,
  });
}

export async function recordMonthPayment(input) {
  const periods = [...new Set((input.periods || []).filter(Boolean))].sort();
  if (!periods.length) {
    throw Object.assign(new Error("no periods"), { userMessage: "اختر شهرًا واحدًا على الأقل." });
  }
  const settings = await loadSettings();
  const invoices = [];
  for (const period of periods) {
    invoices.push(await ensureInvoiceForPeriod({
      studentId: input.studentId,
      period,
      settings,
    }));
  }
  const amount = BigInt(input.amountPiastres);
  const { allocations } = allocatePayment(invoices, amount);
  return recordPayment({
    studentId: input.studentId,
    amountPiastres: amount,
    paidAt: input.paidAt,
    method: input.method || "cash",
    receiptNumber: input.receiptNumber,
    notes: input.notes || (periods.length > 1 ? `اشتراك: ${periods.join("، ")}` : `اشتراك ${periods[0]}`),
    idempotencyKey: input.idempotencyKey,
    manualAllocations: allocations.length ? allocations : null,
  });
}

export async function generateMonthlyInvoices({ period, issueDate, dueDate }) {
  const students = await studentsRepo.all();
  const groups = await groupsRepo.all();
  const plans = await plansRepo.all();
  const invoices = await invoicesRepo.all();
  const preview = previewMonthlyInvoices({ students, groups, plans, existingInvoices: invoices, period, issueDate, dueDate });
  const created = [];
  const current = [...invoices];
  for (const item of preview.created) {
    const dup = findDuplicateInvoice(current, item.studentId, item.billingPeriod);
    if (dup) continue;
    const record = {
      id: createId(),
      studentId: item.studentId,
      groupId: item.groupId,
      planId: item.planId,
      billingPeriod: item.billingPeriod,
      studentPeriod: invoicePeriodKey(item.studentId, item.billingPeriod),
      issueDate: item.issueDate,
      dueDate: item.dueDate,
      originalAmountPiastres: item.originalPiastres ?? item.originalAmountPiastres ?? item.finalAmountPiastres,
      discountPiastres: item.discountPiastres,
      finalAmountPiastres: item.finalAmountPiastres,
      amountPaidPiastres: 0n,
      outstandingPiastres: item.outstandingPiastres,
      status: item.status,
      notes: "",
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    current.push(record);
    created.push(record);
  }
  await withWrite(["invoices", "auditLogs"], (stores) => {
    for (const record of created) putSync(stores.invoices, record);
    addAuditSync(stores, {
      action: "invoice.generateMonth",
      entityType: "invoice",
      details: { period, created: created.length, skipped: preview.skipped.length },
    });
  });
  return { created, skipped: preview.skipped };
}

export async function cancelInvoice(id, reason) {
  const inv = await invoicesRepo.get(id);
  if (!inv) throw Object.assign(new Error("missing"), { userMessage: "الفاتورة غير موجودة." });
  if (BigInt(inv.amountPaidPiastres) > 0n) {
    throw Object.assign(new Error("has payments"), {
      userMessage: "لا يمكن إلغاء فاتورة عليها مدفوعات. اعكس الدفعات أولًا.",
    });
  }
  inv.status = "cancelled";
  inv.cancelledAt = nowIso();
  inv.cancelReason = reason || "";
  inv.updatedAt = nowIso();
  await withWrite(["invoices", "auditLogs"], (stores) => {
    putSync(stores.invoices, inv);
    addAuditSync(stores, { action: "invoice.cancel", entityType: "invoice", entityId: id, details: { reason } });
  });
  return inv;
}

export async function recordPayment(input) {
  if (input.idempotencyKey) {
    const existing = await paymentsRepo.byIndex("idempotencyKey", input.idempotencyKey);
    if (existing.length) {
      throw Object.assign(new Error("duplicate submit"), { userMessage: "هذه الدفعة سُجّلت بالفعل. لم يتم تكرارها." });
    }
  }
  const amount = BigInt(input.amountPiastres);
  if (amount <= 0n) throw Object.assign(new Error("amount"), { userMessage: "مبلغ الدفعة يجب أن يكون أكبر من صفر." });

  const studentInvoices = (await invoicesRepo.byIndex("studentId", input.studentId))
    .filter((i) => i.status !== "cancelled");
  const { allocations, creditPiastres } = allocatePayment(
    studentInvoices,
    amount,
    input.manualAllocations || null
  );
  const payment = {
    id: createId(),
    studentId: input.studentId,
    amountPiastres: amount,
    paidAt: input.paidAt,
    method: input.method || "cash",
    receiptNumber: input.receiptNumber || nextReceiptFallback(paymentSeed()),
    notes: input.notes || "",
    status: "posted",
    idempotencyKey: input.idempotencyKey || null,
    editHistory: [],
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  const allocRecords = allocations.map((a) => ({
    id: createId(),
    paymentId: payment.id,
    invoiceId: a.invoiceId,
    amountPiastres: a.amountPiastres,
    createdAt: nowIso(),
  }));
  const updatedInvoices = applyAllocationsToInvoices(studentInvoices, allocations);
  await withWrite(
    ["payments", "paymentAllocations", "invoices", "studentCredits", "auditLogs"],
    (stores) => {
      putSync(stores.payments, payment);
      for (const rec of allocRecords) putSync(stores.paymentAllocations, rec);
      for (const inv of updatedInvoices) {
        if (allocations.some((a) => a.invoiceId === inv.id)) {
          inv.updatedAt = nowIso();
          putSync(stores.invoices, inv);
        }
      }
      if (creditPiastres > 0n) {
        putSync(stores.studentCredits, {
          id: createId(),
          studentId: input.studentId,
          amountPiastres: creditPiastres,
          originalAmountPiastres: creditPiastres,
          sourcePaymentId: payment.id,
          notes: "زيادة دفعة لم تُوزَّع على فواتير",
          createdAt: nowIso(),
        });
      }
      addAuditSync(stores, {
        action: "payment.record",
        entityType: "payment",
        entityId: payment.id,
        details: { amount: String(amount), allocations: allocRecords.length, credit: String(creditPiastres) },
      });
    }
  );
  return { payment, allocations: allocRecords, creditPiastres };
}

function paymentSeed() {
  return `R-${Date.now().toString(36).toUpperCase()}`;
}
function nextReceiptFallback(seed) {
  return seed;
}

export async function voidPayment(paymentId, reason) {
  const payment = await paymentsRepo.get(paymentId);
  if (!payment) throw Object.assign(new Error("missing"), { userMessage: "الدفعة غير موجودة." });
  if (payment.status === "voided") {
    throw Object.assign(new Error("already"), { userMessage: "هذه الدفعة معكوسة بالفعل." });
  }
  const allocs = await allocationsRepo.byIndex("paymentId", paymentId);
  const invoices = [];
  for (const a of allocs) {
    const inv = await invoicesRepo.get(a.invoiceId);
    if (inv) invoices.push(inv);
  }
  const reversed = reverseAllocations(invoices, allocs);
  const credits = (await creditsRepo.byIndex("studentId", payment.studentId))
    .filter((c) => c.sourcePaymentId === paymentId);
  payment.status = "voided";
  payment.voidReason = reason || "";
  payment.voidedAt = nowIso();
  payment.updatedAt = nowIso();
  await withWrite(
    ["payments", "paymentAllocations", "invoices", "studentCredits", "auditLogs"],
    (stores) => {
      for (const inv of reversed) {
        inv.updatedAt = nowIso();
        putSync(stores.invoices, inv);
      }
      for (const c of credits) deleteSync(stores.studentCredits, c.id);
      putSync(stores.payments, payment);
      addAuditSync(stores, {
        action: "payment.void",
        entityType: "payment",
        entityId: paymentId,
        details: { reason },
      });
    }
  );
  return payment;
}

export async function updatePaymentMeta(paymentId, patch) {
  const payment = await paymentsRepo.get(paymentId);
  if (!payment) throw Object.assign(new Error("missing"), { userMessage: "الدفعة غير موجودة." });
  const history = Array.isArray(payment.editHistory) ? payment.editHistory : [];
  history.push({
    at: nowIso(),
    before: { paidAt: payment.paidAt, method: payment.method, notes: payment.notes, receiptNumber: payment.receiptNumber },
  });
  payment.paidAt = patch.paidAt ?? payment.paidAt;
  payment.method = patch.method ?? payment.method;
  payment.notes = patch.notes ?? payment.notes;
  payment.receiptNumber = patch.receiptNumber ?? payment.receiptNumber;
  payment.editHistory = history;
  payment.updatedAt = nowIso();
  await withWrite(["payments", "auditLogs"], (stores) => {
    putSync(stores.payments, payment);
    addAuditSync(stores, { action: "payment.editMeta", entityType: "payment", entityId: paymentId });
  });
  return payment;
}

export async function saveExpense(expense) {
  const existing = expense.id ? await expensesRepo.get(expense.id) : null;
  const record = {
    ...existing,
    ...expense,
    id: expense.id || createId(),
    amountPiastres: BigInt(expense.amountPiastres),
    createdAt: existing?.createdAt || nowIso(),
    updatedAt: nowIso(),
  };
  await withWrite(["expenses", "auditLogs"], (stores) => {
    putSync(stores.expenses, record);
    addAuditSync(stores, { action: existing ? "expense.update" : "expense.create", entityType: "expense", entityId: record.id });
  });
  return record;
}

export async function saveAttendance(record) {
  const uniqueKey = `${record.studentId}|${record.date}|${record.sessionId || "default"}`;
  const existingList = await attendanceRepo.byIndex("uniqueKey", uniqueKey);
  const prev = record.id ? await attendanceRepo.get(record.id) : existingList[0];
  const saved = {
    ...prev,
    ...record,
    id: record.id || prev?.id || createId(),
    sessionId: record.sessionId || "default",
    uniqueKey,
    createdAt: prev?.createdAt || nowIso(),
    updatedAt: nowIso(),
  };
  await withWrite(["attendance", "auditLogs"], (stores) => {
    putSync(stores.attendance, saved);
    addAuditSync(stores, { action: "attendance.save", entityType: "attendance", entityId: saved.id });
  });
  return saved;
}

export async function saveMemorization(record) {
  const existing = record.id ? await memorizationRepo.get(record.id) : null;
  const history = existing?.editHistory ? [...existing.editHistory] : [];
  if (existing) {
    history.push({
      at: nowIso(),
      before: {
        surahNumber: existing.surahNumber,
        startAyah: existing.startAyah,
        endAyah: existing.endAyah,
        activityType: existing.activityType,
        rating: existing.rating,
        notes: existing.notes,
      },
    });
  }
  const saved = {
    ...existing,
    ...record,
    id: record.id || createId(),
    editHistory: history,
    createdAt: existing?.createdAt || nowIso(),
    updatedAt: nowIso(),
  };
  await withWrite(["memorizationRecords", "auditLogs"], (stores) => {
    putSync(stores.memorizationRecords, saved);
    addAuditSync(stores, { action: existing ? "memo.update" : "memo.create", entityType: "memorization", entityId: saved.id });
  });
  return saved;
}

export async function dismissReminder(dismissKey, extra = {}) {
  const record = {
    id: createId(),
    type: extra.type || "dismiss",
    title: extra.title || "",
    relatedEntityType: extra.relatedEntityType || null,
    relatedEntityId: extra.relatedEntityId || null,
    dueDate: extra.dueDate || null,
    dismissKey,
    dismissedAt: nowIso(),
    createdAt: nowIso(),
  };
  await remindersRepo.put(record);
  return record;
}

export async function addManualReminder(input) {
  const record = {
    id: createId(),
    type: "manual",
    title: input.title,
    relatedEntityType: input.relatedEntityType || null,
    relatedEntityId: input.relatedEntityId || null,
    dueDate: input.dueDate || null,
    dismissKey: `manual:${createId()}`,
    dismissedAt: null,
    createdAt: nowIso(),
  };
  await remindersRepo.put(record);
  return record;
}

export async function loadAllStores() {
  const data = {};
  for (const name of STORE_NAMES) {
    data[name] = await withStore(name, "readonly", (s) => getAll(s));
  }
  return data;
}

export async function exportBackup() {
  const data = await loadAllStores();
  const backup = await buildBackupObject(data);
  await setMeta("lastBackupAt", backup.exportedAt);
  return backup;
}

export async function restoreBackup(parsedJson, byteLength) {
  const validated = validateBackup(parsedJson, { currentByteLength: byteLength });
  if (!validated.ok) {
    throw Object.assign(new Error("invalid backup"), { userMessage: validated.errors.join(" ") });
  }
  const checksum = await verifyChecksum(validated.data);
  if (!checksum.ok) {
    throw Object.assign(new Error("checksum"), { userMessage: checksum.error });
  }
  const records = deserializeRecords(validated.data.records);
  await withWrite(STORE_NAMES, (stores) => {
    for (const name of STORE_NAMES) {
      clearSync(stores[name]);
      for (const row of records[name] || []) {
        putSync(stores[name], row);
      }
    }
  });
  await setMeta("lastRestoreAt", nowIso());
  return validated.preview;
}

export async function studentRelated(studentId) {
  const [invoices, payments, attendance, memo, credits] = await Promise.all([
    invoicesRepo.byIndex("studentId", studentId),
    paymentsRepo.byIndex("studentId", studentId),
    attendanceRepo.byIndex("studentId", studentId),
    memorizationRepo.byIndex("studentId", studentId),
    creditsRepo.byIndex("studentId", studentId),
  ]);
  const allocs = [];
  for (const p of payments) {
    const a = await allocationsRepo.byIndex("paymentId", p.id);
    allocs.push(...a);
  }
  return { invoices, payments, attendance, memo, credits, allocations: allocs };
}
