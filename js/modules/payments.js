import { el, formData, setBusy } from "../utils/dom.js";
import {
  invoicesRepo, paymentsRepo, studentsRepo, recordPayment, voidPayment, updatePaymentMeta,
  allocationsRepo, loadSettings,
} from "../db/repositories.js";
import { formatPiastres, parsePoundsToPiastres } from "../utils/currency.js";
import { currentPeriod, formatDateTime } from "../utils/dates.js";
import { confirmDialog, toast, teacherError } from "../utils/dialogs.js";
import { dataTable, emptyState, field, statusBadge } from "../ui/components.js";
import { labelOf } from "../utils/formatting.js";
import { createId } from "../utils/ids.js";
import { navigate } from "../router.js";
import { openPaymentModal } from "../ui/modals.js";
import { APP_NAME } from "../utils/branding.js";

export async function renderPayments(root, ctx) {
  if (ctx.path === "/payments/new" || ctx.path?.startsWith("/payments/new")) {
    return renderPaymentForm(root, ctx);
  }
  if (ctx.params?.id && ctx.path?.includes("/receipt")) {
    return renderReceipt(root, ctx.params.id);
  }
  if (ctx.params?.id) return renderPaymentDetail(root, ctx.params.id);

  const [payments, students] = await Promise.all([paymentsRepo.all(), studentsRepo.all()]);
  const period = ctx.query?.period || currentPeriod();
  const list = payments
    .filter((p) => String(p.paidAt).slice(0, 7) === period)
    .sort((a, b) => String(b.paidAt).localeCompare(String(a.paidAt)));
  const nameOf = (id) => students.find((s) => s.id === id)?.fullName || "—";
  const collected = list.filter((p) => p.status === "posted").reduce((a, p) => a + BigInt(p.amountPiastres), 0n);
  const periodInput = el("input", { type: "month", value: period });
  periodInput.addEventListener("change", () => { location.hash = `#/payments?period=${periodInput.value}`; });

  root.replaceChildren(
    el("div", { className: "toolbar" },
      periodInput,
      el("button", { className: "btn", type: "button", onclick: () => openPaymentModal({ period, onSaved: () => location.reload() }) }, "تسجيل دفعة"),
      el("span", { className: "muted" }, `تحصيل الشهر (بدون الملغي): ${formatPiastres(collected)}`)
    ),
    list.length ? dataTable(
      ["التاريخ", "الطالب", "المبلغ", "الطريقة", "الحالة", ""],
      list.map((p) => [
        String(p.paidAt).slice(0, 16).replace("T", " "),
        nameOf(p.studentId),
        formatPiastres(p.amountPiastres),
        labelOf("paymentMethod", p.method),
        statusBadge("paymentStatus", p.status),
        el("a", { href: `#/payments/${p.id}` }, "عرض"),
      ])
    ) : emptyState("لا توجد دفعات في هذا الشهر.", el("a", { className: "btn", href: "#/payments/new" }, "تسجيل دفعة"))
  );
}

async function renderPaymentForm(root, ctx) {
  const [students, invoices] = await Promise.all([studentsRepo.all(), invoicesRepo.all()]);
  const pre = ctx.query?.student || "";
  let submitting = false;
  const idem = createId();
  const form = el("form", { className: "card stack" },
    el("h3", {}, "تسجيل دفعة"),
    field("الطالب", el("select", { name: "studentId", required: true, id: "pay-student" },
      el("option", { value: "" }, "اختر الطالب"),
      ...students.filter((s) => s.status !== "archived").map((s) => el("option", { value: s.id, selected: s.id === pre || undefined }, s.fullName))
    ), { required: true }),
    el("div", { id: "open-inv", className: "muted" }),
    field("المبلغ (جنيه)", el("input", { name: "amount", required: true, inputmode: "decimal" }), { required: true }),
    field("التاريخ والوقت", el("input", { name: "paidAt", type: "datetime-local", required: true, value: toLocalInput(new Date()) })),
    field("طريقة الدفع", el("select", { name: "method" },
      ...["cash", "bank", "wallet", "other"].map((m) => el("option", { value: m }, labelOf("paymentMethod", m)))
    )),
    field("رقم الإيصال (اختياري)", el("input", { name: "receiptNumber" })),
    field("ملاحظات", el("textarea", { name: "notes" })),
    el("p", { className: "muted" }, "إذا زاد المبلغ عن المتبقي على الفواتير، تُحفظ الزيادة كرصيد دائن للطالب ولا تُجعل الفاتورة سالبة."),
    el("div", { className: "row-actions" },
      el("button", { className: "btn", type: "submit" }, "تأكيد التسجيل"),
      el("a", { className: "btn btn-ghost", href: "#/payments" }, "إلغاء")
    )
  );
  const refreshInv = () => {
    const sid = form.querySelector("[name=studentId]").value;
    const open = invoices.filter((i) => i.studentId === sid && i.status !== "cancelled" && BigInt(i.outstandingPiastres) > 0n);
    const box = form.querySelector("#open-inv");
    if (!sid) { box.textContent = ""; return; }
    if (!open.length) box.textContent = "لا توجد فواتير متبقية. ستُحفظ الدفعة كرصيد دائن.";
    else box.replaceChildren(el("p", {}, "الفواتير المفتوحة:"), el("ul", {}, ...open.map((i) => el("li", {}, `${i.billingPeriod} — متبقي ${formatPiastres(i.outstandingPiastres)}`))));
  };
  form.querySelector("[name=studentId]").addEventListener("change", refreshInv);
  refreshInv();
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (submitting) return;
    const btn = form.querySelector("[type=submit]");
    const data = formData(form);
    const parsed = parsePoundsToPiastres(data.amount);
    if (!parsed.ok) { toast(parsed.error, "error"); return; }
    if (parsed.piastres <= 0n) { toast("مبلغ الدفعة يجب أن يكون أكبر من صفر.", "error"); return; }
    const ok = await confirmDialog({
      title: "تأكيد الدفعة",
      message: `تسجيل ${formatPiastres(parsed.piastres)} للطالب المختار؟ لا يُعتبر التحصيل مكتملًا إلا بعد نجاح الحفظ.`,
      confirmText: "حفظ الدفعة",
    });
    if (!ok) return;
    submitting = true;
    setBusy(btn, true, "جارٍ الحفظ...");
    try {
      const result = await recordPayment({
        studentId: data.studentId,
        amountPiastres: parsed.piastres,
        paidAt: data.paidAt,
        method: data.method,
        receiptNumber: data.receiptNumber,
        notes: data.notes,
        idempotencyKey: idem,
      });
      toast("تم حفظ الدفعة في قاعدة البيانات.", "success");
      navigate(`#/payments/${result.payment.id}/receipt`);
    } catch (err) {
      teacherError(err, "لم يتم حفظ الدفعة.");
    } finally {
      submitting = false;
      setBusy(btn, false);
    }
  });
  root.replaceChildren(form);
}

