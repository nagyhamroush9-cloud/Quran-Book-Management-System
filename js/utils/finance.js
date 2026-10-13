import { addMoney, minMoney, subMoney } from "./currency.js";
import { compareDate, currentPeriod, todayLocal } from "./dates.js";

export const INVOICE_STATUSES = ["unpaid", "partial", "paid", "overdue", "cancelled"];
export const STUDENT_STATUSES = ["active", "inactive", "suspended", "archived"];
export const PAYMENT_METHODS = ["cash", "bank", "wallet", "other"];
export const EXPENSE_CATEGORIES = [
  "rent",
  "utilities",
  "supplies",
  "books",
  "transport",
  "maintenance",
  "other",
];

export function deriveInvoiceStatus(invoice, today = todayLocal()) {
  if (invoice.status === "cancelled" || invoice.cancelledAt) return "cancelled";
  const outstanding = BigInt(invoice.outstandingPiastres ?? 0);
  const paid = BigInt(invoice.amountPaidPiastres ?? 0);
  if (outstanding === 0n) return "paid";
  if (outstanding < 0n) {
    throw new Error("رصيد الفاتورة لا يجوز أن يكون سالبًا.");
  }
  const overdue = invoice.dueDate && compareDate(invoice.dueDate, today) < 0;
  if (paid === 0n) return overdue ? "overdue" : "unpaid";
  return overdue ? "overdue" : "partial";
}

export function computeInvoiceAmounts({ originalPiastres, discountPiastres = 0n, amountPaidPiastres = 0n }) {
  const original = BigInt(originalPiastres ?? 0);
  const discount = BigInt(discountPiastres ?? 0);
  const paid = BigInt(amountPaidPiastres ?? 0);
  if (original < 0n) throw new Error("المبلغ الأصلي لا يجوز أن يكون سالبًا.");
  if (discount < 0n) throw new Error("الخصم لا يجوز أن يكون سالبًا.");
  if (discount > original) throw new Error("الخصم لا يجوز أن يتجاوز المبلغ الأصلي.");
  if (paid < 0n) throw new Error("المدفوع لا يجوز أن يكون سالبًا.");
  const finalAmount = original - discount;
  if (paid > finalAmount) {
    throw new Error("المدفوع لا يجوز أن يتجاوز مبلغ الفاتورة. استخدم رصيدًا دائنًا للزيادة.");
  }
  const outstanding = finalAmount - paid;
  return { originalPiastres: original, discountPiastres: discount, finalAmountPiastres: finalAmount, amountPaidPiastres: paid, outstandingPiastres: outstanding };
}

export function studentFeePiastres(student, group, plan) {
  if (student.customFeePiastres !== null && student.customFeePiastres !== undefined && student.customFeePiastres !== "") {
    return BigInt(student.customFeePiastres);
  }
  if (group && group.defaultFeePiastres !== null && group.defaultFeePiastres !== undefined) {
    return BigInt(group.defaultFeePiastres);
  }
  if (plan && plan.amountPiastres !== null && plan.amountPiastres !== undefined) {
    return BigInt(plan.amountPiastres);
  }
  return 0n;
}

export function invoicePeriodKey(studentId, billingPeriod) {
  return `${studentId}|${billingPeriod}`;
}

export function findDuplicateInvoice(invoices, studentId, billingPeriod, exceptId = null) {
  return invoices.find(
    (inv) =>
      inv.studentId === studentId &&
      inv.billingPeriod === billingPeriod &&
      inv.status !== "cancelled" &&
      inv.id !== exceptId
  );
}

/**
 * Allocate a payment across invoices (FIFO by due date, then issue date).
 * Never exceeds payment amount or remaining invoice balance.
 * Remainder is returned as unallocated credit (not applied as negative invoice).
 */
export function allocatePayment(invoices, paymentPiastres, manualAllocations = null) {
  const amount = BigInt(paymentPiastres);
  if (amount <= 0n) throw new Error("مبلغ الدفع يجب أن يكون أكبر من صفر.");

  if (manualAllocations) {
    let used = 0n;
    const result = [];
    for (const alloc of manualAllocations) {
      const inv = invoices.find((i) => i.id === alloc.invoiceId);
      if (!inv) throw new Error("فاتورة غير موجودة في التوزيع.");
      if (inv.status === "cancelled") throw new Error("لا يمكن الدفع على فاتورة ملغاة.");
      const piece = BigInt(alloc.amountPiastres);
      if (piece <= 0n) throw new Error("توزيع الدفع يجب أن يكون أكبر من صفر.");
      const remaining = BigInt(inv.outstandingPiastres);
      if (piece > remaining) throw new Error("التوزيع يتجاوز المتبقي على الفاتورة.");
      used += piece;
      if (used > amount) throw new Error("مجموع التوزيع يتجاوز مبلغ الدفعة.");
      result.push({ invoiceId: inv.id, amountPiastres: piece });
    }
    return { allocations: result, creditPiastres: amount - used };
  }

  const sortable = [...invoices]
    .filter((i) => i.status !== "cancelled" && BigInt(i.outstandingPiastres) > 0n)
    .sort((a, b) => {
      const due = compareDate(a.dueDate, b.dueDate);
      if (due !== 0) return due;
      return compareDate(a.issueDate, b.issueDate);
    });

  let remainingPayment = amount;
  const allocations = [];
  for (const inv of sortable) {
    if (remainingPayment === 0n) break;
    const take = minMoney(remainingPayment, inv.outstandingPiastres);
    if (take > 0n) {
      allocations.push({ invoiceId: inv.id, amountPiastres: take });
      remainingPayment -= take;
    }
  }
  return { allocations, creditPiastres: remainingPayment };
}

