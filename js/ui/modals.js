import { el, formData, qs, setBusy } from "../utils/dom.js";
import {
  createInvoice,
  ensureInvoiceForPeriod,
  groupsRepo,
  invoicesRepo,
  loadSettings,
  plansRepo,
  recordMonthPayment,
  saveExpense,
  saveStudent,
  studentRelated,
  studentsRepo,
} from "../db/repositories.js";
import { formatMoney, formatPiastres, parsePoundsToPiastres } from "../utils/currency.js";
import {
  currentPeriod,
  formatDate,
  periodLabel,
  surroundingPeriods,
  todayLocal,
} from "../utils/dates.js";
import {
  activeInvoiceForPeriod,
  canBillPeriod,
  monthPaymentState,
  studentCreditTotal,
  studentFeePiastres,
  studentOutstandingTotal,
} from "../utils/finance.js";
import { confirmDialog, teacherError, toast } from "../utils/dialogs.js";
import { collectErrors, maxLength, required, validatePhone } from "../utils/validation.js";
import { createId } from "../utils/ids.js";
import { dataTable, field, paymentBadge, statusBadge } from "./components.js";
import { icon } from "./icons.js";
import { labelOf } from "../utils/formatting.js";
import { EXPENSE_CATEGORIES } from "../utils/finance.js";
import { APP_NAME } from "../utils/branding.js";

function modalRoot() {
  return document.getElementById("modal-root") || document.body;
}

export function closeModal() {
  const root = document.getElementById("modal-root");
  if (root) root.replaceChildren();
}

function overlay(child, { wide = false } = {}) {
  const node = el("div", { className: "modal-overlay", role: "dialog", "aria-modal": "true" },
    el("div", { className: wide ? "drawer" : "modal" }, child)
  );
  node.addEventListener("click", (e) => {
    if (e.target === node) closeModal();
  });
  document.addEventListener("keydown", function onKey(ev) {
    if (ev.key === "Escape") {
      closeModal();
      document.removeEventListener("keydown", onKey);
    }
  });
  return node;
}

export function avatarFor(name, index = 0) {
  const palettes = [
    ["#e8f1ff", "#3b6ea8"],
    ["#fde8f1", "#c45a86"],
    ["#e8f6ee", "#2a7a5a"],
    ["#f3e8fd", "#7a4aad"],
    ["#fff4e0", "#b7811a"],
    ["#e8fbf8", "#1f7a74"],
  ];
  const [bg, color] = palettes[Math.abs(index) % palettes.length];
  const letter = String(name || "ط").trim().charAt(0) || "ط";
  return el("div", { className: "avatar", style: `background:${bg};color:${color}` }, letter);
}

