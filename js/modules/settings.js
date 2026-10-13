import { el, formData } from "../utils/dom.js";
import { loadSettings, saveSettings } from "../db/repositories.js";
import { toast, confirmDialog, teacherError } from "../utils/dialogs.js";
import { field } from "../ui/components.js";
import { STORE_NAMES, withWrite, clearSync } from "../db/database.js";

export async function renderSettings(root) {
  const s = await loadSettings();
  const form = el("form", { className: "card stack" },
    el("h3", {}, "بيانات المكتب"),
    field("اسم التطبيق / المكتب", el("input", { name: "appName", value: s.appName || "" })),
    field("اسم المعلم", el("input", { name: "teacherName", value: s.teacherName || "" })),
    field("هاتف اختياري", el("input", { name: "teacherPhone", value: s.teacherPhone || "" })),
    field("يوم الاستحقاق الافتراضي", el("input", { name: "defaultDueDay", type: "number", min: "1", max: "28", value: String(s.defaultDueDay || 5) })),
    field("التنبيه قبل الاستحقاق (أيام)", el("input", { name: "reminderDaysBeforeDue", type: "number", min: "0", max: "14", value: String(s.reminderDaysBeforeDue || 3) })),
    field("حد الغياب المتكرر خلال 30 يومًا", el("input", { name: "absenceThreshold", type: "number", min: "1", max: "30", value: String(s.absenceThreshold || 3) })),
    field("التذكير بالنسخ الاحتياطي بعد (أيام)", el("input", { name: "backupReminderDays", type: "number", min: "1", max: "60", value: String(s.backupReminderDays || 7) })),
    field("المظهر", el("select", { name: "theme" },
      el("option", { value: "light", selected: s.theme !== "dark" || undefined }, "فاتح"),
      el("option", { value: "dark", selected: s.theme === "dark" || undefined }, "داكن")
    )),
    el("p", { className: "muted" }, "العملة المعروضة: الجنيه المصري (ج.م). القيم تُحفظ داخليًا بالقروش الصحيحة. تغيير الإعدادات لا يعدّل الفواتير القديمة."),
    el("button", { className: "btn", type: "submit" }, "حفظ الإعدادات")
  );
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const data = formData(form);
      await saveSettings({
        appName: data.appName,
        teacherName: data.teacherName,
        teacherPhone: data.teacherPhone,
        defaultDueDay: Number(data.defaultDueDay) || 5,
        reminderDaysBeforeDue: Number(data.reminderDaysBeforeDue) || 3,
        absenceThreshold: Number(data.absenceThreshold) || 3,
        backupReminderDays: Number(data.backupReminderDays) || 7,
        theme: data.theme,
        currency: "EGP",
      });
      document.documentElement.setAttribute("data-theme", data.theme);
      toast("تم حفظ الإعدادات.", "success");
      location.reload();
    } catch (err) { teacherError(err); }
  });

  const danger = el("div", { className: "card stack", style: "margin-top:12px" },
    el("h3", {}, "إدارة البيانات"),
    el("p", { className: "muted" }, "قفل PIN غير مُفعَّل في هذا الإصدار لأنه لا يعادل حماية حقيقية على جهاز مفتوح."),
    el("p", {}, `إصدار التطبيق: 1.0.0 · مخطط قاعدة البيانات: 1`),
    el("button", { className: "btn btn-danger", type: "button", onclick: async () => {
      const ok = await confirmDialog({
        title: "مسح كل البيانات",
        message: "سيُحذف كل شيء على هذا المتصفح. نزّل نسخة احتياطية أولًا. هذا لا يمكن التراجع عنه إلا من ملف نسخة.",
        danger: true,
        confirmText: "مسح كل شيء",
      });
      if (!ok) return;
      const ok2 = await confirmDialog({
        title: "تأكيد أخير",
        message: "هل أنت متأكد؟",
        danger: true,
        confirmText: "نعم، امسح",
      });
      if (!ok2) return;
      await withWrite(STORE_NAMES, (stores) => {
        for (const name of STORE_NAMES) clearSync(stores[name]);
      });
      toast("مُسحت البيانات المحلية.", "success");
      location.hash = "#/setup";
      location.reload();
    } }, "مسح كل البيانات المحلية")
  );

  root.replaceChildren(form, danger);
}