export function applyAllocationsToInvoices(invoices, allocations, today = todayLocal()) {
  const map = new Map(invoices.map((i) => [i.id, { ...i }]));
  for (const alloc of allocations) {
    const inv = map.get(alloc.invoiceId);
    if (!inv) throw new Error("فاتورة غير موجودة.");
    const nextPaid = addMoney(inv.amountPaidPiastres, alloc.amountPiastres);
    const amounts = computeInvoiceAmounts({
      originalPiastres: inv.originalAmountPiastres,
      discountPiastres: inv.discountPiastres,
      amountPaidPiastres: nextPaid,
    });
    inv.amountPaidPiastres = amounts.amountPaidPiastres;
    inv.outstandingPiastres = amounts.outstandingPiastres;
    inv.finalAmountPiastres = amounts.finalAmountPiastres;
    inv.status = deriveInvoiceStatus(inv, today);
  }
  return [...map.values()];
}

export function reverseAllocations(invoices, allocations, today = todayLocal()) {
  const map = new Map(invoices.map((i) => [i.id, { ...i }]));
  for (const alloc of allocations) {
    const inv = map.get(alloc.invoiceId);
    if (!inv) continue;
    const nextPaid = subMoney(inv.amountPaidPiastres, alloc.amountPiastres);
    if (nextPaid < 0n) throw new Error("لا يمكن عكس دفعة لأن المدفوع سيصبح سالبًا.");
    const amounts = computeInvoiceAmounts({
      originalPiastres: inv.originalAmountPiastres,
      discountPiastres: inv.discountPiastres,
      amountPaidPiastres: nextPaid,
    });
    inv.amountPaidPiastres = amounts.amountPaidPiastres;
    inv.outstandingPiastres = amounts.outstandingPiastres;
    inv.finalAmountPiastres = amounts.finalAmountPiastres;
    inv.status = deriveInvoiceStatus(inv, today);
  }
  return [...map.values()];
}

export function isCollectedPayment(payment) {
  return payment && payment.status === "posted";
}

export function isPaidExpense(expense) {
  return expense && expense.status === "paid";
}

export function inPeriod(dateYmd, period) {
  if (!dateYmd || !period) return false;
  return dateYmd.startsWith(period);
}

/**
 * Canonical financial metrics. All values are bigint piastres.
 * invoiced: non-cancelled invoices final amounts (optionally filtered by issue period)
 * collected: posted payments (not voided)
 * outstanding: remaining on non-cancelled invoices
 * expensesPaid: expenses with status paid
 * netCash: collected - expensesPaid
 */
export function computeFinancials({ invoices = [], payments = [], expenses = [], period = null, today = todayLocal() } = {}) {
  const invFiltered = period
    ? invoices.filter((i) => i.billingPeriod === period || inPeriod(i.issueDate, period))
    : invoices;
  const payFiltered = period ? payments.filter((p) => inPeriod(String(p.paidAt || "").slice(0, 10), period)) : payments;
  const expFiltered = period ? expenses.filter((e) => inPeriod(e.date, period)) : expenses;

  let invoiced = 0n;
  let outstanding = 0n;
  let discounts = 0n;
  for (const inv of invFiltered) {
    if (inv.status === "cancelled" || inv.cancelledAt) continue;
    invoiced += BigInt(inv.finalAmountPiastres ?? 0);
    outstanding += BigInt(inv.outstandingPiastres ?? 0);
    discounts += BigInt(inv.discountPiastres ?? 0);
  }

  let collected = 0n;
  let voided = 0n;
  for (const p of payFiltered) {
    if (isCollectedPayment(p)) collected += BigInt(p.amountPiastres ?? 0);
    else voided += BigInt(p.amountPiastres ?? 0);
  }

  let expensesPaid = 0n;
  let expensesUnpaid = 0n;
  for (const e of expFiltered) {
    if (isPaidExpense(e)) expensesPaid += BigInt(e.amountPiastres ?? 0);
    else expensesUnpaid += BigInt(e.amountPiastres ?? 0);
  }

  const netCash = collected - expensesPaid;
  return {
    invoiced,
    outstanding,
    discounts,
    collected,
    voided,
    expensesPaid,
    expensesUnpaid,
    netCash,
    period: period || currentPeriod(),
    today,
  };
}

