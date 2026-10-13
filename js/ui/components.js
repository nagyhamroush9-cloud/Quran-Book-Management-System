import { el, paginate } from "../utils/dom.js";
import { labelOf } from "../utils/formatting.js";

export function pageHeader(title, actions = []) {
  return el("div", { className: "toolbar" },
    el("h2", { className: "page-title", style: "margin:0;flex:1" }, title),
    ...actions
  );
}

export function emptyState(text, action = null) {
  const box = el("div", { className: "empty card" }, el("p", {}, text));
  if (action) box.appendChild(action);
  return box;
}

export function errorBox(text) {
  return el("div", { className: "error-state", role: "alert" }, text);
}

export function field(label, input, { required = false, error = "" } = {}) {
  const lab = el("label", { className: required ? "field required" : "field" },
    el("span", {}, label),
    input
  );
  if (error) lab.appendChild(el("div", { className: "field-error" }, error));
  return lab;
}

export function input(attrs) {
  return el("input", attrs);
}

export function select(attrs, options) {
  const node = el("select", attrs);
  for (const opt of options) {
    node.appendChild(el("option", { value: opt.value, selected: opt.selected || undefined }, opt.label));
  }
  return node;
}

export function dataTable(headers, rows, { empty = "لا توجد بيانات." } = {}) {
  if (!rows.length) return el("div", { className: "empty" }, el("p", {}, empty));
  const wrap = el("div", { className: "table-wrap" });
  const table = el("table");
  const thead = el("thead", {}, el("tr", {}, ...headers.map((h) => el("th", {}, h))));
  const tbody = el("tbody");
  for (const row of rows) {
    tbody.appendChild(el("tr", {}, ...row.map((cell) => el("td", {}, cell))));
  }
  table.append(thead, tbody);
  wrap.appendChild(table);
  return wrap;
}

export function pagerBar(pageInfo, onPage) {
  if (pageInfo.pages <= 1) return el("div");
  return el("div", { className: "pager" },
    el("button", { className: "btn btn-ghost btn-sm", type: "button", onclick: () => onPage(pageInfo.page - 1), disabled: pageInfo.page <= 1 }, "السابق"),
    el("span", { className: "muted" }, `${pageInfo.page} / ${pageInfo.pages}`),
    el("button", { className: "btn btn-ghost btn-sm", type: "button", onclick: () => onPage(pageInfo.page + 1), disabled: pageInfo.page >= pageInfo.pages }, "التالي")
  );
}

export function statusBadge(kind, key) {
  const label = labelOf(kind, key);
  let cls = "badge";
  if (["overdue", "absent", "voided", "cancelled", "archived", "suspended", "unpaid"].includes(key)) cls += " badge-owed";
  else if (["partial", "inactive", "late"].includes(key)) cls += " badge-partial";
  else if (["paid", "present", "posted"].includes(key)) cls += " badge-paid";
  else if (["muted", "excused"].includes(key)) cls += " badge-muted";
  else if (["overdue"].includes(key)) cls += " badge-danger";
  return el("span", { className: cls }, label);
}

export function paymentBadge(state) {
  if (!state) return el("span", { className: "badge badge-muted" }, "—");
  return el("span", { className: `badge ${state.badge || "badge-muted"}` }, state.label);
}

export function moneyBars(items) {
  const max = Math.max(1, ...items.map((i) => Number(i.value) || 0));
  return el("div", { className: "card" },
    el("div", { className: "muted" }, "مقارنة سريعة"),
    el("div", { className: "bars", "aria-hidden": "true" },
      ...items.map((i) => el("div", {
        className: "bar",
        title: i.label,
        style: `height:${Math.max(6, (Number(i.value) / max) * 88)}px`,
      }))
    ),
    el("div", { className: "muted" }, items.map((i) => i.label).join(" · "))
  );
}

export function linkBtn(href, text, className = "btn") {
  return el("a", { href, className }, text);
}

export { paginate };