function toLocalInput(d = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export async function openPaymentModal({ studentId = "", period = currentPeriod(), onSaved } = {}) {
  const [students, invoices, groups, plans, settings] = await Promise.all([
    studentsRepo.all(), invoicesRepo.all(), groupsRepo.all(), plansRepo.all(), loadSettings(),
  ]);
  let selectedId = studentId || "";
  let selectedPeriods = new Set([period].filter(Boolean));
  let submitting = false;
  const idem = createId();

  const studentSearch = el("input", { placeholder: "ابحث عن الطالب بالاسم أو الهاتف", value: students.find((s) => s.id === selectedId)?.fullName || "" });
  const suggest = el("div", { className: "suggest hidden" });
  const monthsBox = el("div", { className: "filter-chips", id: "pay-months" });
  const amountInput = el("input", { name: "amount", inputmode: "decimal" });
  const preview = el("div", { className: "preview-box" });
  const paidAt = el("input", { type: "datetime-local", value: toLocalInput() });

  const feeOf = (student) => {
    const group = groups.find((g) => g.id === student?.groupId);
    const plan = plans.find((p) => p.id === student?.planId);
    return studentFeePiastres(student, group, plan);
  };

  const expectedFor = (student, periods = selectedPeriods) => [...periods].reduce((sum, p) => {
    const inv = activeInvoiceForPeriod(invoices, student.id, p);
    return sum + (inv ? BigInt(inv.outstandingPiastres || 0) : feeOf(student));
  }, 0n);

  const fillFullAmount = (student) => {
    const expected = expectedFor(student);
    if (expected <= 0n) return false;
    amountInput.value = formatPiastres(expected, { withCurrency: false, locale: "en-US", trimZeros: true });
    return true;
  };

  const refreshMonths = () => {
    const student = students.find((s) => s.id === selectedId);
    const around = surroundingPeriods(period, 4, 3);
    monthsBox.replaceChildren();
    for (const p of around) {
      if (student && !canBillPeriod(student, p)) continue;
      const inv = student ? activeInvoiceForPeriod(invoices, student.id, p) : null;
      const state = monthPaymentState(inv);
      const on = selectedPeriods.has(p);
      const chip = el("button", { type: "button", className: on ? "chip active" : "chip" },
        `${periodLabel(p)} — ${state.label}`
      );
      chip.addEventListener("click", () => {
        if (selectedPeriods.has(p)) selectedPeriods.delete(p);
        else selectedPeriods.add(p);
        refreshMonths();
        refreshPreview();
      });
      monthsBox.appendChild(chip);
    }
  };

  const refreshPreview = () => {
    const student = students.find((s) => s.id === selectedId);
    if (!student) {
      preview.textContent = "اختر طالبًا أولًا.";
      return;
    }
    const periods = [...selectedPeriods].sort();
    if (!periods.length) {
      preview.textContent = "اختر شهرًا واحدًا على الأقل.";
      return;
    }
    let expected = 0n;
    const lines = periods.map((p) => {
      const inv = activeInvoiceForPeriod(invoices, student.id, p);
      const due = inv ? BigInt(inv.outstandingPiastres || 0) : feeOf(student);
      expected += due;
      return `${periodLabel(p)}: ${formatMoney(due)}`;
    });
    const parsed = parsePoundsToPiastres(amountInput.value);
    const received = parsed.ok ? parsed.piastres : 0n;
    const remain = expected - received;
    preview.replaceChildren(
      el("div", {}, `الشهور: ${lines.join(" · ")}`),
      el("div", {}, `إجمالي المستحق المختار: ${formatMoney(expected)}`),
      el("div", {}, `المبلغ المستلم: ${formatMoney(received)}`),
      el("div", {}, remain > 0n ? `المتبقي بعد هذه الدفعة: ${formatMoney(remain)}` : remain < 0n ? `زيادة ستُحفظ كرصيد: ${formatMoney(-remain)}` : "ستُغطى الشهور المختارة بالكامل.")
    );
  };

  const paintSuggest = () => {
    const q = studentSearch.value.trim().toLowerCase();
    const list = students.filter((s) => s.status !== "archived").filter((s) => {
      if (!q) return false;
      return `${s.fullName} ${s.guardianPhone || ""} ${s.guardianName || ""}`.toLowerCase().includes(q);
    }).slice(0, 8);
    suggest.classList.toggle("hidden", !list.length);
    suggest.replaceChildren(...list.map((s) => {
      const btn = el("button", { type: "button" }, `${s.fullName} — ${s.guardianPhone || "بدون رقم"}`);
      btn.addEventListener("click", () => {
        selectedId = s.id;
        selectedPeriods = new Set([period].filter(Boolean));
        studentSearch.value = s.fullName;
        suggest.classList.add("hidden");
        refreshMonths();
        amountInput.value = "";
        fillFullAmount(s);
        refreshPreview();
      });
      return btn;
    }));
  };
  studentSearch.addEventListener("input", () => {
    const selectedStudent = students.find((s) => s.id === selectedId);
    if (selectedStudent && studentSearch.value.trim() !== selectedStudent.fullName) {
      selectedId = "";
      selectedPeriods = new Set([period].filter(Boolean));
      amountInput.value = "";
      refreshMonths();
      refreshPreview();
    }
    paintSuggest();
  });
  amountInput.addEventListener("input", refreshPreview);

  const form = el("div", { className: "stack" },
    el("div", { style: "display:flex;justify-content:space-between;align-items:center" },
      el("h2", { className: "modal-title" }, "تسجيل دفعة"),
      el("button", { type: "button", className: "icon-btn", onclick: closeModal, "aria-label": "إغلاق" }, icon("close"))
    ),
    field("الطالب", studentSearch, { required: true }),
    suggest,
    field("الشهور", monthsBox),
    field("المبلغ بالجنيه", amountInput, { required: true }),
    field("وقت الاستلام", paidAt),
    preview,
    el("p", { className: "muted" }, "إذا كان المبلغ لا يغطي الشهور المختارة سيُسجَّل جزء منها فقط. الزيادة تُحفظ كرصيد ولا تُضاف لشهر آخر تلقائيًا."),
    el("div", { className: "modal-actions" },
      el("button", { type: "button", className: "btn btn-ghost", onclick: closeModal }, "إلغاء"),
      el("button", { type: "button", className: "btn btn-ghost", id: "pay-full" }, "ملء كامل المستحق"),
      el("button", { type: "button", className: "btn", id: "pay-save" }, "حفظ المبلغ المدخل")
    )
  );

  const submit = async () => {
    if (submitting) return;
    const student = students.find((s) => s.id === selectedId);
    if (!student) { toast("اختر الطالب.", "error"); return; }
    const periods = [...selectedPeriods].sort();
    if (!periods.length) { toast("اختر شهرًا.", "error"); return; }
    const parsed = parsePoundsToPiastres(amountInput.value);
    if (!parsed.ok) { toast(parsed.error, "error"); return; }
    if (parsed.piastres <= 0n) { toast("مبلغ الدفعة يجب أن يكون أكبر من صفر.", "error"); return; }
    const expected = periods.reduce((sum, p) => {
      const inv = activeInvoiceForPeriod(invoices, student.id, p);
      return sum + (inv ? BigInt(inv.outstandingPiastres || 0) : feeOf(student));
    }, 0n);
    if (expected <= 0n) { toast("لا يوجد مبلغ متبقٍ على الشهور المختارة.", "error"); return; }
    const ok = await confirmDialog({
      title: "تأكيد التسجيل",
      message: `حفظ ${formatMoney(parsed.piastres)} لـ ${student.fullName} عن ${periods.map(periodLabel).join("، ")}؟`,
      confirmText: "حفظ الدفعة",
    });
    if (!ok) return;
    submitting = true;
    const btn = form.querySelector("#pay-save");
    setBusy(btn, true, "جارٍ الحفظ...");
    try {
      await recordMonthPayment({
        studentId: student.id,
        periods,
        amountPiastres: parsed.piastres,
        paidAt: paidAt.value,
        method: "cash",
        idempotencyKey: idem,
      });
      toast("تم تسجيل الدفعة.", "success");
      closeModal();
      if (onSaved) await onSaved();
    } catch (err) {
      teacherError(err, "لم يتم حفظ الدفعة.");
    } finally {
      submitting = false;
      setBusy(btn, false);
    }
  };

  form.querySelector("#pay-full").addEventListener("click", () => {
    const student = students.find((s) => s.id === selectedId);
    if (!student) { toast("اختر الطالب أولًا.", "error"); return; }
    if (!fillFullAmount(student)) { toast("لا يوجد مبلغ متبقٍ على الشهور المختارة.", "error"); return; }
    refreshPreview();
    amountInput.focus();
  });
  form.querySelector("#pay-save").addEventListener("click", submit);

  modalRoot().replaceChildren(overlay(form));
  refreshMonths();
  const initialStudent = students.find((s) => s.id === selectedId);
  if (initialStudent) fillFullAmount(initialStudent);
  refreshPreview();
}

export async function openStudentFormModal({ studentId = "", onSaved } = {}) {
  const [student, groups, plans] = await Promise.all([
    studentId ? studentsRepo.get(studentId) : null,
    groupsRepo.all(),
    plansRepo.all(),
  ]);
  const feeVal = student?.customFeePiastres != null && student.customFeePiastres !== ""
    ? formatPiastres(student.customFeePiastres, { withCurrency: false, locale: "en-US", trimZeros: true })
    : "";
  const form = el("form", { className: "stack" },
    el("div", { style: "display:flex;justify-content:space-between;align-items:center" },
      el("h2", { className: "modal-title" }, student ? "تعديل طالب" : "طالب جديد"),
      el("button", { type: "button", className: "icon-btn", onclick: closeModal, "aria-label": "إغلاق" }, icon("close"))
    ),
    field("اسم الطالب", el("input", { name: "fullName", required: true, value: student?.fullName || "" }), { required: true }),
    field("رقم ولي الأمر (اختياري)", el("input", { name: "guardianPhone", value: student?.guardianPhone || "" })),
    field("قيمة الاشتراك الشهري بالجنيه", el("input", { name: "customFee", inputmode: "decimal", required: true, value: feeVal }), { required: true }),
    field("تاريخ بداية الاشتراك", el("input", { name: "enrollmentDate", type: "date", required: true, value: student?.enrollmentDate || todayLocal() }), { required: true }),
    field("المجموعة", el("select", { name: "groupId" },
      el("option", { value: "" }, "بدون مجموعة"),
      ...groups.filter((g) => g.status !== "archived" || g.id === student?.groupId).map((g) => el("option", { value: g.id, selected: g.id === student?.groupId || undefined }, g.name))
    )),
    el("details", { className: "extra" },
      el("summary", {}, "تفاصيل إضافية"),
      field("اسم ولي الأمر", el("input", { name: "guardianName", value: student?.guardianName || "" })),
      field("هاتف بديل", el("input", { name: "altContact", value: student?.altContact || "" })),
      field("العنوان", el("input", { name: "address", value: student?.address || "" })),
      field("ملاحظات", el("textarea", { name: "notes" }, student?.notes || ""))
    ),
    el("p", { className: "muted" }, "لن تُنشأ مستحقات للشهور السابقة تلقائيًا. سجّل الدفع عند الاستلام."),
    el("div", { className: "modal-actions" },
      el("button", { type: "button", className: "btn btn-ghost", onclick: closeModal }, "إلغاء"),
      el("button", { className: "btn", type: "submit" }, "حفظ")
    )
  );
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = form.querySelector("[type=submit]");
    setBusy(btn, true);
    try {
      const data = formData(form);
      const errors = collectErrors([
        required(data.fullName, "الاسم"),
        required(data.enrollmentDate, "تاريخ بداية الاشتراك"),
        data.guardianPhone ? validatePhone(data.guardianPhone, { required: false }) : null,
        maxLength(data.notes, 2000, "الملاحظات"),
      ]);
      const parsed = parsePoundsToPiastres(data.customFee);
      if (!parsed.ok) errors.push(parsed.error);
      if (errors.length) { toast(errors[0], "error"); return; }
      const result = await saveStudent({
        id: student?.id,
        fullName: data.fullName,
        guardianName: data.guardianName || "",
        guardianPhone: data.guardianPhone || "",
        altContact: data.altContact || "",
        enrollmentDate: data.enrollmentDate,
        groupId: data.groupId || null,
        planId: student?.planId || null,
        customFeePiastres: parsed.piastres,
        status: student?.status || "active",
        notes: data.notes || "",
        address: data.address || "",
      });
      toast(result.duplicates.length ? "حُفظ الطالب. يوجد اسم مشابه." : "تم حفظ الطالب.", "success");
      closeModal();
      if (onSaved) await onSaved(result.record);
    } catch (err) {
      teacherError(err);
    } finally {
      setBusy(btn, false);
    }
  });
  modalRoot().replaceChildren(overlay(form));
}

