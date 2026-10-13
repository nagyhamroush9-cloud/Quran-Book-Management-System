import { el, formData, paginate, setBusy } from "../utils/dom.js";
import { studentsRepo, groupsRepo, plansRepo, saveStudent, archiveStudent, restoreStudent, studentRelated } from "../db/repositories.js";
import { parsePoundsToPiastres, formatPiastres } from "../utils/currency.js";
import { formatDate } from "../utils/dates.js";
import { collectErrors, required, validatePhone, maxLength } from "../utils/validation.js";
import { confirmDialog, toast, teacherError } from "../utils/dialogs.js";
import { dataTable, emptyState, field, pagerBar, statusBadge } from "../ui/components.js";
import { downloadCsv, moneyCsv } from "../utils/export.js";
import { labelOf, whatsappLink } from "../utils/formatting.js";
import { navigate } from "../router.js";

export async function renderStudents(root, ctx) {
  const q = ctx.query || {};
  const [students, groups] = await Promise.all([studentsRepo.all(), groupsRepo.all()]);
  const search = (q.q || "").trim();
  const status = q.status || "active";
  const groupId = q.group || "";
  const page = Number(q.page || 1);
  let list = [...students];
  if (status !== "all") list = list.filter((s) => s.status === status);
  if (groupId) list = list.filter((s) => s.groupId === groupId);
  if (search) {
    const s = search.toLowerCase();
    list = list.filter((st) => `${st.fullName} ${st.guardianName} ${st.guardianPhone}`.toLowerCase().includes(s));
  }
  list.sort((a, b) => a.fullName.localeCompare(b.fullName, "ar"));
  const pageInfo = paginate(list, page, 12);
  const groupName = (id) => groups.find((g) => g.id === id)?.name || "—";

  const searchBox = el("input", { value: search, placeholder: "بحث بالاسم أو الهاتف", className: "grow" });
  const statusSel = filterSelect("status", status, [
    ["active", "نشط"], ["inactive", "غير نشط"], ["suspended", "موقوف"], ["archived", "مؤرشف"], ["all", "الكل"],
  ]);
  const groupSel = el("select", {},
    el("option", { value: "" }, "كل المجموعات"),
    ...groups.map((g) => el("option", { value: g.id, selected: g.id === groupId || undefined }, g.name))
  );
  const go = () => {
    location.hash = `#/students?q=${encodeURIComponent(searchBox.value)}&status=${statusSel.value}&group=${groupSel.value}&page=1`;
  };
  searchBox.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });

  root.replaceChildren(
    el("div", { className: "toolbar" },
      searchBox, statusSel, groupSel,
      el("button", { className: "btn btn-ghost", type: "button", onclick: go }, "تصفية"),
      el("a", { className: "btn", href: "#/students/new" }, "طالب جديد"),
      el("button", { className: "btn btn-ghost", type: "button", onclick: () => {
        downloadCsv("students.csv", list, [
          { label: "الاسم", key: "fullName" },
          { label: "ولي الأمر", key: "guardianName" },
          { label: "الهاتف", key: "guardianPhone" },
          { label: "الحالة", value: (r) => labelOf("studentStatus", r.status) },
          { label: "الالتحاق", key: "enrollmentDate" },
        ]);
      } }, "تصدير CSV")
    ),
    pageInfo.total ? dataTable(
      ["الاسم", "ولي الأمر", "الهاتف", "المجموعة", "الحالة", ""],
      pageInfo.items.map((s) => [
        el("a", { href: `#/students/${s.id}` }, s.fullName),
        s.guardianName || "—",
        s.guardianPhone || "—",
        groupName(s.groupId),
        statusBadge("studentStatus", s.status),
        el("a", { className: "btn btn-ghost btn-sm", href: `#/students/${s.id}/edit` }, "تعديل"),
      ])
    ) : emptyState("لا يوجد طلاب بهذه التصفية.", el("a", { className: "btn", href: "#/students/new" }, "إضافة طالب")),
    pagerBar(pageInfo, (p) => {
      location.hash = `#/students?q=${encodeURIComponent(searchBox.value)}&status=${statusSel.value}&group=${groupSel.value}&page=${p}`;
    })
  );
}

function filterSelect(name, value, pairs) {
  return el("select", { name }, ...pairs.map(([v, l]) => el("option", { value: v, selected: v === value || undefined }, l)));
}

