import { parseHash, matchRoute, register, navigate } from "./router.js";
import { openDatabase } from "./db/database.js";
import { loadSettings } from "./db/repositories.js";
import { renderShell, setActiveNav, setOnline, PAGE_TITLES } from "./ui/layout.js";
import { el } from "./utils/dom.js";
import { teacherError } from "./utils/dialogs.js";
import { renderSetup } from "./modules/setup.js";
import { renderDashboard } from "./modules/dashboard.js";
import { renderStudents, renderStudentDetail, renderStudentForm } from "./modules/students.js";
import { renderGroups } from "./modules/groups.js";
import { renderSubscriptions } from "./modules/subscriptions.js";
import { renderPayments } from "./modules/payments.js";
import { renderAttendance } from "./modules/attendance.js";
import { renderMemorization } from "./modules/memorization.js";
import { renderExpenses } from "./modules/expenses.js";
import { renderReports } from "./modules/reports.js";
import { renderReminders } from "./modules/reminders.js";
import { renderBackup } from "./modules/backup.js";
import { renderSettings } from "./modules/settings.js";
import { renderHelp, renderMore } from "./modules/help.js";
import { APP_NAME } from "./utils/branding.js";

const appRoot = document.getElementById("app");
const installEvent = { current: null };
let settings = null;
let booted = false;

register("/setup", (root, ctx) => renderSetup(root, ctx));
register("/students/new", (root, ctx) => renderStudentForm(root, ctx));
register("/students/:id/edit", (root, ctx) => renderStudentForm(root, ctx));
register("/students/:id", (root, ctx) => renderStudentDetail(root, ctx));
register("/students", (root, ctx) => renderStudents(root, ctx));
register("/groups/new", (root, ctx) => renderGroups(root, ctx));
register("/groups/:id/edit", (root, ctx) => renderGroups(root, ctx));
register("/groups/:id", (root, ctx) => renderGroups(root, ctx));
register("/groups", (root, ctx) => renderGroups(root, ctx));
register("/subscriptions/new-invoice", (root, ctx) => renderSubscriptions(root, ctx));
register("/subscriptions", (root, ctx) => renderSubscriptions(root, ctx));
register("/payments/new", (root, ctx) => renderPayments(root, ctx));
register("/payments/:id/receipt", (root, ctx) => renderPayments(root, ctx));
register("/payments/:id", (root, ctx) => renderPayments(root, ctx));
register("/payments", (root, ctx) => renderPayments(root, ctx));
register("/attendance", (root, ctx) => renderAttendance(root, ctx));
register("/memorization/new", (root, ctx) => renderMemorization(root, ctx));
register("/memorization", (root, ctx) => renderMemorization(root, ctx));
register("/expenses/new", (root, ctx) => renderExpenses(root, ctx));
register("/expenses", (root, ctx) => renderExpenses(root, ctx));
register("/reports", (root, ctx) => renderReports(root, ctx));
register("/reminders", (root, ctx) => renderReminders(root, ctx));
register("/backup", (root, ctx) => renderBackup(root, ctx));
register("/settings", (root, ctx) => renderSettings(root, ctx));
register("/help", (root, ctx) => renderHelp(root, ctx));
register("/more", (root, ctx) => renderMore(root, ctx));
register("/dashboard", (root, ctx) => renderDashboard(root, ctx));
register("/", () => navigate("/dashboard"));

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  installEvent.current = event;
});

window.addEventListener("online", () => setOnline(true));
window.addEventListener("offline", () => setOnline(false));
window.addEventListener("hashchange", renderCurrentRoute);

boot();

async function boot() {
  try {
    await openDatabase();
    settings = await loadSettings();
    document.documentElement.setAttribute("data-theme", settings.theme || "light");
    renderShell(appRoot, {
      appName: settings.appName,
      teacherName: settings.teacherName,
      online: navigator.onLine,
    });
    booted = true;
    await registerServiceWorker();
    await renderCurrentRoute();
  } catch (err) {
    appRoot.replaceChildren(
      el("div", { className: "error-state", role: "alert", style: "margin:16px" },
        err?.userMessage || "تعذر تشغيل التطبيق. تأكد أن المتصفح يسمح بالتخزين المحلي."
      )
    );
    console.error(err);
  }
}

async function renderCurrentRoute() {
  if (!booted) return;
  const routeState = parseHash();
  if (!settings?.setupComplete && routeState.path !== "/setup") {
    navigate("/setup");
    return;
  }

  const main = document.getElementById("main");
  const title = document.getElementById("page-title");
  const route = matchRoute(routeState.path) || matchRoute("/dashboard");
  const id = navId(routeState.path);
  main.classList.toggle("dashboard-page", id === "dashboard");
  main.parentElement.classList.toggle("dashboard-layout", id === "dashboard");
  setActiveNav(id);
  if (title) title.textContent = titleFor(routeState.path, id);
  document.title = `${titleFor(routeState.path, id)} - ${settings?.appName || APP_NAME}`;
  main.replaceChildren(el("div", { className: "state" }, "جارٍ التحميل..."));

  try {
    settings = await loadSettings();
    document.documentElement.setAttribute("data-theme", settings.theme || "light");
    const ctx = {
      ...routeState,
      params: route?.params || {},
      settings,
      online: navigator.onLine,
      installEvent,
    };
    await route.loader(main, ctx);
    main.focus({ preventScroll: true });
  } catch (err) {
    teacherError(err, "تعذر تحميل هذه الصفحة.");
    main.replaceChildren(
      el("div", { className: "error-state", role: "alert" },
        err?.userMessage || "حدث خطأ غير متوقع أثناء تحميل الصفحة."
      )
    );
  }
}

function navId(path) {
  const first = path.split("/").filter(Boolean)[0] || "dashboard";
  if (first === "setup") return "";
  return first;
}

function titleFor(path, id) {
  if (path === "/setup") return "الإعداد الأولي";
  if (path === "/more") return "المزيد";
  return PAGE_TITLES[id] || "لوحة المتابعة";
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  if (!["http:", "https:"].includes(location.protocol)) return;
  try {
    await navigator.serviceWorker.register("./service-worker.js");
  } catch (err) {
    console.warn("تعذر تسجيل عامل الخدمة.", err);
  }
}
