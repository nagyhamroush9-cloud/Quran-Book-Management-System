import { formatPiastres } from "./currency.js";

export function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadText(filename, text, type = "text/plain;charset=utf-8") {
  downloadBlob(filename, new Blob([text], { type }));
}

/** CSV with UTF-8 BOM for Excel Arabic compatibility. */
export function toCsv(rows, headers) {
  const esc = (v) => {
    const s = v === null || v === undefined ? "" : String(v);
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const head = headers.map((h) => esc(h.label)).join(",");
  const body = rows.map((row) => headers.map((h) => esc(typeof h.value === "function" ? h.value(row) : row[h.key])).join(","));
  return `\uFEFF${[head, ...body].join("\r\n")}`;
}

export function downloadCsv(filename, rows, headers) {
  downloadText(filename, toCsv(rows, headers), "text/csv;charset=utf-8");
}

export function moneyCsv(piastres) {
  return formatPiastres(piastres, { withCurrency: false, locale: "en-US" });
}