export function attendancePercent(records) {
  if (!records.length) return null;
  const counted = records.filter((r) => r.status !== "excused");
  if (!counted.length) return null;
  const presentish = counted.filter((r) => r.status === "present" || r.status === "late").length;
  return Math.round((presentish / counted.length) * 1000) / 10;
}

export function enrollmentPeriod(student) {
  return student?.enrollmentDate ? String(student.enrollmentDate).slice(0, 7) : null;
}

export function activeInvoiceForPeriod(invoices, studentId, billingPeriod) {
  return invoices.find(
    (inv) =>
      inv.studentId === studentId &&
      inv.billingPeriod === billingPeriod &&
      inv.status !== "cancelled" &&
      !inv.cancelledAt
  );
}

export function monthPaymentState(invoice, today = todayLocal()) {
  if (!invoice) return { key: "none", label: "لا مستحق", badge: "badge-muted" };
  const status = deriveInvoiceStatus(invoice, today);
  if (status === "paid") return { key: "paid", label: "خالص", badge: "badge-paid" };
  if (BigInt(invoice.amountPaidPiastres ?? 0) > 0n && BigInt(invoice.outstandingPiastres ?? 0) > 0n) {
    return {
      key: "partial",
      label: status === "overdue" ? "دفع جزءًا · متأخر" : "دفع جزءًا",
      badge: "badge-partial",
    };
  }
  if (status === "overdue") return { key: "owed", label: "عليه فلوس", badge: "badge-owed" };
  return { key: "unpaid", label: "عليه فلوس", badge: "badge-owed" };
}

export function lastFullyPaidPeriod(invoices, studentId) {
  const paid = invoices
    .filter((inv) =>
      inv.studentId === studentId &&
      inv.status !== "cancelled" &&
      !inv.cancelledAt &&
      BigInt(inv.outstandingPiastres ?? 0) === 0n
    )
    .sort((a, b) => String(b.billingPeriod).localeCompare(String(a.billingPeriod)));
  return paid[0]?.billingPeriod || null;
}

export function studentOutstandingTotal(invoices, studentId) {
  return invoices
    .filter((inv) => inv.studentId === studentId && inv.status !== "cancelled" && !inv.cancelledAt)
    .reduce((sum, inv) => sum + BigInt(inv.outstandingPiastres ?? 0), 0n);
}

export function studentCreditTotal(credits, studentId) {
  return (credits || [])
    .filter((c) => c.studentId === studentId)
    .reduce((sum, c) => sum + BigInt(c.amountPiastres ?? 0), 0n);
}

export function periodStudentStats({ students, invoices, period, today = todayLocal() }) {
  const active = students.filter((s) => s.status === "active");
  let paid = 0;
  let partial = 0;
  let owed = 0;
  let owingBalances = 0;
  let none = 0;
  for (const student of active) {
    const inv = activeInvoiceForPeriod(invoices, student.id, period);
    const state = monthPaymentState(inv, today);
    if (studentOutstandingTotal(invoices, student.id) > 0n) owingBalances += 1;
    if (state.key === "paid") paid += 1;
    else if (state.key === "partial") partial += 1;
    else if (state.key === "owed" || state.key === "unpaid") owed += 1;
    else none += 1;
  }
  return {
    activeCount: active.length,
    paidCount: paid,
    partialCount: partial,
    owedCount: owingBalances,
    unpaidCount: owed,
    noneCount: none,
  };
}

export function canBillPeriod(student, period) {
  const start = enrollmentPeriod(student);
  if (!start) return true;
  return period >= start;
}

export function previewMonthlyInvoices({ students, groups, plans, existingInvoices, period, issueDate, dueDate }) {
  const created = [];
  const skipped = [];
  for (const student of students) {
    if (student.status !== "active") {
      skipped.push({ studentId: student.id, name: student.fullName, reason: "الطالب غير نشط" });
      continue;
    }
    const dup = findDuplicateInvoice(existingInvoices, student.id, period);
    if (dup) {
      skipped.push({ studentId: student.id, name: student.fullName, reason: "فاتورة موجودة لنفس الفترة" });
      continue;
    }
    const group = groups.find((g) => g.id === student.groupId);
    const plan = plans.find((p) => p.id === student.planId);
    const original = studentFeePiastres(student, group, plan);
    if (original <= 0n) {
      skipped.push({ studentId: student.id, name: student.fullName, reason: "لا يوجد مبلغ اشتراك محدد" });
      continue;
    }
    const amounts = computeInvoiceAmounts({ originalPiastres: original, discountPiastres: 0n, amountPaidPiastres: 0n });
    created.push({
      studentId: student.id,
      name: student.fullName,
      groupId: student.groupId || null,
      planId: student.planId || null,
      billingPeriod: period,
      issueDate,
      dueDate,
      ...amounts,
      status: deriveInvoiceStatus({ ...amounts, dueDate, status: "unpaid" }, issueDate),
    });
  }
  return { created, skipped };
}
