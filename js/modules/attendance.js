import { el } from "../utils/dom.js";
import { attendanceRepo, groupsRepo, saveAttendance, studentsRepo } from "../db/repositories.js";
import { attendancePercent } from "../utils/finance.js";
import { formatDate, todayLocal } from "../utils/dates.js";
import { toast, teacherError } from "../utils/dialogs.js";
import { dataTable, emptyState, statusBadge } from "../ui/components.js";
import { labelOf } from "../utils/formatting.js";

const STATUSES = ["present", "absent", "late", "excused"];

export async function renderAttendance(root, ctx) {
  const q = ctx.query || {};
  const date = q.date || todayLocal();
  const groupId = q.group || "";
  const [students, groups, records] = await Promise.all([studentsRepo.all(), groupsRepo.all(), attendanceRepo.all()]);
  const group = groups.find((g) => g.id === groupId) || groups.find((g) => g.status !== "archived");
  const gid = groupId || group?.id || "";
  const roster = students.filter((s) => s.status === "active" && (!gid || s.groupId === gid));
  const sessionId = q.session || "default";

  const dateInput = el("input", { type: "date", value: date });
  const groupSel = el("select", {},
    ...groups.filter((g) => g.status !== "archived").map((g) => el("option", { value: g.id, selected: g.id === gid || undefined }, g.name))
  );
  const go = () => { location.hash = `#/attendance?date=${dateInput.value}&group=${groupSel.value}&session=${sessionId}`; };
  dateInput.addEventListener("change", go);
  groupSel.addEventListener("change", go);

  const mark = async (student, status) => {
    try {
      await saveAttendance({
        studentId: student.id,
        groupId: student.groupId || gid,
        date: dateInput.value,
        sessionId,
        status,
        notes: "",
      });
      toast(`تم تسجيل ${labelOf("attendance", status)} لـ ${student.fullName}`, "success");
      renderAttendance(root, { ...ctx, query: { date: dateInput.value, group: groupSel.value, session: sessionId } });
    } catch (err) { teacherError(err, "تعذر حفظ الحضور. ربما السجل مكرر."); }
  };

  const rows = roster.map((s) => {
    const rec = records.find((r) => r.studentId === s.id && r.date === date && r.sessionId === sessionId);
    const btns = el("div", { className: "row-actions" },
      ...STATUSES.map((st) => el("button", {
        type: "button",
        className: rec?.status === st ? "btn btn-sm" : "btn btn-ghost btn-sm",
        onclick: () => mark(s, st),
      }, labelOf("attendance", st)))
    );
    return [s.fullName, rec ? statusBadge("attendance", rec.status) : "لم يُسجل", btns];
  });

  const studentHistory = ctx.query?.student
    ? records.filter((r) => r.studentId === ctx.query.student)
    : [];
  const pctByStudent = roster.map((s) => {
    const hist = records.filter((r) => r.studentId === s.id);
    return { name: s.fullName, pct: attendancePercent(hist), abs: hist.filter((h) => h.status === "absent").length };
  });

  root.replaceChildren(
    el("div", { className: "toolbar" }, dateInput, groupSel),
    el("p", { className: "muted" }, "اضغط مرة واحدة لتسجيل الحالة. التعديل يتم بالضغط على حالة أخرى لنفس اليوم والحصة."),
    roster.length ? dataTable(["الطالب", "اليوم", "تسجيل سريع"], rows) : emptyState("لا يوجد طلاب نشطون في هذه المجموعة."),
    el("div", { className: "card", style: "margin-top:12px" },
      el("h3", {}, "نسب الحضور (كل السجلات)"),
      dataTable(["الطالب", "النسبة", "غياب"], pctByStudent.map((p) => [p.name, p.pct == null ? "—" : `${p.pct}%`, String(p.abs)]), { empty: "لا بيانات." })
    )
  );
}
