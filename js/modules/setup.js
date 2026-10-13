import { el, formData, setBusy } from "../utils/dom.js";
import { saveSettings } from "../db/repositories.js";
import { parsePoundsToPiastres } from "../utils/currency.js";
import { toast, teacherError } from "../utils/dialogs.js";
import { navigate } from "../router.js";
import { APP_NAME } from "../utils/branding.js";

export async function renderSetup(root, { settings }) {
  const form = el("form", { className: "card stack", style: "max-width:560px;margin:24px auto" },
    el("h2", {}, `مرحبًا بك في ${APP_NAME}`),
    el("p", { className: "muted" }, "هذا التطبيق يعمل على جهازك بدون إنترنت بعد أول تحميل. لا تُرسل بيانات الطلاب إلى أي خادم."),
    el("label", { className: "field required" }, el("span", {}, "اسم المنصة / الحلقة"), el("input", { name: "appName", required: true, value: settings.appName || APP_NAME })),
    el("label", { className: "field required" }, el("span", {}, "اسم المعلم"), el("input", { name: "teacherName", required: true, value: settings.teacherName || "" })),
    el("label", { className: "field" }, el("span", {}, "هاتف اختياري"), el("input", { name: "teacherPhone", value: settings.teacherPhone || "" })),
    el("label", { className: "field" }, el("span", {}, "يوم الاستحقاق الافتراضي في الشهر"), el("input", { name: "defaultDueDay", type: "number", min: "1", max: "28", value: String(settings.defaultDueDay || 5) })),
    el("label", { className: "field" }, el("span", {}, "قيمة الاشتراك الافتراضية بالجنيه (يمكن تغييرها لكل مجموعة)"), el("input", { name: "defaultFee", inputmode: "decimal", value: "200" })),
    el("p", { className: "muted" }, "بعد الحفظ ستُنشأ مجموعة افتراضية وخطة اشتراك يمكنك تعديلها لاحقًا."),
    el("button", { className: "btn", type: "submit" }, "ابدأ الاستخدام")
  );
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = form.querySelector("button");
    setBusy(btn, true);
    try {
      const data = formData(form);
      const fee = parsePoundsToPiastres(data.defaultFee || "0");
      await saveSettings({
        appName: data.appName,
        teacherName: data.teacherName,
        teacherPhone: data.teacherPhone,
        defaultDueDay: Number(data.defaultDueDay) || 5,
        setupComplete: true,
        defaultFeePiastres: fee.ok ? String(fee.piastres) : "0",
      });
      const { saveGroup, savePlan } = await import("../db/repositories.js");
      await savePlan({ name: "اشتراك شهري", amountPiastres: fee.ok ? fee.piastres : 20000n, status: "active", billingCycle: "monthly" });
      await saveGroup({ name: "المجموعة الأساسية", defaultFeePiastres: fee.ok ? fee.piastres : 20000n, status: "active", scheduleText: "", notes: "" });
      toast("تم حفظ الإعداد الأولي.", "success");
      navigate("#/dashboard");
      location.reload();
    } catch (err) {
      teacherError(err);
    } finally {
      setBusy(btn, false);
    }
  });
  root.replaceChildren(form);
}
