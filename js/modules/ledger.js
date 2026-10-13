import { el } from "../utils/dom.js";
import { groupsRepo, invoicesRepo, studentsRepo } from "../db/repositories.js";
import { formatMoney } from "../utils/currency.js";
import { currentPeriod, periodLabel, periodsForYear, shiftPeriod } from "../utils/dates.js";
import {
  activeInvoiceForPeriod,
  canBillPeriod,
  lastFullyPaidPeriod,
  monthPaymentState,
  studentOutstandingTotal,
} from "../utils/finance.js";
import { paymentBadge } from "../ui/components.js";
import { openPaymentModal, openStudentDrawer } from "../ui/modals.js";
import { confirmDialog } from "../utils/dialogs.js";

export async function renderLedger(root, ctx) {
  const q = ctx.query || {};
  const year = Number(q.year || currentPeriod().slice(0, 4));
  const focus = q.period || currentPeriod();
  const search = (q.q || "").trim().toLowerCase();
  const [students, invoices, groups] = await Promise.all([
    studentsRepo.all(), invoicesRepo.all(), groupsRepo.all(),
  ]);
  const months = periodsForYear(year);
  const visible = window.matchMedia("(max-width: 800px)").matches
    ? months.filter((p) => p === focus)
    : months;
  let list = students.filter((s) => s.status === "active");
  if (search) {
    list = list.filter((s) => `${s.fullName} ${s.guardianPhone || ""}`.toLowerCase().includes(search));
  }
  list.sort((a, b) => a.fullName.localeCompare(b.fullName, "ar"));

  const yearInput = el("input", { type: "number", value: String(year), min: "2000", max: "2100" });
  const searchBox = el("input", { value: q.q || "", placeholder: "بحث عن طالب" });
  const apply = () => {
    location.hash = `#/subscriptions?tab=notebook&year=${yearInput.value}&period=${focus}&q=${encodeURIComponent(searchBox.value)}`;
  };
  yearInput.addEventListener("change", apply);
  searchBox.addEventListener("keydown", (e) => { if (e.key === "Enter") apply(); });

  const reload = () => renderLedger(root, ctx);

  const head = ["اسم الطالب", ...visible.map((p) => periodLabel(p)), "إجمالي المتأخرات"];
  const rows = list.map((student) => {
    const cells = [
      el("button", {
        type: "button",
        className: "month-cell",
        onclick: () => openStudentDrawer({ studentId: student.id, onSaved: reload }),
      }, student.fullName),
    ];
    for (const p of visible) {
      if (!canBillPeriod(student, p)) {
        cells.push("—");
        continue;
      }
      const inv = activeInvoiceForPeriod(invoices, student.id, p);
      const state = monthPaymentState(inv);
      cells.push(el("button", {
        type: "button",
        className: "month-cell",
        onclick: async () => {
          const ok = await confirmDialog({
            title: "تسجيل دفع لهذا الشهر؟",
            message: `${student.fullName} — ${periodLabel(p)} (${state.label})`,
            confirmText: "فتح نافذة الدفع",
          });
          if (!ok) return;
          await openPaymentModal({ studentId: student.id, period: p, onSaved: reload });
        },
      }, paymentBadge(state)));
    }
    cells.push(formatMoney(studentOutstandingTotal(invoices, student.id)));
    return cells;
  });

  root.replaceChildren(
    el("div", { className: "toolbar" },
      el("label", { className: "field" }, el("span", {}, "السنة"), yearInput),
      searchBox,
      el("button", { className: "btn btn-ghost", type: "button", onclick: apply }, "عرض"),
      el("a", { className: "btn btn-ghost", href: `#/dashboard?period=${focus}` }, "العودة للرئيسية")
    ),
    el("p", { className: "muted" }, "كراسة الشهور: اضغط حالة الشهر لتسجيل الدفع. لا يُسجَّل شيء قبل التأكيد."),
    el("div", { className: "table-wrap" },
      rows.length ? (() => {
        const table = el("table", { className: "ledger-table" });
        table.append(
          el("thead", {}, el("tr", {}, ...head.map((h) => el("th", {}, h)))),
          el("tbody", {}, ...rows.map((r) => el("tr", {}, ...r.map((c) => el("td", {}, c)))))
        );
        return table;
      })() : el("div", { className: "empty" }, "لا يوجد طلاب.")
    )
  );
}