export async function openStudentDrawer({ studentId, onSaved }) {
  const student = await studentsRepo.get(studentId);
  if (!student) { toast("الطالب غير موجود.", "error"); return; }
  const [groups, related, plans] = await Promise.all([groupsRepo.all(), studentRelated(student.id), plansRepo.all()]);
  const group = groups.find((g) => g.id === student.groupId);
  const outstanding = studentOutstandingTotal(related.invoices, student.id);
  const credit = studentCreditTotal(related.credits, student.id);
  const months = related.invoices
    .filter((i) => i.status !== "cancelled")
    .sort((a, b) => b.billingPeriod.localeCompare(a.billingPeriod));
  const body = el("div", { className: "stack" },
    el("div", { style: "display:flex;justify-content:space-between;align-items:center;gap:8px" },
      el("div", { className: "person" },
        avatarFor(student.fullName, 0),
        el("div", {},
          el("h2", { className: "modal-title" }, student.fullName),
          el("p", { className: "muted" }, student.guardianPhone || "بدون رقم ولي أمر")
        )
      ),
      el("button", { type: "button", className: "icon-btn", onclick: closeModal, "aria-label": "إغلاق" }, icon("close"))
    ),
    el("p", {}, `الاشتراك الشهري: ${formatMoney(studentFeePiastres(student, group, plans.find((p) => p.id === student.planId)))}`),
    el("p", {}, `إجمالي المتأخرات: ${formatMoney(outstanding)}`),
    credit > 0n ? el("p", {}, `رصيد دائن: ${formatMoney(credit)}`) : null,
    el("p", { className: "muted" }, `${group?.name || "بدون مجموعة"} · بدأ ${formatDate(student.enrollmentDate)}`),
    el("div", { className: "row-actions" },
      el("button", { type: "button", className: "btn", onclick: () => openPaymentModal({ studentId: student.id, onSaved }) }, "تسجيل دفعة"),
      el("button", { type: "button", className: "btn btn-ghost", onclick: () => openStudentFormModal({ studentId: student.id, onSaved }) }, "تعديل")
    ),
    el("h3", {}, "الشهور"),
    dataTable(
      ["الشهر", "المستحق", "المدفوع", "المتبقي", "الحالة"],
      months.map((i) => [
        periodLabel(i.billingPeriod),
        formatMoney(i.finalAmountPiastres),
        formatMoney(i.amountPaidPiastres),
        formatMoney(i.outstandingPiastres),
        paymentBadge(monthPaymentState(i)),
      ]),
      { empty: "لا توجد مستحقات مسجّلة بعد." }
    ),
    el("h3", {}, "آخر الدفعات"),
    dataTable(
      ["التاريخ", "المبلغ", "الحالة"],
      related.payments.sort((a, b) => String(b.paidAt).localeCompare(String(a.paidAt))).slice(0, 8).map((p) => [
        String(p.paidAt).slice(0, 16).replace("T", " "),
        formatMoney(p.amountPiastres),
        statusBadge("paymentStatus", p.status),
      ]),
      { empty: "لا دفعات بعد." }
    )
  );
  modalRoot().replaceChildren(overlay(body, { wide: true }));
}

