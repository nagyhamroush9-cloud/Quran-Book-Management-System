import { el, formData } from "../utils/dom.js";
import {
  addManualReminder, attendanceRepo, dismissReminder, invoicesRepo, loadSettings,
  memorizationRepo, remindersRepo, studentsRepo,
} from "../db/repositories.js";
import { addDays, formatDate, todayLocal } from "../utils/dates.js";
import { formatPiastres } from "../utils/currency.js";
import { toast } from "../utils/dialogs.js";
import { emptyState, field } from "../ui/components.js";
import { formatMoney } from "../utils/currency.js";
import { APP_NAME } from "../utils/branding.js";

export function collectDashboardReminders({ students, invoices, attendance, memo, settings = {}, today }) {
  const items = [];
  const activeIds = new Set(students.map((student) => student.id));
  const outstanding = invoices.filter((invoice) =>
    invoice.status !== "cancelled" &&
    !invoice.cancelledAt &&
    BigInt(invoice.outstandingPiastres || 0) > 0n
  );
  const overdueCount = new Set(outstanding
    .filter((invoice) => invoice.dueDate < today)
    .map((invoice) => invoice.studentId)
    .filter((id) => activeIds.has(id))).size;
  if (overdueCount) {
    items.push({
      title: `${overdueCount} طلاب لديهم متأخرات`,
      dot: "dot-red",
    });
  }
  const soon = addDays(today, Number(settings.reminderDaysBeforeDue || 3));
  const dueSoonCount = new Set(outstanding
    .filter((invoice) => invoice.dueDate >= today && invoice.dueDate <= soon)
    .map((invoice) => invoice.studentId)
    .filter((id) => activeIds.has(id))).size;
  if (dueSoonCount) {
    items.push({
      title: `${dueSoonCount} اشتراكات تستحق قريبًا`,
      dot: "dot-orange",
    });
  }
  const cutoff = addDays(today, -30);
  const threshold = Number(settings.absenceThreshold || 3);
  const frequentAbsenceCount = students.filter((student) =>
    attendance.filter((record) =>
      record.studentId === student.id &&
      record.status === "absent" &&
      record.date >= cutoff &&
      record.date <= today
    ).length >= threshold
  ).length;
  if (frequentAbsenceCount) {
    items.push({
      title: `${frequentAbsenceCount} طلاب كثيرو الغياب`,
      dot: "dot-red",
    });
  }
  const revisions = (memo || []).filter((record) =>
    activeIds.has(record.studentId) && record.nextRevisionDate && record.nextRevisionDate <= today
  );
  if (revisions.length) {
    items.push({
      title: `مراجعات الحفظ المستحقة (${revisions.length} طلاب)`,
      dot: "dot-blue",
    });
  }
  return items;
}

