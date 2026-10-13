import { el } from "../utils/dom.js";

const PATHS = {
  home: '<path d="M4 10.5 12 3l8 7.5V20a1 1 0 0 1-1 1h-5.2v-6.2H10.2V21H5a1 1 0 0 1-1-1z"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"/><circle cx="9.5" cy="7.5" r="3.5"/><path d="M20 21v-2a3.5 3.5 0 0 0-2.6-3.4"/><path d="M16 4.2a3.2 3.2 0 0 1 0 6.2"/>',
  group: '<path d="M17 21v-2a4 4 0 0 0-3-3.87"/><path d="M8 21v-2a4 4 0 0 1 3-3.87"/><circle cx="12" cy="7" r="3.2"/><path d="M5 21v-2a3.5 3.5 0 0 1 2-3.2"/><path d="M19 21v-2a3.5 3.5 0 0 0-2-3.2"/><circle cx="5.5" cy="8" r="2.2"/><circle cx="18.5" cy="8" r="2.2"/>',
  card: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18"/><path d="M7 15h4"/>',
  wallet: '<path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18a1 1 0 0 1 1 1v2"/><rect x="3" y="8" width="18" height="11" rx="2"/><circle cx="16.2" cy="13.5" r="1.2"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M8 3.5v3M16 3.5v3M3.5 10h17"/>',
  book: '<path d="M5 4.5A2.5 2.5 0 0 1 7.5 2H20v18H7.5A2.5 2.5 0 0 0 5 22.5z"/><path d="M5 4.5v18"/>',
  receipt: '<path d="M7 3.5h10l1.5 2v15l-2-1.2-2 1.2-2-1.2-2 1.2-2-1.2-1.5 1.2V5.5z"/><path d="M9 9h6M9 13h6M9 17h3.5"/>',
  chart: '<path d="M4 19h16"/><path d="M7 16v-5"/><path d="M12 16V8"/><path d="M17 16v-8"/>',
  bell: '<path d="M6.2 9.2a5.8 5.8 0 0 1 11.6 0c0 4.3 1.7 5.6 1.7 5.6H4.5s1.7-1.3 1.7-5.6"/><path d="M10 19a2 2 0 0 0 4 0"/>',
  cloud: '<path d="M7.4 17H17a4 4 0 0 0 .4-8 6 6 0 0 0-11.3 1.6A3.6 3.6 0 0 0 7.4 17z"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 3.5v2.2M12 18.3v2.2M4.9 6.5l1.6 1.6M17.5 16.9l1.6 1.6M3.5 12h2.2M18.3 12h2.2M4.9 17.5l1.6-1.6M17.5 7.1l1.6-1.6"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9.2a2.5 2.5 0 1 1 3.4 3.3c-.7.5-1 1-1 1.8"/><path d="M12 17.2h.01"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-3.4-3.4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  edit: '<path d="M4 20h4l11-11-4-4L4 16z"/><path d="M13 7l4 4"/>',
  eye: '<path d="M2.5 12S6.2 6.5 12 6.5 21.5 12 21.5 12 17.8 17.5 12 17.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.6"/>',
  wifiOff: '<path d="M2 8.5c3.2-2.8 6.9-4.2 10-4.2M5.2 12.2A11 11 0 0 1 12 10.3"/><path d="M8.4 15.4A6 6 0 0 1 12 14.4"/><path d="M12 19h.01"/><path d="M3 3l18 18"/><path d="M16.4 8.2A14 14 0 0 1 22 12"/><path d="M19 12.6a10 10 0 0 1 1.4 1.2"/>',
  mosque: '<path d="M4 20h16"/><path d="M6 20v-7l6-4 6 7v4"/><path d="M12 9V5"/><path d="M12 5c.6-1.4 1.8-2 3-2"/><path d="M9 20v-3h6v3"/>',
  phone: '<rect x="8" y="3" width="8" height="18" rx="2"/><path d="M11 18h2"/>',
  shield: '<path d="M12 3 5 6.4v5.4c0 4.4 3 7.4 7 8.7 4-1.3 7-4.3 7-8.7V6.4z"/>',
  mobile: '<rect x="7" y="3" width="10" height="18" rx="2"/><path d="M11 18h2"/>',
  check: '<path d="M5 12.5 9.5 17 19 7.5"/>',
  alert: '<circle cx="12" cy="12" r="9"/><path d="M12 8v5"/><path d="M12 16.5h.01"/>',
  cash: '<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.4"/>',
  print: '<path d="M7 8V4h10v4"/><path d="M7 16H5a2 2 0 0 1-2-2v-4h18v4a2 2 0 0 1-2 2h-2"/><rect x="7" y="14" width="10" height="6"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  chevron: '<path d="M14 6l-6 6 6 6"/>',
  chevronLeft: '<path d="M10 6l6 6-6 6"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  ledger: '<path d="M5 4h12a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2z"/><path d="M5 4v14a2 2 0 0 0 2 2"/><path d="M9 8h7M9 12h7M9 16h4"/>',
  expense: '<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M8 10h8M8 14h5"/>',
  attendance: '<path d="M8 7V4"/><path d="M16 7V4"/><rect x="4" y="6" width="16" height="14" rx="2"/><path d="M8 13l2.4 2.4L16 10"/>',
  offline: '<path d="M5 12.5a9 9 0 0 1 14 0"/><path d="M8.2 15.2a5 5 0 0 1 7.6 0"/><path d="M12 19h.01"/>',
};

export function icon(name, { size = 20 } = {}) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.75");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("icon");
  svg.innerHTML = PATHS[name] || PATHS.help;
  return svg;
}

export function iconButton({ name, label, className = "icon-btn", onClick, filled = false }) {
  return el("button", {
    type: "button",
    className: filled ? `${className} filled` : className,
    "aria-label": label,
    title: label,
    onclick: onClick,
  }, icon(name, { size: 16 }));
}
