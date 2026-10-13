import { el } from "../utils/dom.js";
import { exportBackup, loadAllStores, restoreBackup } from "../db/repositories.js";
import { getMeta } from "../db/database.js";
import { buildBackupObject, validateBackup, verifyChecksum } from "../utils/backup.js";
import { confirmDialog, toast, teacherError, alertDialog } from "../utils/dialogs.js";
import { downloadText } from "../utils/export.js";
import { formatDateTime } from "../utils/dates.js";

export async function renderBackup(root) {
  const last = await getMeta("lastBackupAt");
  const lastRestore = await getMeta("lastRestoreAt");
  const fileInput = el("input", { type: "file", accept: "application/json,.json" });
  const previewBox = el("div", { className: "card", id: "backup-preview" }, el("p", { className: "muted" }, "اختر ملف نسخة لمعاينته قبل الاستعادة."));
  const lastBackupStatus = el("p", {}, last?.value ? `آخر نسخة ناجحة: ${formatDateTime(last.value)}` : "لا يوجد تاريخ نسخة محفوظ بعد.");

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files[0];
    if (!file) return;
    try {
      if (file.size > 40 * 1024 * 1024) {
        toast("الملف أكبر من الحد المسموح.", "error");
        return;
      }
      const text = await file.text();
      const json = JSON.parse(text);
      const validated = validateBackup(json, { currentByteLength: file.size });
      if (!validated.ok) {
        previewBox.replaceChildren(el("p", { className: "error-state" }, validated.errors.join(" ")));
        return;
      }
      const sum = await verifyChecksum(validated.data);
      const counts = Object.entries(validated.preview.counts).map(([k, v]) => `${k}: ${v}`).join("، ");
      previewBox.replaceChildren(
        el("h3", {}, "معاينة النسخة"),
        el("p", {}, `تاريخ التصدير: ${validated.preview.exportedAt || "—"}`),
        el("p", {}, `إصدار المخطط: ${validated.preview.schemaVersion}`),
        el("p", {}, sum.ok ? "مجموع التحقق سليم (أو غير موجود)." : sum.error),
        el("p", { className: "muted" }, counts),
        el("button", { className: "btn btn-danger", type: "button", onclick: () => restoreFlow(validated.data, file.size) }, "استعادة هذه النسخة")
      );
    } catch {
      previewBox.replaceChildren(el("p", { className: "error-state" }, "تعذر قراءة الملف. تأكد أنه JSON صالح."));
    }
  });

  root.replaceChildren(
    el("div", { className: "card stack" },
      el("h3", {}, "نسخة احتياطية كاملة"),
      lastBackupStatus,
      el("p", {}, lastRestore?.value ? `آخر استعادة: ${formatDateTime(lastRestore.value)}` : ""),
      el("p", { className: "muted" }, "البيانات على هذا الجهاز فقط. انسخ ملف النسخة إلى فلاشة أو سحابة شخصية. فقدان الجهاز أو مسح بيانات المتصفح قد يحذف كل شيء."),
      el("button", {
        className: "btn",
        type: "button",
        onclick: async () => {
          const exportedAt = await doExport();
          if (exportedAt) lastBackupStatus.textContent = `آخر نسخة ناجحة: ${formatDateTime(exportedAt)}`;
        },
      }, "تنزيل نسخة JSON"),
      el("label", { className: "field" }, el("span", {}, "استعادة من ملف"), fileInput)
    ),
    previewBox
  );
}

async function doExport() {
  try {
    const backup = await exportBackup();
    downloadText(`quran-book-backup-${backup.exportedAt.slice(0, 10)}.json`, JSON.stringify(backup, null, 2), "application/json;charset=utf-8");
    toast("تم تنزيل النسخة. انقلها إلى مكان آمن خارج الجهاز.", "success");
    return backup.exportedAt;
  } catch (err) {
    teacherError(err, "تعذر إنشاء النسخة.");
    return null;
  }
}

async function restoreFlow(data, size) {
  const ok = await confirmDialog({
    title: "استعادة نسخة",
    message: "الاستعادة تستبدل البيانات الحالية كلها. سنحاول تنزيل نسخة من الوضع الحالي أولًا. هل تريد المتابعة؟",
    danger: true,
    confirmText: "نعم، استعادة",
  });
  if (!ok) return;
  try {
    const current = await loadAllStores();
    const recovery = await buildBackupObject(current);
    downloadText(`quran-book-recovery-before-restore.json`, JSON.stringify(recovery), "application/json;charset=utf-8");
  } catch (err) {
    const cont = await confirmDialog({
      title: "تعذر حفظ نسخة الوضع الحالي",
      message: "لم نتمكن من تنزيل نسخة حماية. الاستمرار قد يجعل التراجع أصعب. هل تريد الاستمرار؟",
      danger: true,
      confirmText: "استمرار",
    });
    if (!cont) return;
  }
  try {
    const preview = await restoreBackup(data, size);
    await alertDialog({ title: "تمت الاستعادة", message: `أُعيدت البيانات. الطلاب: ${preview.counts.students}، الفواتير: ${preview.counts.invoices}.` });
    location.hash = "#/dashboard";
    location.reload();
  } catch (err) {
    teacherError(err, "فشلت الاستعادة ولم تُعتمد بيانات تالفة. إن ظهرت مشكلة افتح نسخة الحماية التي نُزّلت.");
  }
}