export async function renderStudentForm(root, ctx) {
  const id = ctx.params.id;
  const [student, groups, plans] = await Promise.all([
    id ? studentsRepo.get(id) : null,
    groupsRepo.all(),
    plansRepo.all(),
  ]);
  if (id && !student) {
    root.replaceChildren(el("p", {}, "الطالب غير موجود."));
    return;
  }
  const feeVal = student?.customFeePiastres != null && student.customFeePiastres !== ""
    ? formatPiastres(student.customFeePiastres, { withCurrency: false, locale: "en-US" })
    : "";
  const form = el("form", { className: "card stack" },
    el("h3", {}, id ? "تعديل طالب" : "طالب جديد"),
    field("الاسم الكامل", el("input", { name: "fullName", required: true, value: student?.fullName || "" }), { required: true }),
    field("اسم ولي الأمر (اختياري)", el("input", { name: "guardianName", value: student?.guardianName || "" })),
    field("هاتف ولي الأمر (اختياري)", el("input", { name: "guardianPhone", value: student?.guardianPhone || "" })),
    field("هاتف بديل", el("input", { name: "altContact", value: student?.altContact || "" })),
    field("تاريخ الالتحاق", el("input", { name: "enrollmentDate", type: "date", required: true, value: student?.enrollmentDate || "" }), { required: true }),
    field("المجموعة", el("select", { name: "groupId" },
      el("option", { value: "" }, "بدون مجموعة"),
      ...groups.filter((g) => g.status !== "archived" || g.id === student?.groupId).map((g) => el("option", { value: g.id, selected: g.id === student?.groupId || undefined }, g.name))
    )),
    field("خطة الاشتراك", el("select", { name: "planId" },
      el("option", { value: "" }, "حسب المجموعة"),
      ...plans.filter((p) => p.status !== "archived").map((p) => el("option", { value: p.id, selected: p.id === student?.planId || undefined }, p.name))
    )),
    field("رسوم شهرية مخصصة (جنيه) — اتركه فارغًا لاستخدام سعر المجموعة", el("input", { name: "customFee", inputmode: "decimal", value: feeVal })),
    field("الحالة", el("select", { name: "status" },
      ...["active", "inactive", "suspended"].map((st) => el("option", { value: st, selected: (student?.status || "active") === st || undefined }, labelOf("studentStatus", st)))
    )),
    field("تاريخ الميلاد", el("input", { name: "dob", type: "date", value: student?.dob || "" })),
    field("العنوان", el("input", { name: "address", value: student?.address || "" })),
    field("ملاحظات", el("textarea", { name: "notes" }, student?.notes || "")),
    el("div", { className: "row-actions" },
      el("button", { className: "btn", type: "submit" }, "حفظ"),
      el("a", { className: "btn btn-ghost", href: id ? `#/students/${id}` : "#/students" }, "إلغاء")
    )
  );
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = form.querySelector("[type=submit]");
    setBusy(btn, true);
    try {
      const data = formData(form);
      const errors = collectErrors([
        required(data.fullName, "الاسم"),
        data.guardianPhone ? validatePhone(data.guardianPhone, { required: false }) : null,
        data.altContact ? validatePhone(data.altContact, { required: false }) : null,
        required(data.enrollmentDate, "تاريخ الالتحاق"),
        maxLength(data.notes, 2000, "الملاحظات"),
      ]);
      let customFee = null;
      if (data.customFee) {
        const parsed = parsePoundsToPiastres(data.customFee);
        if (!parsed.ok) errors.push(parsed.error);
        else customFee = parsed.piastres;
      }
      if (errors.length) {
        toast(errors[0], "error");
        return;
      }
      const payload = {
        id: student?.id,
        fullName: data.fullName,
        guardianName: data.guardianName,
        guardianPhone: data.guardianPhone,
        altContact: data.altContact,
        enrollmentDate: data.enrollmentDate,
        groupId: data.groupId || null,
        planId: data.planId || null,
        customFeePiastres: customFee,
        status: data.status,
        dob: data.dob || "",
        address: data.address,
        notes: data.notes,
      };
      const result = await saveStudent(payload);
      if (result.duplicates.length) {
        toast("تنبيه: يوجد طالب بنفس الاسم تقريبًا. لم يتم الدمج تلقائيًا.", "info");
      } else {
        toast("تم حفظ بيانات الطالب.", "success");
      }
      navigate(`#/students/${result.record.id}`);
    } catch (err) {
      teacherError(err);
    } finally {
      setBusy(btn, false);
    }
  });
  root.replaceChildren(form);
}

