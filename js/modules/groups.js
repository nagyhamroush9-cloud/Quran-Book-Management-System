import { el, formData, setBusy } from "../utils/dom.js";
import { groupsRepo, studentsRepo, saveGroup, saveStudent } from "../db/repositories.js";
import { formatPiastres, parsePoundsToPiastres } from "../utils/currency.js";
import { confirmDialog, toast, teacherError } from "../utils/dialogs.js";
import { dataTable, emptyState, field, statusBadge } from "../ui/components.js";
import { navigate } from "../router.js";

export async function renderGroups(root, ctx) {
  const id = ctx.params?.id;
  const [groups, students] = await Promise.all([groupsRepo.all(), studentsRepo.all()]);
  if (ctx.path?.includes("/new") || (id && ctx.path?.endsWith("/edit")) || ctx.mode === "form") {
    return renderForm(root, id ? groups.find((g) => g.id === id) : null);
  }
  if (id) return renderDetail(root, groups.find((g) => g.id === id), students);

  root.replaceChildren(
    el("div", { className: "toolbar" },
      el("a", { className: "btn", href: "#/groups/new" }, "مجموعة جديدة")
    ),
    groups.length ? dataTable(
      ["الاسم", "الرسوم الافتراضية", "الطلاب", "الحالة", ""],
      groups.map((g) => [
        el("a", { href: `#/groups/${g.id}` }, g.name),
        formatPiastres(g.defaultFeePiastres || 0),
        String(students.filter((s) => s.groupId === g.id && s.status === "active").length),
        statusBadge("studentStatus", g.status === "archived" ? "archived" : "active"),
        el("a", { className: "btn btn-ghost btn-sm", href: `#/groups/${g.id}/edit` }, "تعديل"),
      ])
    ) : emptyState("لا توجد مجموعات.", el("a", { className: "btn", href: "#/groups/new" }, "إنشاء مجموعة"))
  );
}

async function renderForm(root, group) {
  const fee = group ? formatPiastres(group.defaultFeePiastres || 0, { withCurrency: false, locale: "en-US" }) : "";
  const form = el("form", { className: "card stack" },
    el("h3", {}, group ? "تعديل المجموعة" : "مجموعة جديدة"),
    field("اسم المجموعة", el("input", { name: "name", required: true, value: group?.name || "" }), { required: true }),
    field("الرسوم الشهرية الافتراضية (جنيه)", el("input", { name: "fee", required: true, inputmode: "decimal", value: fee }), { required: true }),
    field("الجدول / المواعيد", el("textarea", { name: "scheduleText" }, group?.scheduleText || "")),
    field("ملاحظات", el("textarea", { name: "notes" }, group?.notes || "")),
    el("p", { className: "muted" }, "تغيير الرسوم لا يعدّل الفواتير القديمة."),
    el("div", { className: "row-actions" },
      el("button", { className: "btn", type: "submit" }, "حفظ"),
      el("a", { className: "btn btn-ghost", href: "#/groups" }, "إلغاء")
    )
  );
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = form.querySelector("[type=submit]");
    setBusy(btn, true);
    try {
      const data = formData(form);
      const parsed = parsePoundsToPiastres(data.fee);
      if (!data.name) { toast("اسم المجموعة مطلوب.", "error"); return; }
      if (!parsed.ok) { toast(parsed.error, "error"); return; }
      const saved = await saveGroup({
        id: group?.id,
        name: data.name,
        defaultFeePiastres: parsed.piastres,
        scheduleText: data.scheduleText,
        notes: data.notes,
        status: group?.status || "active",
      });
      toast("تم حفظ المجموعة.", "success");
      navigate(`#/groups/${saved.id}`);
    } catch (err) { teacherError(err); }
    finally { setBusy(btn, false); }
  });
  root.replaceChildren(form);
}

async function renderDetail(root, group, students) {
  if (!group) { root.replaceChildren(el("p", {}, "المجموعة غير موجودة.")); return; }
  const members = students.filter((s) => s.groupId === group.id);
  const others = students.filter((s) => s.groupId !== group.id && s.status === "active");
  const picker = el("select", {},
    el("option", { value: "" }, "نقل طالب إلى هذه المجموعة"),
    ...others.map((s) => el("option", { value: s.id }, s.fullName))
  );
  root.replaceChildren(
    el("div", { className: "card stack" },
      el("h2", {}, group.name),
      el("p", {}, `الرسوم الافتراضية: ${formatPiastres(group.defaultFeePiastres || 0)}`),
      el("p", { className: "muted" }, group.scheduleText || "بدون جدول محدد"),
      el("div", { className: "row-actions" },
        el("a", { className: "btn", href: `#/groups/${group.id}/edit` }, "تعديل"),
        group.status !== "archived"
          ? el("button", { className: "btn btn-danger btn-sm", type: "button", onclick: async () => {
            const ok = await confirmDialog({ title: "أرشفة المجموعة", message: "لن تُحذف السجلات التاريخية. يمكن نقل الطلاب لمجموعة أخرى.", danger: true, confirmText: "أرشفة" });
            if (!ok) return;
            await saveGroup({ ...group, status: "archived" });
            toast("تمت أرشفة المجموعة.", "success");
            location.reload();
          } }, "أرشفة")
          : el("button", { className: "btn", type: "button", onclick: async () => {
            await saveGroup({ ...group, status: "active" });
            location.reload();
          } }, "استعادة")
      ),
      el("div", { className: "toolbar" },
        picker,
        el("button", { className: "btn btn-ghost", type: "button", onclick: async () => {
          if (!picker.value) return;
          const st = students.find((s) => s.id === picker.value);
          st.groupId = group.id;
          await saveStudent(st);
          toast("تم نقل الطالب. السجلات القديمة تبقى مرتبطة بالطالب.", "success");
          location.reload();
        } }, "نقل")
      )
    ),
    el("div", { className: "card", style: "margin-top:12px" },
      el("h3", {}, "طلاب المجموعة"),
      dataTable(["الاسم", "الحالة"], members.map((s) => [el("a", { href: `#/students/${s.id}` }, s.fullName), statusBadge("studentStatus", s.status)]), { empty: "لا يوجد طلاب في هذه المجموعة." })
    )
  );
}