export async function openExpenseModal({ onSaved } = {}) {
  const form = el("form", { className: "stack" },
    el("div", { style: "display:flex;justify-content:space-between;align-items:center" },
      el("h2", { className: "modal-title" }, "إضافة مصروف"),
      el("button", { type: "button", className: "icon-btn", onclick: closeModal, "aria-label": "إغلاق" }, icon("close"))
    ),
    field("التاريخ", el("input", { type: "date", name: "date", required: true, value: todayLocal() })),
    field("المبلغ بالجنيه", el("input", { name: "amount", required: true, inputmode: "decimal" })),
    field("التصنيف", el("select", { name: "category" },
      ...EXPENSE_CATEGORIES.map((c) => el("option", { value: c }, labelOf("expenseCategory", c)))
    )),
    field("الوصف", el("input", { name: "description", required: true })),
    el("div", { className: "modal-actions" },
      el("button", { type: "button", className: "btn btn-ghost", onclick: closeModal }, "إلغاء"),
      el("button", { className: "btn", type: "submit" }, "حفظ")
    )
  );
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = form.querySelector("[type=submit]");
    const data = formData(form);
    const parsed = parsePoundsToPiastres(data.amount);
    if (!parsed.ok) { toast(parsed.error, "error"); return; }
    setBusy(btn, true);
    try {
      await saveExpense({
        date: data.date,
        amountPiastres: parsed.piastres,
        category: data.category,
        description: data.description,
        status: "paid",
        method: "cash",
      });
      toast("تم حفظ المصروف.", "success");
      closeModal();
      if (onSaved) await onSaved();
    } catch (err) {
      teacherError(err);
    } finally {
      setBusy(btn, false);
    }
  });
  modalRoot().replaceChildren(overlay(form));
}