async function renderPaymentDetail(root, id) {
  const payment = await paymentsRepo.get(id);
  if (!payment) { root.replaceChildren(el("p", {}, "الدفعة غير موجودة.")); return; }
  const [student, allocs] = await Promise.all([studentsRepo.get(payment.studentId), allocationsRepo.byIndex("paymentId", id)]);
  root.replaceChildren(
    el("div", { className: "card stack" },
      el("h2", {}, `دفعة ${formatPiastres(payment.amountPiastres)}`),
      el("p", {}, student?.fullName || ""),
      el("p", {}, formatDateTime(payment.paidAt)),
      statusBadge("paymentStatus", payment.status),
      el("p", {}, `طريقة الدفع: ${labelOf("paymentMethod", payment.method)}`),
      el("div", { className: "row-actions no-print" },
        el("a", { className: "btn", href: `#/payments/${id}/receipt` }, "إيصال للطباعة"),
        payment.status === "posted" ? el("button", { className: "btn btn-danger", type: "button", onclick: async () => {
          const ok = await confirmDialog({ title: "عكس الدفعة", message: "لن تُحذف. ستُزال من التحصيل ويُعاد المتبقي إلى الفواتير.", danger: true, confirmText: "عكس" });
          if (!ok) return;
          const reason = "عكس يدوي لدفعة خاطئة";
          try {
            await voidPayment(id, reason);
            toast("تم عكس الدفعة.", "success");
            location.reload();
          } catch (err) { teacherError(err); }
        } }, "عكس / إلغاء التأثير") : null
      )
    ),
    el("div", { className: "card", style: "margin-top:12px" },
      el("h3", {}, "توزيع الدفعة على الفواتير"),
      dataTable(["الفاتورة", "المبلغ"], allocs.map((a) => [a.invoiceId.slice(0, 8), formatPiastres(a.amountPiastres)]), { empty: "لا يوجد توزيع (رصيد دائن بالكامل أو بدون فواتير)." })
    )
  );
}

async function renderReceipt(root, id) {
  const payment = await paymentsRepo.get(id);
  const [student, settings, allocs, invoices] = await Promise.all([
    studentsRepo.get(payment.studentId), loadSettings(), allocationsRepo.byIndex("paymentId", id), invoicesRepo.all(),
  ]);
  const related = invoices.filter((i) => allocs.some((a) => a.invoiceId === i.id));
  const remaining = related.reduce((a, i) => a + BigInt(i.outstandingPiastres || 0), 0n);
  root.replaceChildren(
    el("div", { className: "toolbar no-print" },
      el("button", { className: "btn", type: "button", onclick: () => window.print() }, "طباعة"),
      el("a", { className: "btn btn-ghost", href: `#/payments/${id}` }, "رجوع")
    ),
    el("div", { className: "card receipt" },
      el("h1", {}, settings.appName || APP_NAME),
      el("p", {}, "إيصال تحصيل"),
      el("div", { className: "receipt-meta" },
        el("div", {}, `رقم الإيصال: ${payment.receiptNumber || payment.id.slice(0, 8)}`),
        el("div", {}, `التاريخ: ${formatDateTime(payment.paidAt)}`),
        el("div", {}, `الطالب: ${student?.fullName || ""}`),
        el("div", {}, `المبلغ: ${formatPiastres(payment.amountPiastres)}`),
        el("div", {}, `الطريقة: ${labelOf("paymentMethod", payment.method)}`),
        el("div", {}, `الفترة/الفواتير: ${related.map((i) => i.billingPeriod).join("، ") || "—"}`),
        el("div", {}, `المتبقي على الفواتير المرتبطة: ${formatPiastres(remaining)}`),
        el("div", {}, `الحالة: ${payment.status === "posted" ? "مسجّلة" : "معكوسة"}`)
      ),
      payment.notes ? el("p", {}, payment.notes) : null,
      el("div", { className: "sign-line" }, "توقيع المعلم")
    )
  );
}

function toLocalInput(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
