import { el, formData, setBusy } from "../utils/dom.js";
import { expensesRepo, saveExpense } from "../db/repositories.js";
import { formatPiastres, parsePoundsToPiastres } from "../utils/currency.js";
import { currentPeriod, formatDate, todayLocal } from "../utils/dates.js";
import { computeFinancials } from "../utils/finance.js";
import { toast, teacherError } from "../utils/dialogs.js";
import { dataTable, emptyState, field, statusBadge } from "../ui/components.js";
import { downloadCsv, moneyCsv } from "../utils/export.js";
import { labelOf } from "../utils/formatting.js";
import { EXPENSE_CATEGORIES } from "../utils/finance.js";
import { navigate } from "../router.js";

export async function renderExpenses(root, ctx) {
  const expenses = await expensesRepo.all();
  if (ctx.path === "/expenses/new" || ctx.query?.edit) {
    const existing = ctx.query?.edit ? expenses.find((e) => e.id === ctx.query.edit) : null;
    return renderForm(root, existing);
  }
  const period = ctx.query?.period || currentPeriod();
  const category = ctx.query?.category || "";
  let list = expenses.filter((e) => e.date.startsWith(period));
  if (category) list = list.filter((e) => e.category === category);
  list.sort((a, b) => b.date.localeCompare(a.date));
  const fin = computeFinancials({ invoices: [], payments: [], expenses, period });
  const periodInput = el("input", { type: "month", value: period });
  const catSel = el("select", {},
    el("option", { value: "" }, "كل التصنيفات"),
    ...EXPENSE_CATEGORIES.map((c) => el("option", { value: c, selected: c === category || undefined }, labelOf("expenseCategory", c)))
  );
  const go = () => { location.hash = `#/expenses?period=${periodInput.value}&category=${catSel.value}`; };
  periodInput.addEventListener("change", go);
  catSel.addEventListener("change", go);

  root.replaceChildren(
    el("div", { className: "toolbar" },
      periodInput, catSel,
      el("a", { className: "btn", href: "#/expenses/new" }, "مصروف جديد"),
      el("button", { className: "btn btn-ghost", type: "button", onclick: () => {
        downloadCsv("expenses.csv", list, [
          { label: "التاريخ", key: "date" },
          { label: "التصنيف", value: (r) => labelOf("expenseCategory", r.category) },
          { label: "الوصف", key: "description" },
          { label: "المبلغ", value: (r) => moneyCsv(r.amountPiastres) },
          { label: "الحالة", value: (r) => labelOf("expenseStatus", r.status) },
        ]);
      } }, "تصدير")
    ),
    el("div", { className: "card" },
      el("p", {}, `المصروفات المدفوعة هذا الشهر: ${formatPiastres(fin.expensesPaid)}`),
      el("p", { className: "muted" }, `غير المدفوعة (لا تُخصم من النقد): ${formatPiastres(fin.expensesUnpaid)}`)
    ),
    list.length ? dataTable(
      ["التاريخ", "التصنيف", "الوصف", "المبلغ", "الحالة", ""],
      list.map((e) => [
        formatDate(e.date),
        labelOf("expenseCategory", e.category),
        e.description || "—",
        formatPiastres(e.amountPiastres),
        statusBadge("expenseStatus", e.status === "paid" ? "paid" : "unpaid"),
        el("a", { href: `#/expenses?edit=${e.id}` }, "تعديل"),
      ])
    ) : emptyState("لا مصروفات في هذه التصفية.", el("a", { className: "btn", href: "#/expenses/new" }, "إضافة"))
  );
}

function renderForm(root, existing) {
  let submitting = false;
  const form = el("form", { className: "card stack" },
    el("h3", {}, existing ? "تعديل مصروف" : "مصروف جديد"),
    field("التاريخ", el("input", { type: "date", name: "date", required: true, value: existing?.date || todayLocal() })),
    field("المبلغ (جنيه)", el("input", { name: "amount", required: true, inputmode: "decimal", value: existing ? formatPiastres(existing.amountPiastres, { withCurrency: false, locale: "en-US" }) : "" })),
    field("التصنيف", el("select", { name: "category" },
      ...EXPENSE_CATEGORIES.map((c) => el("option", { value: c, selected: existing?.category === c || undefined }, labelOf("expenseCategory", c)))
    )),
    field("الوصف", el("input", { name: "description", required: true, value: existing?.description || "" })),
    field("المستلم (اختياري)", el("input", { name: "recipient", value: existing?.recipient || "" })),
    field("طريقة الدفع", el("select", { name: "method" },
      ...["cash", "bank", "wallet", "other"].map((m) => el("option", { value: m, selected: existing?.method === m || undefined }, labelOf("paymentMethod", m)))
    )),
    field("الحالة", el("select", { name: "status" },
      el("option", { value: "paid", selected: (existing?.status || "paid") === "paid" || undefined }, "مدفوعة (تُحسب في الصرف)"),
      el("option", { value: "unpaid", selected: existing?.status === "unpaid" || undefined }, "غير مدفوعة")
    )),
    field("ملاحظات", el("textarea", { name: "notes" }, existing?.notes || "")),
    el("div", { className: "row-actions" },
      el("button", { className: "btn", type: "submit" }, "حفظ"),
      el("a", { className: "btn btn-ghost", href: "#/expenses" }, "إلغاء")
    )
  );
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (submitting) return;
    const btn = form.querySelector("[type=submit]");
    const data = formData(form);
    const parsed = parsePoundsToPiastres(data.amount);
    if (!parsed.ok) { toast(parsed.error, "error"); return; }
    submitting = true;
    setBusy(btn, true);
    try {
      await saveExpense({
        id: existing?.id,
        date: data.date,
        amountPiastres: parsed.piastres,
        category: data.category,
        description: data.description,
        recipient: data.recipient,
        method: data.method,
        status: data.status,
        notes: data.notes,
      });
      toast("تم حفظ المصروف.", "success");
      navigate("#/expenses");
    } catch (err) { teacherError(err); }
    finally { submitting = false; setBusy(btn, false); }
  });
  root.replaceChildren(form);
}
