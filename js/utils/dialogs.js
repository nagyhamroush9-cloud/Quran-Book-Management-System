import { el, qs } from "./dom.js";

let toastTimer = null;

export function toast(message, type = "info") {
  const host = document.getElementById("toast-host") || createToastHost();
  host.replaceChildren(
    el("div", { className: `toast toast-${type}`, role: "status" }, message)
  );
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    host.replaceChildren();
  }, 4200);
}

function createToastHost() {
  const host = el("div", { id: "toast-host", className: "toast-host" });
  document.body.appendChild(host);
  return host;
}

export function confirmDialog({
  title,
  message,
  confirmText = "تأكيد",
  cancelText = "إلغاء",
  danger = false,
}) {
  return new Promise((resolve) => {
    const overlay = el("div", { className: "modal-overlay", role: "dialog", "aria-modal": "true" });
    const dialog = el("div", { className: "modal" },
      el("h2", { className: "modal-title" }, title),
      el("p", { className: "modal-body" }, message),
      el("div", { className: "modal-actions" },
        el("button", { type: "button", className: "btn btn-ghost", "data-cancel": "1" }, cancelText),
        el("button", {
          type: "button",
          className: danger ? "btn btn-danger" : "btn btn-primary",
          "data-ok": "1",
        }, confirmText)
      )
    );
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    const finish = (value) => {
      overlay.remove();
      resolve(value);
    };
    qs(overlay, "[data-cancel]").addEventListener("click", () => finish(false));
    qs(overlay, "[data-ok]").addEventListener("click", () => finish(true));
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) finish(false);
    });
    qs(overlay, "[data-ok]").focus();
  });
}

export function alertDialog({ title, message, okText = "حسنًا" }) {
  return new Promise((resolve) => {
    const overlay = el("div", { className: "modal-overlay", role: "dialog", "aria-modal": "true" });
    const dialog = el("div", { className: "modal" },
      el("h2", { className: "modal-title" }, title),
      el("p", { className: "modal-body" }, message),
      el("div", { className: "modal-actions" },
        el("button", { type: "button", className: "btn btn-primary", "data-ok": "1" }, okText)
      )
    );
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    const finish = () => {
      overlay.remove();
      resolve();
    };
    qs(overlay, "[data-ok]").addEventListener("click", finish);
    qs(overlay, "[data-ok]").focus();
  });
}

export function teacherError(err, fallback = "حدث خطأ أثناء حفظ البيانات.") {
  console.error(err);
  const msg = err && err.userMessage ? err.userMessage : fallback;
  toast(msg, "error");
  return msg;
}
