import { el, qs } from "../utils/dom.js";
import { gregorianHeadline, hijriHeadline } from "../utils/dates.js";
import { icon } from "./icons.js";
import { APP_NAME } from "../utils/branding.js";

export const NAV_ITEMS = [
  { href: "#/dashboard", label: "الرئيسية", id: "dashboard", icon: "home" },
  { href: "#/students", label: "الطلاب", id: "students", icon: "users" },
  { href: "#/groups", label: "المجموعات", id: "groups", icon: "group" },
  { href: "#/subscriptions", label: "الاشتراكات والفواتير", id: "subscriptions", icon: "card" },
  { href: "#/payments", label: "المدفوعات", id: "payments", icon: "wallet" },
  { href: "#/attendance", label: "الحضور", id: "attendance", icon: "calendar" },
  { href: "#/memorization", label: "متابعة الحفظ", id: "memorization", icon: "book" },
  { href: "#/expenses", label: "المصروفات", id: "expenses", icon: "receipt" },
  { href: "#/reports", label: "التقارير", id: "reports", icon: "chart" },
  { href: "#/reminders", label: "التنبيهات", id: "reminders", icon: "bell" },
  { href: "#/backup", label: "النسخ الاحتياطي", id: "backup", icon: "cloud" },
  { href: "#/settings", label: "الإعدادات", id: "settings", icon: "settings" },
  { href: "#/help", label: "المساعدة", id: "help", icon: "help" },
];

export function renderShell(root, { appName, teacherName, online }) {
  const now = new Date();
  const displayName = appName || APP_NAME;
  const brandHeading = el("h1", {
    id: "app-name",
    className: "brand-name",
    "aria-label": displayName,
    "data-text": displayName,
  }, displayName);
  root.replaceChildren(
    el("a", { className: "skip-link", href: "#main" }, "تخطي إلى المحتوى"),
    el("div", { className: "offline-banner" }, "لا يوجد اتصال بالإنترنت الآن. يمكنك متابعة العمل ببياناتك المحفوظة على هذا الجهاز."),
    el("div", { className: "app-shell" },
      el("aside", { className: "sidebar", id: "sidebar" },
        el("div", { className: "brand" },
          el("img", { className: "brand-mark", src: "assets/icons/quran-icon.svg", alt: "" }),
          el("div", {},
            brandHeading,
            el("p", { id: "teacher-name" }, "إدارة الطلاب والاشتراكات")
          )
        ),
        el("nav", { className: "nav", "aria-label": "الأقسام" },
          ...NAV_ITEMS.map(navLink)
        ),
        el("div", { className: "sidebar-foot" },
          el("div", { className: "local-status" },
            el("span", { className: "local-dot", "aria-hidden": "true" }),
            el("div", {},
              el("strong", {}, "متصل محليًا"),
              el("p", {}, "جميع البيانات محفوظة على جهازك")
            ),
            icon("phone", { size: 18 })
          )
        )
      ),
      el("div", { className: "sidebar-backdrop", id: "sidebar-backdrop" }),
      el("div", { className: "main-wrap" },
        el("header", { className: "topbar" },
          el("button", { type: "button", className: "icon-btn menu-toggle", id: "menu-toggle", "aria-label": "القائمة", "aria-controls": "sidebar", "aria-expanded": "false" }, icon("menu")),
          el("div", { className: "topbar-greeting" },
            icon("mosque", { size: 26 }),
            el("span", { className: "quran-open-animation", "aria-hidden": "true" },
              el("span", { className: "quran-page quran-page-left" }),
              el("span", { className: "quran-page quran-page-right" }),
              el("span", { className: "quran-book-spine" })
            ),
            el("div", {},
              el("strong", {}, teacherName ? `السلام عليكم، ${teacherName}` : "السلام عليكم"),
              el("p", {}, "ما شاء الله، استمر في الخير")
            )
          ),
          el("div", { className: "topbar-actions" },
            el("div", { className: "date-block" },
              icon("calendar", { size: 18 }),
              el("div", {},
                el("strong", {}, gregorianHeadline(now)),
                el("p", {}, hijriHeadline(now))
              )
            ),
            el("span", {
              className: online ? "status-chip" : "status-chip offline",
              id: "net-status",
            },
              el("span", { className: "status-dot" }),
              online ? "متصل بالإنترنت" : "بدون إنترنت الآن"
            ),
            el("a", { className: "icon-btn settings-btn", href: "#/settings", "aria-label": "الإعدادات" }, icon("settings"))
          )
        ),
        el("main", { className: "content", id: "main", tabindex: "-1" })
      )
    ),
    el("nav", { className: "bottom-nav", "aria-label": "تنقل سريع" },
      navLink({ href: "#/dashboard", label: "الرئيسية", id: "dashboard", icon: "home" }),
      navLink({ href: "#/students", label: "الطلاب", id: "students", icon: "users" }),
      navLink({ href: "#/payments", label: "تحصيل", id: "payments", icon: "wallet" }),
      navLink({ href: "#/attendance", label: "حضور", id: "attendance", icon: "calendar" }),
      navLink({ href: "#/more", label: "المزيد", id: "more", icon: "menu" })
    ),
    el("div", { id: "toast-host", className: "toast-host" }),
    el("div", { id: "modal-root" })
  );

  const toggle = () => {
    const isOpen = qs(root, "#sidebar").classList.toggle("open");
    qs(root, "#sidebar-backdrop").classList.toggle("show", isOpen);
    qs(root, "#menu-toggle").setAttribute("aria-expanded", String(isOpen));
  };
  qs(root, "#menu-toggle").addEventListener("click", toggle);
  qs(root, "#sidebar-backdrop").addEventListener("click", toggle);
  qs(root, "#sidebar").querySelectorAll(".nav-link").forEach((link) => {
    link.addEventListener("click", () => {
      if (qs(root, "#sidebar").classList.contains("open")) toggle();
    });
  });
}

function navLink(item) {
  return el("a", { href: item.href, "data-nav": item.id, className: "nav-link" },
    icon(item.icon, { size: 18 }),
    el("span", {}, item.label)
  );
}

export function setActiveNav(id) {
  document.querySelectorAll("[data-nav]").forEach((a) => {
    const nav = a.getAttribute("data-nav");
    a.classList.toggle("active", nav === id || (id === "more" && nav === "more"));
  });
}

export function setOnline(online) {
  document.body.classList.toggle("is-offline", !online);
  const chip = document.getElementById("net-status");
  if (!chip) return;
  chip.className = online ? "status-chip" : "status-chip offline";
  chip.lastChild.textContent = online ? "متصل بالإنترنت" : "بدون إنترنت الآن";
}

export const PAGE_TITLES = Object.fromEntries(NAV_ITEMS.map((i) => [i.id, i.label]));