export async function renderStudentDetail(root, ctx) {
  const student = await studentsRepo.get(ctx.params.id);
  if (!student) {
    root.replaceChildren(el("p", {}, "الطالب غير موجود."));
    return;
  }
  const [groups, related] = await Promise.all([groupsRepo.all(), studentRelated(student.id)]);
  const group = groups.find((g) => g.id === student.groupId);
  const outstanding = related.invoices.filter((i) => i.status !== "cancelled").reduce((a, i) => a + BigInt(i.outstandingPiastres || 0), 0n);
  const wa = whatsappLink(student.guardianPhone, `السلام عليكم، بخصوص الطالب ${student.fullName}`);

  root.replaceChildren(
    el("div", { className: "card student-hero stack" },
      el("h2", {}, student.fullName),
      el("p", {}, `${student.guardianName} — ${student.guardianPhone}`),
      el("p", { className: "muted" }, `${group?.name || "بدون مجموعة"} · التحق ${formatDate(student.enrollmentDate)}`),
      statusBadge("studentStatus", student.status),
      el("p", {}, `المتبقي الحالي: ${formatPiastres(outstanding)}`),
      student.notes ? el("p", {}, student.notes) : null,
      el("div", { className: "row-actions" },
        el("a", { className: "btn", href: `#/students/${student.id}/edit` }, "تعديل"),
        el("a", { className: "btn btn-ghost", href: `#/payments/new?student=${student.id}` }, "تسجيل دفعة"),
        wa ? el("a", { className: "btn btn-ghost", href: wa, target: "_blank", rel: "noopener" }, "رسالة واتساب يدويًا") : null,
        student.status === "archived"
          ? el("button", { className: "btn btn-ghost", type: "button", onclick: async () => {
            await restoreStudent(student.id);
            toast("تمت استعادة الطالب.", "success");
            navigate(`#/students/${student.id}`);
            location.reload();
          } }, "استعادة")
          : el("button", { className: "btn btn-danger btn-sm", type: "button", onclick: async () => {
            const ok = await confirmDialog({
              title: "أرشفة الطالب",
              message: "لن يُحذف الطالب ولن تُمسح فواتيره أو حضوره. لن تُنشأ له فواتير شهرية جديدة افتراضيًا.",
              danger: true,
              confirmText: "أرشفة",
            });
            if (!ok) return;
            await archiveStudent(student.id);
            toast("تم أرشفة الطالب.", "success");
            location.reload();
          } }, "أرشفة")
      )
    ),
    sectionTable("الفواتير", ["الفترة", "المستحق", "المدفوع", "المتبقي", "الحالة"],
      related.invoices.sort((a, b) => b.billingPeriod.localeCompare(a.billingPeriod)).map((i) => [
        i.billingPeriod, formatPiastres(i.finalAmountPiastres), formatPiastres(i.amountPaidPiastres),
        formatPiastres(i.outstandingPiastres), statusBadge("invoiceStatus", i.status),
      ])),
    sectionTable("الدفعات", ["التاريخ", "المبلغ", "الطريقة", "الحالة"],
      related.payments.sort((a, b) => String(b.paidAt).localeCompare(String(a.paidAt))).map((p) => [
        String(p.paidAt).slice(0, 10), formatPiastres(p.amountPiastres), labelOf("paymentMethod", p.method), statusBadge("paymentStatus", p.status),
      ])),
    sectionTable("الحضور", ["التاريخ", "الحالة"],
      related.attendance.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30).map((a) => [formatDate(a.date), statusBadge("attendance", a.status)])),
    sectionTable("الحفظ", ["التاريخ", "النوع", "السورة"],
      related.memo.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 20).map((m) => [formatDate(m.date), labelOf("activity", m.activityType), String(m.surahNumber)]))
  );
}

function sectionTable(title, headers, rows) {
  return el("div", { className: "card", style: "margin-top:12px" }, el("h3", {}, title), dataTable(headers, rows, { empty: "لا توجد سجلات." }));
}
