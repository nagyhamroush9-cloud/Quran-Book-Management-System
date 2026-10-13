import { el } from "../utils/dom.js";
import {
  attendanceRepo, expensesRepo, groupsRepo, invoicesRepo, memorizationRepo,
  paymentsRepo, studentsRepo,
} from "../db/repositories.js";
import { computeFinancials } from "../utils/finance.js";
import { formatPiastres } from "../utils/currency.js";
import { currentPeriod, endOfMonth, formatDate, startOfMonth } from "../utils/dates.js";
import { dataTable } from "../ui/components.js";
import { downloadCsv, moneyCsv } from "../utils/export.js";
import { labelOf } from "../utils/formatting.js";
import { surahLabel } from "../data/quran-meta.js";

export async function renderReports(root) {
  const [students, groups, invoices, payments, expenses, attendance, memo] = await Promise.all([
    studentsRepo.all(), groupsRepo.all(), invoicesRepo.all(), paymentsRepo.all(),
    expensesRepo.all(), attendanceRepo.all(), memorizationRepo.all(),
  ]);
  const period = el("input", { type: "month", value: currentPeriod() });
  const out = el("div", { id: "report-out", className: "stack" });
  const nameOf = (id) => students.find((s) => s.id === id)?.fullName || "—";

  const run = (type) => {
    const p = period.value;
    if (type === "directory") {
      tableOut(out, "دليل الطلاب", ["الاسم", "ولي الأمر", "الهاتف", "الحالة"],
        students.map((s) => [s.fullName, s.guardianName, s.guardianPhone, labelOf("studentStatus", s.status)]),
        students, [
          { label: "الاسم", key: "fullName" }, { label: "ولي الأمر", key: "guardianName" },
          { label: "الهاتف", key: "guardianPhone" }, { label: "الحالة", value: (r) => labelOf("studentStatus", r.status) },
        ], "students.csv");
    } else if (type === "active") {
      const rows = students.filter((s) => s.status === "active" || s.status === "inactive");
      tableOut(out, "النشط وغير النشط", ["الاسم", "الحالة"], rows.map((s) => [s.fullName, labelOf("studentStatus", s.status)]), rows, [
        { label: "الاسم", key: "fullName" }, { label: "الحالة", value: (r) => labelOf("studentStatus", r.status) },
      ], "status.csv");
    } else if (type === "invoices") {
      const rows = invoices.filter((i) => i.billingPeriod === p);
      tableOut(out, "فواتير الاشتراك", ["الطالب", "المستحق", "المدفوع", "المتبقي", "الحالة"],
        rows.map((i) => [nameOf(i.studentId), formatPiastres(i.finalAmountPiastres), formatPiastres(i.amountPaidPiastres), formatPiastres(i.outstandingPiastres), labelOf("invoiceStatus", i.status)]),
        rows, invoiceHeaders(nameOf), `invoices-${p}.csv`);
    } else if (type === "outstanding") {
      const rows = invoices.filter((i) => i.status !== "cancelled" && BigInt(i.outstandingPiastres) > 0n);
      tableOut(out, "المتبقي", ["الطالب", "الفترة", "المتبقي"],
        rows.map((i) => [nameOf(i.studentId), i.billingPeriod, formatPiastres(i.outstandingPiastres)]),
        rows, [
          { label: "الطالب", value: (r) => nameOf(r.studentId) }, { label: "الفترة", key: "billingPeriod" },
          { label: "المتبقي", value: (r) => moneyCsv(r.outstandingPiastres) },
        ], "outstanding.csv");
    } else if (type === "collections") {
      const rows = payments.filter((pay) => String(pay.paidAt).slice(0, 7) === p);
      tableOut(out, "تحصيل الشهر", ["التاريخ", "الطالب", "المبلغ", "الحالة"],
        rows.map((pay) => [String(pay.paidAt).slice(0, 10), nameOf(pay.studentId), formatPiastres(pay.amountPiastres), labelOf("paymentStatus", pay.status)]),
        rows, [
          { label: "التاريخ", value: (r) => String(r.paidAt).slice(0, 10) },
          { label: "الطالب", value: (r) => nameOf(r.studentId) },
          { label: "المبلغ", value: (r) => moneyCsv(r.amountPiastres) },
          { label: "الحالة", value: (r) => r.status },
        ], `collections-${p}.csv`);
    } else if (type === "daily") {
      const rows = payments.filter((pay) => pay.status === "posted" && String(pay.paidAt).slice(0, 7) === p);
      const byDay = {};
      for (const pay of rows) {
        const d = String(pay.paidAt).slice(0, 10);
        byDay[d] = (byDay[d] || 0n) + BigInt(pay.amountPiastres);
      }
      const days = Object.keys(byDay).sort();
      tableOut(out, "تحصيل يومي", ["اليوم", "المحصّل"], days.map((d) => [formatDate(d), formatPiastres(byDay[d])]),
        days.map((d) => ({ date: d, amount: byDay[d] })),
        [{ label: "اليوم", key: "date" }, { label: "المحصّل", value: (r) => moneyCsv(r.amount) }],
        `daily-${p}.csv`);
    } else if (type === "monthsum") {
      const fin = computeFinancials({ invoices, payments, expenses, period: p });
      out.replaceChildren(
        el("div", { className: "card stack" },
          el("h3", {}, `ملخص ${p}`),
          el("p", {}, `المفوتر (غير الملغى): ${formatPiastres(fin.invoiced)}`),
          el("p", {}, `المحصّل (دفعات مسجّلة غير معكوسة): ${formatPiastres(fin.collected)}`),
          el("p", {}, `المتبقي: ${formatPiastres(fin.outstanding)}`),
          el("p", {}, `المصروفات المدفوعة: ${formatPiastres(fin.expensesPaid)}`),
          el("p", {}, `صافي النقد: ${formatPiastres(fin.netCash)}`),
          el("p", { className: "muted" }, "المفوتر ≠ المحصّل. المتبقي ليس إيرادًا. المصروف غير المدفوع لا يُخصم.")
        )
      );
    } else if (type === "expenses") {
      const rows = expenses.filter((e) => e.date.startsWith(p));
      tableOut(out, "المصروفات", ["التاريخ", "التصنيف", "المبلغ", "الحالة"],
        rows.map((e) => [e.date, labelOf("expenseCategory", e.category), formatPiastres(e.amountPiastres), labelOf("expenseStatus", e.status)]),
        rows, [
          { label: "التاريخ", key: "date" }, { label: "التصنيف", key: "category" },
          { label: "المبلغ", value: (r) => moneyCsv(r.amountPiastres) }, { label: "الحالة", key: "status" },
        ], `expenses-${p}.csv`);
    } else if (type === "attendance") {
      const from = startOfMonth(p);
      const to = endOfMonth(p);
      const rows = attendance.filter((a) => a.date >= from && a.date <= to);
      tableOut(out, "الحضور", ["التاريخ", "الطالب", "الحالة"],
        rows.map((a) => [a.date, nameOf(a.studentId), labelOf("attendance", a.status)]),
        rows, [
          { label: "التاريخ", key: "date" }, { label: "الطالب", value: (r) => nameOf(r.studentId) }, { label: "الحالة", key: "status" },
        ], `attendance-${p}.csv`);
    } else if (type === "memo") {
      const rows = memo.filter((m) => m.date.startsWith(p));
      tableOut(out, "نشاط الحفظ", ["التاريخ", "الطالب", "السورة", "النوع"],
        rows.map((m) => [m.date, nameOf(m.studentId), surahLabel(m.surahNumber), labelOf("activity", m.activityType)]),
        rows, [
          { label: "التاريخ", key: "date" }, { label: "الطالب", value: (r) => nameOf(r.studentId) },
          { label: "السورة", value: (r) => surahLabel(r.surahNumber) }, { label: "النوع", key: "activityType" },
        ], `memorization-${p}.csv`);
    }
  };

  root.replaceChildren(
    el("div", { className: "toolbar no-print" },
      fieldish("الشهر", period),
      ...[
        ["directory", "دليل الطلاب"],
        ["active", "نشط/غير نشط"],
        ["invoices", "فواتير"],
        ["outstanding", "متبقي"],
        ["collections", "تحصيل"],
        ["daily", "تحصيل يومي"],
        ["monthsum", "ملخص مالي"],
        ["expenses", "مصروفات"],
        ["attendance", "حضور"],
        ["memo", "حفظ"],
      ].map(([id, label]) => el("button", { className: "btn btn-ghost btn-sm", type: "button", onclick: () => run(id) }, label)),
      el("button", { className: "btn btn-sm", type: "button", onclick: () => window.print() }, "طباعة")
    ),
    out
  );
}

function fieldish(label, input) {
  return el("label", { className: "field" }, el("span", {}, label), input);
}

function invoiceHeaders(nameOf) {
  return [
    { label: "الطالب", value: (r) => nameOf(r.studentId) },
    { label: "الفترة", key: "billingPeriod" },
    { label: "المستحق", value: (r) => moneyCsv(r.finalAmountPiastres) },
    { label: "المدفوع", value: (r) => moneyCsv(r.amountPaidPiastres) },
    { label: "المتبقي", value: (r) => moneyCsv(r.outstandingPiastres) },
    { label: "الحالة", key: "status" },
  ];
}

function tableOut(out, title, headers, displayRows, rawRows, csvHeaders, filename) {
  out.replaceChildren(
    el("div", { className: "card" },
      el("div", { className: "toolbar no-print" },
        el("h3", { style: "margin:0;flex:1" }, title),
        el("button", { className: "btn btn-ghost btn-sm", type: "button", onclick: () => downloadCsv(filename, rawRows, csvHeaders) }, "CSV")
      ),
      dataTable(headers, displayRows, { empty: "لا بيانات في هذا التقرير." })
    )
  );
}