export async function printMonthReceipts(period) {
  const [payments, students, settings] = await Promise.all([
    (await import("../db/repositories.js")).paymentsRepo.all(),
    studentsRepo.all(),
    loadSettings(),
  ]);
  const list = payments.filter((p) => p.status === "posted" && String(p.paidAt).slice(0, 7) === period);
  const nameOf = (id) => students.find((s) => s.id === id)?.fullName || "—";
  const win = window.open("", "_blank");
  if (!win) {
    toast("اسمح بالنوافذ المنبثقة لطباعة الإيصالات.", "error");
    return;
  }
  win.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>إيصالات ${period} - ${settings.appName || APP_NAME}</title>
    <style>body{font-family:Tahoma,Arial,sans-serif;padding:16px} .r{border:1px solid #ccc;border-radius:12px;padding:12px;margin:12px 0}</style>
    </head><body><h1>${settings.appName || APP_NAME}</h1><p>إيصالات ${period}</p>`);
  if (!list.length) win.document.write("<p>لا توجد دفعات مسجّلة في هذا الشهر.</p>");
  for (const p of list) {
    win.document.write(`<div class="r"><strong>${nameOf(p.studentId)}</strong><div>${formatMoney(p.amountPiastres)}</div><div>${String(p.paidAt).slice(0, 16)}</div><div>رقم: ${p.receiptNumber || p.id.slice(0, 8)}</div></div>`);
  }
  win.document.write("</body></html>");
  win.document.close();
  win.focus();
  win.print();
}
