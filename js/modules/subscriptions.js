import { el, formData, setBusy } from "../utils/dom.js";
import {
  cancelInvoice, createInvoice, generateMonthlyInvoices, groupsRepo, invoicesRepo,
  plansRepo, savePlan, studentsRepo, loadSettings,
} from "../db/repositories.js";
import { formatPiastres, parsePoundsToPiastres } from "../utils/currency.js";
import { currentPeriod, dueDateForPeriod, periodLabel, todayLocal } from "../utils/dates.js";
import { previewMonthlyInvoices } from "../utils/finance.js";
import { confirmDialog, toast, teacherError } from "../utils/dialogs.js";
import { dataTable, emptyState, field, statusBadge } from "../ui/components.js";
import { labelOf } from "../utils/formatting.js";
import { navigate } from "../router.js";
import { renderLedger } from "./ledger.js";

export async function renderSubscriptions(root, ctx) {
  const tab = ctx.query?.tab || "notebook";
  const [plans, invoices, students, groups] = await Promise.all([
    plansRepo.all(), invoicesRepo.all(), studentsRepo.all(), groupsRepo.all(),
  ]);
  const nameOf = (id) => students.find((s) => s.id === id)?.fullName || "—";
  root.replaceChildren(
    el("div", { className: "toolbar" },
      el("a", { className: tab === "notebook" ? "btn" : "btn btn-ghost", href: "#/subscriptions?tab=notebook" }, "كراسة الشهور"),
      el("a", { className: tab === "invoices" ? "btn" : "btn btn-ghost", href: "#/subscriptions?tab=invoices" }, "الفواتير"),
      el("a", { className: tab === "generate" ? "btn" : "btn btn-ghost", href: "#/subscriptions?tab=generate" }, "إنشاء فواتير الشهر"),
      el("a", { className: tab === "plans" ? "btn" : "btn btn-ghost", href: "#/subscriptions?tab=plans" }, "الخطط"),
      el("a", { className: "btn", href: "#/subscriptions/new-invoice" }, "فاتورة يدوية")
    )
  );
  const host = el("div");
  root.appendChild(host);
  if (tab === "notebook" && ctx.path !== "/subscriptions/new-invoice") {
    await renderLedger(host, ctx);
    return;
  }
  if (ctx.path === "/subscriptions/new-invoice") {
    await invoiceForm(host, { students, groups, plans });
    return;
  }
  if (tab === "plans") {
    await plansView(host, plans);
    return;
  }
  if (tab === "generate") {
    await generateView(host, { students, groups, plans, invoices });
    return;
  }
  const period = ctx.query?.period || "";
  const status = ctx.query?.status || "";
  let list = [...invoices].sort((a, b) => b.billingPeriod.localeCompare(a.billingPeriod) || nameOf(a.studentId).localeCompare(nameOf(b.studentId), "ar"));
  if (period) list = list.filter((i) => i.billingPeriod === period);
  if (status) list = list.filter((i) => i.status === status);
  host.append(
    el("div", { className: "toolbar" },
      el("input", { type: "month", id: "inv-period", value: period }),
      el("select", { id: "inv-status" },
        el("option", { value: "" }, "كل الحالات"),
        ...["unpaid", "partial", "paid", "overdue", "cancelled"].map((s) => el("option", { value: s, selected: s === status || undefined }, labelOf("invoiceStatus", s)))
      ),
      el("button", { className: "btn btn-ghost", type: "button", onclick: () => {
        const p = document.getElementById("inv-period").value;
        const st = document.getElementById("inv-status").value;
        location.hash = `#/subscriptions?tab=invoices&period=${p}&status=${st}`;
      } }, "تصفية")
    ),
    list.length ? dataTable(
      ["الطالب", "الفترة", "المستحق", "المدفوع", "المتبقي", "الحالة", ""],
      list.map((i) => [
        nameOf(i.studentId), i.billingPeriod, formatPiastres(i.finalAmountPiastres),
        formatPiastres(i.amountPaidPiastres), formatPiastres(i.outstandingPiastres),
        statusBadge("invoiceStatus", i.status),
        i.status !== "cancelled" && BigInt(i.amountPaidPiastres) === 0n
          ? el("button", { className: "btn btn-ghost btn-sm", type: "button", onclick: async () => {
            const ok = await confirmDialog({ title: "إلغاء الفاتورة", message: "لن تُحذف، وستظهر بحالة ملغاة ولا تدخل في المستحق.", danger: true, confirmText: "إلغاء الفاتورة" });
            if (!ok) return;
            try {
              await cancelInvoice(i.id, "إلغاء يدوي");
              toast("أُلغيت الفاتورة.", "success");
              location.reload();
            } catch (err) { teacherError(err); }
          } }, "إلغاء")
          : "",
      ])
    ) : emptyState("لا توجد فواتير.")
  );
}

async function plansView(host, plans) {
  const form = el("form", { className: "card stack" },
    el("h3", {}, "خطة جديدة"),
    field("الاسم", el("input", { name: "name", required: true })),
    field("المبلغ الشهري (جنيه)", el("input", { name: "amount", required: true, inputmode: "decimal" })),
    el("button", { className: "btn", type: "submit" }, "حفظ الخطة")
  );
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = formData(form);
    const parsed = parsePoundsToPiastres(data.amount);
    if (!parsed.ok) { toast(parsed.error, "error"); return; }
    await savePlan({ name: data.name, amountPiastres: parsed.piastres, status: "active", billingCycle: "monthly" });
    toast("تم حفظ الخطة. الفواتير القديمة لا تتغير.", "success");
    location.reload();
  });
  host.replaceChildren(
    form,
    el("div", { className: "card", style: "margin-top:12px" },
      dataTable(["الاسم", "المبلغ"], plans.map((p) => [p.name, formatPiastres(p.amountPiastres)]), { empty: "لا توجد خطط." })
    )
  );
}

