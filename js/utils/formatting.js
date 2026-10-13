export const LABELS = {
  studentStatus: {
    active: "نشط",
    inactive: "غير نشط",
    suspended: "موقوف",
    archived: "مؤرشف",
  },
  invoiceStatus: {
    unpaid: "عليه فلوس",
    partial: "جزئي",
    paid: "خالص",
    overdue: "عليه فلوس",
    cancelled: "ملغاة",
  },
  paymentMethod: {
    cash: "نقدي",
    bank: "تحويل بنكي",
    wallet: "محفظة إلكترونية",
    other: "أخرى",
  },
  paymentStatus: {
    posted: "مسجّلة",
    voided: "ملغاة / معكوسة",
  },
  expenseCategory: {
    rent: "إيجار",
    utilities: "مرافق",
    supplies: "مستلزمات التدريس",
    books: "كتب وأدوات",
    transport: "انتقالات",
    maintenance: "صيانة",
    other: "أخرى",
  },
  expenseStatus: {
    paid: "مدفوعة",
    unpaid: "غير مدفوعة (لا تُحسب في الصرف النقدي)",
  },
  attendance: {
    present: "حاضر",
    absent: "غائب",
    late: "متأخر",
    excused: "بعذر",
  },
  activity: {
    new: "حفظ جديد",
    revision: "مراجعة",
    recitation: "تسميع",
  },
  rating: {
    1: "ضعيف",
    2: "مقبول",
    3: "جيد",
    4: "جيد جدًا",
    5: "ممتاز",
  },
};

export function labelOf(group, key) {
  return (LABELS[group] && LABELS[group][key]) || key || "—";
}

export function whatsappLink(phone, text) {
  const compact = String(phone || "").replace(/[\s()-]/g, "");
  if (!compact) return null;
  let intl = compact;
  if (intl.startsWith("00")) intl = intl.slice(2);
  if (intl.startsWith("+")) intl = intl.slice(1);
  if (intl.startsWith("0") && intl.length >= 10) intl = `20${intl.slice(1)}`;
  if (!/^\d{8,15}$/.test(intl)) return null;
  const url = new URL(`https://wa.me/${intl}`);
  if (text) url.searchParams.set("text", text);
  return url.toString();
}
