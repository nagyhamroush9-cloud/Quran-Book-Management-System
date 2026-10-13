import { el, paginate } from "../utils/dom.js";
import {
  attendanceRepo, expensesRepo, groupsRepo, invoicesRepo, memorizationRepo,
  loadSettings, paymentsRepo, studentsRepo,
} from "../db/repositories.js";
import {
  computeFinancials,
  lastFullyPaidPeriod,
  monthPaymentState,
  activeInvoiceForPeriod,
  periodStudentStats,
  studentFeePiastres,
  studentOutstandingTotal,
} from "../utils/finance.js";
import { formatMoney } from "../utils/currency.js";
import { addDays, currentPeriod, periodLabel, shiftPeriod, todayLocal } from "../utils/dates.js";
import { icon } from "../ui/icons.js";
import { paymentBadge } from "../ui/components.js";
import {
  avatarFor, openExpenseModal, openPaymentModal, openStudentDrawer, openStudentFormModal, printMonthReceipts,
} from "../ui/modals.js";
import { collectDashboardReminders } from "./reminders.js";

const PAGE_SIZE = 6;

export async function renderDashboard(root, ctx) {
  const q = ctx.query || {};
  const period = q.period || currentPeriod();
  await paintDashboard(root, { ...ctx, period, search: q.q || "", filter: q.filter || "all", page: Number(q.page || 1) });
}