async function generateView(host, { students, groups, plans, invoices }) {
  const settings = await loadSettings();
  const period = el("input", { type: "month", value: currentPeriod(), name: "period" });
  const box = el("div", { className: "card stack" },
    el("p", {}, "تُنشأ فواتير للطلاب النشطين فقط. لا تُنشأ فواتير مكررة لنفس الطالب ونفس الشهر."),
    field("شهر الفوترة", period, { required: true }),
    el("button", { className: "btn", type: "button", id: "preview" }, "معاينة"),
    el("div", { id: "preview-out" })
  );
  box.querySelector("#preview").addEventListener("click", async () => {
    const p = period.value;
    if (!p) return;
    const due = dueDateForPeriod(p, settings.defaultDueDay || 5);
    const issue = todayLocal();
    const preview = previewMonthlyInvoices({ students, groups, plans, existingInvoices: invoices, period: p, issueDate: issue, dueDate: due });
    const out = box.querySelector("#preview-out");
    out.replaceChildren(
      el("p", {}, `${periodLabel(p)}: سيُنشأ ${preview.created.length} فاتورة، وسيُتخطى ${preview.skipped.length}.`),
      dataTable(["الطالب", "المبلغ"], preview.created.map((c) => [c.name, formatPiastres(c.finalAmountPiastres)]), { empty: "لا يوجد طلاب مستحقون." }),
      preview.skipped.length ? el("p", { className: "muted" }, `متخطى: ${preview.skipped.map((s) => `${s.name} (${s.reason})`).join("، ")}`) : null,
      preview.created.length ? el("button", { className: "btn", type: "button", onclick: async () => {
        const ok = await confirmDialog({ title: "إنشاء الفواتير", message: `سيتم إنشاء ${preview.created.length} فاتورة لشهر ${periodLabel(p)}.`, confirmText: "إنشاء" });
        if (!ok) return;
        try {
          const result = await generateMonthlyInvoices({ period: p, issueDate: issue, dueDate: due });
          toast(`تم إنشاء ${result.created.length} فاتورة.`, "success");
          navigate("#/subscriptions?tab=invoices");
          location.reload();
        } catch (err) { teacherError(err); }
      } }, "تأكيد الإنشاء") : null
    );
  });
  host.replaceChildren(box);
}

async function invoiceForm(host, { students, groups, plans }) {
  const settings = await loadSettings();
  const form = el("form", { className: "card stack" },
    el("h3", {}, "فاتورة يدوية"),
    field("الطالب", el("select", { name: "studentId", required: true },
      el("option", { value: "" }, "اختر"),
      ...students.filter((s) => s.status === "active").map((s) => el("option", { value: s.id }, s.fullName))
    ), { required: true }),
    field("فترة الفوترة", el("input", { type: "month", name: "billingPeriod", required: true, value: currentPeriod() }), { required: true }),
    field("المبلغ الأصلي (جنيه)", el("input", { name: "amount", required: true, inputmode: "decimal" }), { required: true }),
    field("الخصم (جنيه)", el("input", { name: "discount", inputmode: "decimal", value: "0" })),
    field("تاريخ الاستحقاق", el("input", { type: "date", name: "dueDate", required: true, value: dueDateForPeriod(currentPeriod(), settings.defaultDueDay || 5) })),
    field("ملاحظات / سبب الاستثناء إن وُجد فاتورة لنفس الشهر", el("textarea", { name: "notes" })),
    el("label", { className: "field" }, el("span", {}, el("input", { type: "checkbox", name: "allowException" }), " السماح باستثناء تكرار الفاتورة (يتطلب سببًا)")),
    el("div", { className: "row-actions" },
      el("button", { className: "btn", type: "submit" }, "حفظ"),
      el("a", { className: "btn btn-ghost", href: "#/subscriptions" }, "إلغاء")
    )
  );
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = form.querySelector("[type=submit]");
    setBusy(btn, true);
    try {
      const data = formData(form);
      const amount = parsePoundsToPiastres(data.amount);
      const discount = parsePoundsToPiastres(data.discount || "0");
      if (!amount.ok) { toast(amount.error, "error"); return; }
      if (!discount.ok) { toast(discount.error, "error"); return; }
      const st = students.find((s) => s.id === data.studentId);
      await createInvoice({
        studentId: data.studentId,
        groupId: st?.groupId || null,
        planId: st?.planId || null,
        billingPeriod: data.billingPeriod,
        issueDate: todayLocal(),
        dueDate: data.dueDate,
        originalAmountPiastres: amount.piastres,
        discountPiastres: discount.piastres,
        notes: data.notes,
        allowException: Boolean(data.allowException),
        exceptionReason: data.allowException ? data.notes : "",
      });
      toast("تم إنشاء الفاتورة.", "success");
      navigate("#/subscriptions");
    } catch (err) { teacherError(err); }
    finally { setBusy(btn, false); }
  });
  host.replaceChildren(form);
}
