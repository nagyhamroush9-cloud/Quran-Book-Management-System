export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, val] of Object.entries(attrs || {})) {
    if (val === null || val === undefined || val === false) continue;
    if (key === "className") node.className = val;
    else if (key === "dataset") Object.assign(node.dataset, val);
    else if (key.startsWith("on") && typeof val === "function") {
      node.addEventListener(key.slice(2).toLowerCase(), val);
    } else if (val === true) {
      node.setAttribute(key, "");
    } else {
      node.setAttribute(key, String(val));
    }
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    if (typeof child === "string" || typeof child === "number") {
      node.appendChild(document.createTextNode(String(child)));
    } else {
      node.appendChild(child);
    }
  }
  return node;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

export function qs(root, sel) {
  return (root || document).querySelector(sel);
}

export function qsa(root, sel) {
  return [...(root || document).querySelectorAll(sel)];
}

export function formData(form) {
  const data = {};
  const fd = new FormData(form);
  for (const [k, v] of fd.entries()) data[k] = typeof v === "string" ? v.trim() : v;
  qsa(form, "input[type=checkbox]").forEach((input) => {
    data[input.name] = input.checked;
  });
  return data;
}

export function setBusy(button, busy, busyText = "جارٍ الحفظ...") {
  if (!button) return;
  if (busy) {
    button.dataset.prevText = button.textContent;
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    button.textContent = busyText;
  } else {
    button.disabled = false;
    button.removeAttribute("aria-busy");
    if (button.dataset.prevText) button.textContent = button.dataset.prevText;
  }
}

export function paginate(items, page, pageSize) {
  const total = items.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(1, page), pages);
  const start = (current - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    page: current,
    pages,
    total,
  };
}
