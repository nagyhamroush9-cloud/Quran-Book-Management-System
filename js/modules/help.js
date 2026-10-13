import { el } from "../utils/dom.js";
import { APP_NAME } from "../utils/branding.js";

export async function renderHelp(root, { online, installEvent }) {
  const installBtn = el("button", { className: "btn", type: "button" }, "تثبيت على الجهاز");
  if (!installEvent.current) {
    installBtn.disabled = true;
    installBtn.textContent = "زر التثبيت يظهر عندما يدعمه المتصفح بعد زيارة عبر http";
  }
  installBtn.addEventListener("click", async () => {
    if (!installEvent.current) return;
    installEvent.current.prompt();
    await installEvent.current.userChoice;
    installEvent.current = null;
  });

  root.replaceChildren(
    el("div", { className: "stack" },
      el("div", { className: "card" },
        el("h3", {}, "حالة الاتصال"),
        el("p", {}, online ? "متصل بالشبكة الآن." : "غير متصل. يمكنك متابعة العمل من البيانات المحفوظة على الجهاز."),
        el("p", { className: "muted" }, "لا يمكن فتح التطبيق دون إنترنت إلا بعد تحميله مرة واحدة عبر عنوان http/https حتى يُخزَّن في المتصفح.")
      ),
      el("div", { className: "card" },
        el("h3", {}, "التثبيت على أندرويد"),
        el("ol", { className: "help-list" },
          el("li", {}, "افتح التطبيق من Chrome عبر عنوان المخدم المحلي أو الشبكة (ليس ملفًا من المجلد مباشرة)."),
          el("li", {}, "انتظر حتى يكتمل التحميل وهو متصل."),
          el("li", {}, "من قائمة Chrome: إضافة إلى الشاشة الرئيسية / تثبيت التطبيق."),
          el("li", {}, "بعدها يمكن فتح الأيقونة بدون إنترنت للعمل على البيانات المحلية.")
        ),
        installBtn
      ),
      el("div", { className: "card" },
        el("h3", {}, "التثبيت على الكمبيوتر"),
        el("ol", { className: "help-list" },
          el("li", {}, "افتح التطبيق في Chrome أو Edge عبر http://localhost:8080"),
          el("li", {}, `اضغط أيقونة التثبيت في شريط العنوان إن ظهرت، أو من القائمة: تثبيت ${APP_NAME}.`)
        )
      ),
      el("div", { className: "card" },
        el("h3", {}, "التشغيل المحلي"),
        el("p", {}, "من مجلد المشروع:"),
        el("p", {}, el("span", { className: "kbd" }, "python -m http.server 8080")),
        el("p", {}, "ثم افتح http://localhost:8080 — لا تعتمد على file:// لأن عامل الخدمة لن يعمل بشكل موثوق.")
      ),
      el("div", { className: "card" },
        el("h3", {}, "النسخ الاحتياطي"),
        el("p", {}, "من قسم النسخ الاحتياطي نزّل ملف JSON واحفظه خارج الجهاز. البيانات لا تُرفع تلقائيًا إلى السحابة.")
      )
    )
  );
}

export async function renderMore(root) {
  const items = [
    ["#/groups", "المجموعات"],
    ["#/subscriptions", "الاشتراكات"],
    ["#/memorization", "الحفظ والتسميع"],
    ["#/expenses", "المصروفات"],
    ["#/reports", "التقارير"],
    ["#/reminders", "التنبيهات"],
    ["#/backup", "النسخ الاحتياطي"],
    ["#/settings", "الإعدادات"],
    ["#/help", "المساعدة وحالة الاتصال"],
  ];
  root.replaceChildren(
    el("div", { className: "stack" },
      ...items.map(([href, label]) => el("a", { className: "btn", href, style: "text-align:center" }, label))
    )
  );
}