async function paintDashboard(root, state) {
  const { period } = state;
  const today = todayLocal();
  const [students, groups, invoices, payments, expenses, attendance, memo, settings] = await Promise.all([
    studentsRepo.all(), groupsRepo.all(), invoicesRepo.all(), paymentsRepo.all(),
    expensesRepo.all(), attendanceRepo.all(), memorizationRepo.all(), loadSettings(),
  ]);

  const active = students.filter((s) => s.status === "active");
  const finMonth = computeFinancials({ invoices, payments, expenses, period, today });
  const stats = periodStudentStats({ students, invoices, period, today });
  const reminders = collectDashboardReminders({ students: active, invoices, attendance, memo, settings, today });
  const groupName = (id) => groups.find((g) => g.id === id)?.name || "بدون مجموعة";
  const feeOf = (student) => {
    const group = groups.find((g) => g.id === student.groupId);
    return studentFeePiastres(student, group, null);
  };

  let search = state.search;
  let filter = state.filter;
  let page = state.page;

  const searchInput = el("input", {
    value: search,
    placeholder: "ابحث باسم الطالب أو ولي الأمر أو رقم الهاتف ...",
    "aria-label": "بحث",
  });
  const tableHost = el("div");
  const pagerHost = el("div");
  const cardsHost = el("div", { className: "students-cards" });

  const rowsOf = () => {
    let list = active
      .filter((s) => {
        const hay = `${s.fullName} ${s.guardianName || ""} ${s.guardianPhone || ""}`.toLowerCase();
        return !search || hay.includes(search.toLowerCase());
      })
      .map((s, idx) => {
        const inv = activeInvoiceForPeriod(invoices, s.id, period);
        const statePay = monthPaymentState(inv, today);
        const leftover = studentOutstandingTotal(invoices, s.id);
        return { student: s, idx, inv, statePay, leftover, lastPaid: lastFullyPaidPeriod(invoices, s.id) };
      });
    if (filter === "paid") list = list.filter((r) => r.statePay.key === "paid");
    if (filter === "owed") list = list.filter((r) => r.statePay.key === "owed" || r.statePay.key === "unpaid" || r.leftover > 0n);
    if (filter === "partial") list = list.filter((r) => r.statePay.key === "partial");
    list.sort((a, b) => a.student.fullName.localeCompare(b.student.fullName, "ar"));
    return list;
  };

  const reload = () => paintDashboard(root, { ...state, search, filter, page, period });

  const renderTable = () => {
    const list = rowsOf();
    const pageInfo = paginate(list, page, PAGE_SIZE);
    page = pageInfo.page;
    const actionBtns = (row) => el("div", { className: "row-actions" },
      el("button", {
        type: "button", className: "icon-btn filled", "aria-label": "عرض ملف الطالب", title: "عرض ملف الطالب",
        onclick: () => openStudentDrawer({ studentId: row.student.id, onSaved: reload }),
      }, icon("search", { size: 16 })),
      el("button", {
        type: "button", className: "icon-btn", "aria-label": "تعديل", title: "تعديل",
        onclick: () => openStudentFormModal({ studentId: row.student.id, onSaved: reload }),
      }, icon("edit", { size: 16 })),
      el("button", {
        type: "button",
        className: "icon-btn",
        "aria-label": `تسجيل دفعة لـ ${row.student.fullName}`,
        title: "تسجيل دفعة",
        onclick: () => openPaymentModal({ studentId: row.student.id, period, onSaved: reload }),
      }, icon("cash", { size: 16 }))
    );

    const table = el("div", { className: "table-wrap desktop-table" },
      el("table", {},
        el("thead", {}, el("tr", {},
          ...["الاسم", "المجموعة", "الاشتراك الشهري", "الحالة", "آخر دفع", "المتبقي", "اجراءات"].map((h) => el("th", {}, h))
        )),
        el("tbody", {},
          ...pageInfo.items.map((row) => el("tr", {},
            el("td", {}, el("button", {
              type: "button",
              className: "person person-btn",
              onclick: () => openStudentDrawer({ studentId: row.student.id, onSaved: reload }),
            },
              avatarFor(row.student.fullName, row.idx),
              el("div", {},
                el("strong", {}, row.student.fullName),
                el("small", {}, row.student.guardianPhone || "بدون رقم")
              )
            )),
            el("td", {}, groupName(row.student.groupId)),
            el("td", {}, formatMoney(feeOf(row.student))),
            el("td", {}, paymentBadge(row.statePay)),
            el("td", {}, row.lastPaid ? periodLabel(row.lastPaid) : "—"),
            el("td", {}, formatMoney(row.leftover)),
            el("td", {}, actionBtns(row))
          ))
        )
      )
    );
    if (!pageInfo.total) {
      tableHost.replaceChildren(el("div", { className: "empty card" }, "لا يوجد طلاب مطابقون."));
    } else {
      tableHost.replaceChildren(table);
    }

    cardsHost.replaceChildren(...pageInfo.items.map((row) => el("div", { className: "student-card" },
      el("div", { className: "person" },
        avatarFor(row.student.fullName, row.idx),
        el("div", { style: "flex:1" },
          el("strong", {}, row.student.fullName),
          el("small", {}, row.student.guardianPhone || "بدون رقم")
        ),
        paymentBadge(row.statePay)
      ),
      el("p", {}, `${groupName(row.student.groupId)} · اشتراك ${formatMoney(feeOf(row.student))}`),
      el("p", {}, `المتبقي ${formatMoney(row.leftover)} · آخر دفع ${row.lastPaid ? periodLabel(row.lastPaid) : "—"}`),
      actionBtns(row)
    )));

    const pages = [];
    for (let i = 1; i <= pageInfo.pages; i += 1) {
      pages.push(el("button", {
        type: "button",
        className: i === pageInfo.page ? "page-btn active" : "page-btn",
        onclick: () => { page = i; renderTable(); },
      }, String(i)));
    }
    pagerHost.replaceChildren(
      el("div", { className: "pager" },
        el("span", {}, pageInfo.total ? `عرض ${((pageInfo.page - 1) * PAGE_SIZE) + 1} - ${Math.min(pageInfo.page * PAGE_SIZE, pageInfo.total)} من ${pageInfo.total} طالب` : ""),
        el("div", { className: "pager-pages" },
          el("button", { type: "button", className: "page-btn", disabled: pageInfo.page <= 1, onclick: () => { page = pageInfo.page - 1; renderTable(); } }, "‹"),
          ...pages.slice(0, 6),
          el("button", { type: "button", className: "page-btn", disabled: pageInfo.page >= pageInfo.pages, onclick: () => { page = pageInfo.page + 1; renderTable(); } }, "›")
        )
      )
    );
  };

  searchInput.addEventListener("input", () => {
    search = searchInput.value;
    page = 1;
    renderTable();
  });

  const chip = (id, label) => {
    const btn = el("button", { type: "button", className: filter === id ? "chip active" : "chip" }, label);
    btn.addEventListener("click", () => { filter = id; page = 1; paintDashboard(root, { ...state, search, filter, page, period }); });
    return btn;
  };

  const goPeriod = (next) => {
    location.hash = `#/dashboard?period=${next}`;
  };

  root.replaceChildren(
    el("div", { className: "grid grid-4 dash-stats" },
      statCard("stat-due", "calendar", "اشتراك هذا الشهر", formatMoney(finMonth.invoiced), "مستحق"),
      statCard("stat-total", "users", "إجمالي الطلاب", String(stats.activeCount), "طالب"),
      statCard("stat-paid", "check", "خالص", String(stats.paidCount), "طالب"),
      statCard("stat-owed", "alert", "عليه فلوس", String(stats.owedCount), "طالب")
    ),
    el("div", { className: "search-row" },
      el("button", {
        type: "button", className: "btn",
        onclick: () => openStudentFormModal({ onSaved: reload }),
      }, icon("plus", { size: 16 }), "إضافة طالب جديد"),
      el("button", {
        type: "button", className: "btn btn-ghost",
        onclick: () => printMonthReceipts(period),
      }, icon("print", { size: 16 }), "إصدار إيصالات الشهر"),
      el("div", { className: "search-field grow" },
        icon("search", { size: 18 }),
        searchInput
      )
    ),
    el("div", { className: "period-bar" },
      el("button", { type: "button", className: "icon-btn", "aria-label": "الشهر السابق", onclick: () => goPeriod(shiftPeriod(period, -1)) }, icon("chevron")),
      el("input", { type: "month", value: period, onchange: (e) => goPeriod(e.target.value), "aria-label": "الشهر الحالي" }),
      el("button", { type: "button", className: "icon-btn", "aria-label": "الشهر التالي", onclick: () => goPeriod(shiftPeriod(period, 1)) }, icon("chevronLeft")),
      el("a", { className: "btn btn-ghost btn-sm", href: `#/subscriptions?tab=notebook&period=${period}` }, "كراسة الشهور"),
      el("div", { className: "filter-chips" },
        chip("all", "الكل"),
        chip("paid", "خالصون"),
        chip("owed", "مين عليه فلوس؟"),
        chip("partial", "دفعوا جزءًا")
      )
    ),
    el("div", { className: "table-card" },
      tableHost,
      cardsHost,
      pagerHost
    ),
    el("div", { className: "lower-grid" },
      el("div", { className: "card summary-card" },
        el("div", { className: "card-head" },
          el("h3", {}, icon("chart", { size: 18 }), "ملخص هذا الشهر")
        ),
        row("المبالغ المحصلة", formatMoney(finMonth.collected)),
        row("المصروفات المدفوعة", formatMoney(finMonth.expensesPaid)),
        row("مصروفات غير مدفوعة", formatMoney(finMonth.expensesUnpaid)),
        row("الصافي", formatMoney(finMonth.netCash))
      ),
      el("div", { className: "card" },
        el("div", { className: "quick-actions" },
          el("a", { className: "quick-tile", href: "#/attendance" },
            el("span", { className: "icon-wrap tile-att" }, icon("attendance")),
            "سجل حضور اليوم"
          ),
          quick("tile-expense", "expense", "إضافة مصروف", () => openExpenseModal({ onSaved: reload })),
          quick("tile-pay", "cash", "تسجيل دفعة", () => openPaymentModal({ period, onSaved: reload })),
          quick("tile-receipt", "print", "إصدار إيصال", () => printMonthReceipts(period))
        )
      ),
      el("div", { className: "card" },
        el("div", { className: "card-head" },
          el("h3", {}, icon("bell", { size: 18 }), "تذكيرات اليوم"),
          el("a", { href: "#/reminders" }, "عرض الكل")
        ),
        reminders.length
          ? el("div", {}, ...reminders.slice(0, 5).map((r) => el("div", { className: "reminder-item" },
            el("span", { className: `dot ${r.dot}` }),
            el("span", {}, r.title)
          )))
          : el("p", { className: "muted" }, "لا توجد تذكيرات اليوم.")
      )
    ),
    el("div", { className: "feature-row" },
      el("p", { className: "feature-tagline" }, "بكل سهولة .. إدارة كتاب التحفيظ"),
      feature("offline", "يعمل بدون إنترنت", "بعد أول تشغيل"),
      feature("mobile", "واجهة بسيطة", "مناسبة للموبايل"),
      feature("shield", "بيانات آمنة", "ومحفوظة محليًا"),
      feature("cloud", "نسخة احتياطية", "لضمان بياناتك", "#/backup")
    )
  );
  renderTable();
}

function statCard(kind, iconName, label, value, hint) {
  return el("div", { className: `card stat-card ${kind}` },
    el("div", { className: "copy" },
      el("div", { className: "label" }, label),
      el("div", { className: "value" }, value),
      el("div", { className: "hint" }, hint)
    ),
    el("div", { className: "stat-icon" }, icon(iconName, { size: 26 }))
  );
}

function row(label, value) {
  return el("div", { className: "summary-row" }, el("span", {}, label), el("strong", {}, value));
}

function feature(iconName, title, sub, href = "") {
  const item = el(href ? "a" : "div", { className: href ? "feature-item feature-link" : "feature-item", ...(href ? { href } : {}) },
    el("div", { className: "feature-icon" }, icon(iconName, { size: 22 })),
    el("strong", {}, title),
    el("span", {}, sub)
  );
  return item;
}

function quick(tile, iconName, label, onClick) {
  return el("button", { type: "button", className: "quick-tile", onclick: onClick },
    el("span", { className: `icon-wrap ${tile}` }, icon(iconName)),
    label
  );
}
