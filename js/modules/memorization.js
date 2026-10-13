import { el, formData, setBusy } from "../utils/dom.js";
import { memorizationRepo, saveMemorization, studentsRepo } from "../db/repositories.js";
import { SURAHS, surahLabel, validateVerseRange } from "../data/quran-meta.js";
import { formatDate, todayLocal } from "../utils/dates.js";
import { toast, teacherError } from "../utils/dialogs.js";
import { dataTable, emptyState, field, statusBadge } from "../ui/components.js";
import { labelOf } from "../utils/formatting.js";
import { navigate } from "../router.js";

export async function renderMemorization(root, ctx) {
  const [students, records] = await Promise.all([studentsRepo.all(), memorizationRepo.all()]);
  if (ctx.path === "/memorization/new" || ctx.query?.edit) {
    return renderForm(root, students, ctx.query?.edit ? await memorizationRepo.get(ctx.query.edit) : null);
  }
  const studentId = ctx.query?.student || "";
  let list = [...records].sort((a, b) => b.date.localeCompare(a.date) || String(b.createdAt).localeCompare(String(a.createdAt)));
  if (studentId) list = list.filter((r) => r.studentId === studentId);
  const nameOf = (id) => students.find((s) => s.id === id)?.fullName || "—";
  const sel = el("select", {},
    el("option", { value: "" }, "كل الطلاب"),
    ...students.filter((s) => s.status !== "archived").map((s) => el("option", { value: s.id, selected: s.id === studentId || undefined }, s.fullName))
  );
  sel.addEventListener("change", () => { location.hash = `#/memorization?student=${sel.value}`; });

  const summary = studentId ? studentSummary(list, records.filter((r) => r.studentId === studentId)) : null;

  root.replaceChildren(
    el("div", { className: "toolbar" },
      sel,
      el("a", { className: "btn", href: "#/memorization/new" }, "تسجيل تسميع")
    ),
    ...(summary ? [summary] : []),
    list.length ? dataTable(
      ["التاريخ", "الطالب", "النوع", "الموضع", "التقدير", ""],
      list.map((r) => [
        formatDate(r.date),
        nameOf(r.studentId),
        labelOf("activity", r.activityType),
        `${surahLabel(r.surahNumber)} ${r.startAyah}–${r.endAyah}`,
        labelOf("rating", r.rating) || "—",
        el("a", { href: `#/memorization?edit=${r.id}` }, "تصحيح"),
      ])
    ) : emptyState("لا توجد سجلات تسميع.", el("a", { className: "btn", href: "#/memorization/new" }, "إضافة"))
  );
}

function studentSummary(visible, all) {
  const latest = [...all].sort((a, b) => b.date.localeCompare(a.date))[0];
  const today = todayLocal();
  const month = today.slice(0, 7);
  const weekStart = addDaysSafe(today, -7);
  const upcoming = all.filter((r) => r.nextRevisionDate && r.nextRevisionDate >= today).sort((a, b) => a.nextRevisionDate.localeCompare(b.nextRevisionDate));
  return el("div", { className: "card", style: "margin-bottom:12px" },
    el("h3", {}, "ملخص التقدم"),
    el("p", {}, latest ? `آخر تسجيل: ${formatDate(latest.date)} — ${surahLabel(latest.surahNumber)} ${latest.startAyah}–${latest.endAyah}` : "لا يوجد تسجيل بعد."),
    el("p", {}, `نشاط الأسبوع: ${all.filter((r) => r.date >= weekStart).length} · هذا الشهر: ${all.filter((r) => r.date.startsWith(month)).length}`),
    el("p", { className: "muted" }, "التسجيل لا يعني إتقانًا دائمًا للموضع."),
    upcoming[0] ? el("p", {}, `أقرب مراجعة مجدولة: ${formatDate(upcoming[0].nextRevisionDate)}`) : null
  );
}

function addDaysSafe(ymd, n) {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(y, m - 1, d + n);
  const pad = (x) => String(x).padStart(2, "0");
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

async function renderForm(root, students, existing) {
  const form = el("form", { className: "card stack" },
    el("h3", {}, existing ? "تصحيح سجل تسميع" : "تسجيل تسميع"),
    field("الطالب", el("select", { name: "studentId", required: true },
      ...students.filter((s) => s.status !== "archived").map((s) => el("option", { value: s.id, selected: s.id === existing?.studentId || undefined }, s.fullName))
    ), { required: true }),
    field("التاريخ", el("input", { type: "date", name: "date", required: true, value: existing?.date || todayLocal() })),
    field("السورة", el("select", { name: "surahNumber" },
      ...SURAHS.map((s) => el("option", { value: String(s.number), selected: Number(existing?.surahNumber) === s.number || undefined }, `${s.number}. ${s.name} (${s.verses})`))
    )),
    field("من آية", el("input", { name: "startAyah", type: "number", min: "1", required: true, value: existing?.startAyah || 1 })),
    field("إلى آية", el("input", { name: "endAyah", type: "number", min: "1", required: true, value: existing?.endAyah || 1 })),
    field("النوع", el("select", { name: "activityType" },
      ...["new", "revision", "recitation"].map((t) => el("option", { value: t, selected: existing?.activityType === t || undefined }, labelOf("activity", t)))
    )),
    field("التقدير", el("select", { name: "rating" },
      el("option", { value: "" }, "بدون"),
      ...[1, 2, 3, 4, 5].map((n) => el("option", { value: String(n), selected: Number(existing?.rating) === n || undefined }, labelOf("rating", n)))
    )),
    field("عدد الأخطاء (اختياري)", el("input", { name: "mistakeCount", type: "number", min: "0", value: existing?.mistakeCount ?? "" })),
    field("موعد المراجعة القادم", el("input", { type: "date", name: "nextRevisionDate", value: existing?.nextRevisionDate || "" })),
    field("ملاحظات المعلم", el("textarea", { name: "notes" }, existing?.notes || "")),
    el("div", { className: "row-actions" },
      el("button", { className: "btn", type: "submit" }, "حفظ"),
      el("a", { className: "btn btn-ghost", href: "#/memorization" }, "إلغاء")
    )
  );
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = form.querySelector("[type=submit]");
    setBusy(btn, true);
    try {
      const data = formData(form);
      const err = validateVerseRange(Number(data.surahNumber), Number(data.startAyah), Number(data.endAyah));
      if (err) { toast(err, "error"); return; }
      await saveMemorization({
        id: existing?.id,
        studentId: data.studentId,
        date: data.date,
        surahNumber: Number(data.surahNumber),
        startAyah: Number(data.startAyah),
        endAyah: Number(data.endAyah),
        activityType: data.activityType,
        rating: data.rating ? Number(data.rating) : null,
        mistakeCount: data.mistakeCount === "" ? null : Number(data.mistakeCount),
        nextRevisionDate: data.nextRevisionDate || "",
        notes: data.notes,
      });
      toast("تم حفظ سجل التسميع.", "success");
      navigate("#/memorization");
    } catch (err) { teacherError(err); }
    finally { setBusy(btn, false); }
  });
  root.replaceChildren(form);
}