export async function renderReminders(root) {
  const [settings, students, invoices, attendance, memo, dismissed] = await Promise.all([
    loadSettings(), studentsRepo.all(), invoicesRepo.all(), attendanceRepo.all(),
    memorizationRepo.all(), remindersRepo.all(),
  ]);
  const today = todayLocal();
  const dismissKeys = new Set(dismissed.filter((d) => d.dismissedAt).map((d) => d.dismissKey));
  const items = [];
  const soon = addDays(today, Number(settings.reminderDaysBeforeDue || 3));
  for (const inv of invoices) {
    if (inv.status === "cancelled" || inv.status === "paid") continue;
    const student = students.find((s) => s.id === inv.studentId);
    if (!student) continue;
    if (inv.dueDate < today) {
      const key = `overdue:${inv.id}`;
      if (!dismissKeys.has(key)) items.push({ key, title: `اشتراك متأخر: ${student.fullName} (${formatPiastres(inv.outstandingPiastres)})`, type: "overdue" });
    } else if (inv.dueDate <= soon) {
      const key = `due:${inv.id}`;
      if (!dismissKeys.has(key)) items.push({ key, title: `استحقاق قريب ${formatDate(inv.dueDate)}: ${student.fullName}`, type: "due" });
    }
  }
  const threshold = Number(settings.absenceThreshold || 3);
  const cutoff = addDays(today, -30);
  for (const s of students.filter((x) => x.status === "active")) {
    const abs = attendance.filter((a) => a.studentId === s.id && a.status === "absent" && a.date >= cutoff).length;
    if (abs >= threshold) {
      const key = `abs:${s.id}:${today.slice(0, 7)}`;
      if (!dismissKeys.has(key)) items.push({ key, title: `غياب متكرر: ${s.fullName} (${abs} في 30 يومًا)`, type: "absence" });
    }
  }
  for (const r of memo) {
    if (r.nextRevisionDate && r.nextRevisionDate <= today) {
      const key = `rev:${r.id}:${r.nextRevisionDate}`;
      if (!dismissKeys.has(key)) {
        const st = students.find((s) => s.id === r.studentId);
        items.push({ key, title: `مراجعة قرآن مستحقة: ${st?.fullName || ""} (${formatDate(r.nextRevisionDate)})`, type: "revision" });
      }
    }
  }
  const manuals = dismissed.filter((d) => d.type === "manual" && !d.dismissedAt);
  for (const m of manuals) items.push({ key: m.dismissKey, title: m.title + (m.dueDate ? ` — ${formatDate(m.dueDate)}` : ""), type: "manual", id: m.id });

  const lastBackup = settings.lastBackupAt || (await import("../db/database.js").then((m) => m.getMeta("lastBackupAt")));
  const backupAt = lastBackup?.value || lastBackup || "";
  if (backupAt) {
    const days = Math.floor((Date.now() - new Date(backupAt).getTime()) / 86400000);
    if (days >= Number(settings.backupReminderDays || 7)) {
      const key = `backup:${today}`;
      if (!dismissKeys.has(key)) items.push({ key, title: `مرّ ${days} يومًا على آخر نسخة احتياطية ناجحة.`, type: "backup" });
    }
  } else {
    const key = `backup-none:${today.slice(0, 7)}`;
    if (!dismissKeys.has(key)) items.push({ key, title: "لم يتم إنشاء نسخة احتياطية بعد. احفظ نسخة خارج هذا الجهاز.", type: "backup" });
  }

  const list = items.length
    ? el("div", { className: "stack" }, ...items.map((it) => el("div", { className: "card", style: "display:flex;justify-content:space-between;gap:8px;align-items:center" },
      el("div", {}, el("strong", {}, it.title), el("div", { className: "muted" }, it.type)),
      el("button", { className: "btn btn-ghost btn-sm", type: "button", onclick: async () => {
        await dismissReminder(it.key, { type: it.type, title: it.title });
        if (it.id) {
          const rec = await remindersRepo.get(it.id);
          if (rec) { rec.dismissedAt = new Date().toISOString(); await remindersRepo.put(rec); }
        }
        toast("تم إخفاء التنبيه. السجلات الأصلية لم تُحذف.", "success");
        location.reload();
      } }, "إخفاء")
    )))
    : emptyState("لا توجد تنبيهات حالية.");

  const form = el("form", { className: "card stack" },
    el("h3", {}, "تذكير يدوي"),
    field("العنوان", el("input", { name: "title", required: true })),
    field("التاريخ", el("input", { type: "date", name: "dueDate", value: today })),
    el("button", { className: "btn", type: "submit" }, "إضافة")
  );
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = formData(form);
    await addManualReminder({ title: data.title, dueDate: data.dueDate });
    toast("أُضيف التذكير.", "success");
    location.reload();
  });

  const notifyBtn = el("button", { className: "btn btn-ghost", type: "button", onclick: async () => {
    if (!("Notification" in window)) { toast("المتصفح لا يدعم تنبيهات النظام.", "error"); return; }
    const perm = await Notification.requestPermission();
    if (perm === "granted") {
      new Notification(APP_NAME, { body: items[0]?.title || "التنبيهات الداخلية جاهزة. لن تعمل إذا أُغلق التطبيق تمامًا." });
    }
  } }, "طلب تنبيه من المتصفح (اختياري)");

  root.replaceChildren(
    el("p", { className: "muted" }, "التنبيهات تُحسب من البيانات المحفوظة. إخفاؤها لا يحذف الطالب أو الفاتورة. تنبيهات النظام لا تعمل إذا أُغلق المتصفح."),
    notifyBtn,
    list,
    form
  );
}
