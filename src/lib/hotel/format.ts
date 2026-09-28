import { jalaaliMonthLength, toGregorian, toJalaali } from "jalaali-js";
import { formatToman, toPersianDigits } from "./domain.ts";

const J_MONTHS = [
  "فروردین",
  "اردیبهشت",
  "خرداد",
  "تیر",
  "مرداد",
  "شهریور",
  "مهر",
  "آبان",
  "آذر",
  "دی",
  "بهمن",
  "اسفند",
];

const G_MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const J_WEEK = ["ش", "ی", "د", "س", "چ", "پ", "ج"];
const G_WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function isIso(iso: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(iso);
}

export function parseIso(iso: string): { y: number; m: number; d: number } | null {
  if (!isIso(iso)) return null;
  const [y, m, d] = iso.split("-").map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return { y, m, d };
}

export function toIso(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function addDays(iso: string, days: number): string {
  const p = parseIso(iso);
  if (!p) return iso;
  const dt = new Date(Date.UTC(p.y, p.m - 1, p.d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return toIso(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

function weekdayMon0(iso: string): number {
  const p = parseIso(iso);
  if (!p) return 0;
  const dow = new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay();
  return (dow + 6) % 7;
}

function weekdaySat0(iso: string): number {
  const p = parseIso(iso);
  if (!p) return 0;
  const dow = new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay();
  return (dow + 1) % 7;
}

export function showDate(iso: string, locale: "fa" | "en"): string {
  const p = parseIso(iso);
  if (!p) return iso;
  if (locale === "fa") {
    const j = toJalaali(p.y, p.m, p.d);
    return toPersianDigits(`${j.jd} ${J_MONTHS[j.jm - 1]} ${j.jy}`);
  }
  return `${G_MONTHS[p.m - 1]} ${p.d}, ${p.y}`;
}

export function showNumber(value: number, locale: "fa" | "en"): string {
  const text = String(value);
  return locale === "fa" ? toPersianDigits(text) : text;
}

export type DayCell = { iso: string; day: string; outside: boolean };

export function monthGrid(locale: "fa" | "en", anchorIso: string): { title: string; weekdays: string[]; cells: DayCell[] } {
  const p = parseIso(anchorIso) ?? { y: 2026, m: 9, d: 28 };
  const cells: DayCell[] = [];
  if (locale === "fa") {
    const j = toJalaali(p.y, p.m, p.d);
    const len = jalaaliMonthLength(j.jy, j.jm);
    const first = toGregorian(j.jy, j.jm, 1);
    const lead = weekdaySat0(toIso(first.gy, first.gm, first.gd));
    const prevM = j.jm === 1 ? 12 : j.jm - 1;
    const prevY = j.jm === 1 ? j.jy - 1 : j.jy;
    const prevLen = jalaaliMonthLength(prevY, prevM);
    for (let i = 0; i < lead; i++) {
      const day = prevLen - lead + 1 + i;
      const g = toGregorian(prevY, prevM, day);
      cells.push({ iso: toIso(g.gy, g.gm, g.gd), day: toPersianDigits(String(day)), outside: true });
    }
    for (let day = 1; day <= len; day++) {
      const g = toGregorian(j.jy, j.jm, day);
      cells.push({ iso: toIso(g.gy, g.gm, g.gd), day: toPersianDigits(String(day)), outside: false });
    }
    const nextM = j.jm === 12 ? 1 : j.jm + 1;
    const nextY = j.jm === 12 ? j.jy + 1 : j.jy;
    let nextDay = 1;
    while (cells.length % 7 !== 0) {
      const g = toGregorian(nextY, nextM, nextDay);
      cells.push({ iso: toIso(g.gy, g.gm, g.gd), day: toPersianDigits(String(nextDay)), outside: true });
      nextDay += 1;
    }
    return { title: toPersianDigits(`${J_MONTHS[j.jm - 1]} ${j.jy}`), weekdays: J_WEEK, cells };
  }
  const len = new Date(Date.UTC(p.y, p.m, 0)).getUTCDate();
  const lead = weekdayMon0(toIso(p.y, p.m, 1));
  for (let i = 0; i < lead; i++) {
    const dt = new Date(Date.UTC(p.y, p.m - 1, 1 - (lead - i)));
    cells.push({
      iso: toIso(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate()),
      day: String(dt.getUTCDate()),
      outside: true,
    });
  }
  for (let day = 1; day <= len; day++) cells.push({ iso: toIso(p.y, p.m, day), day: String(day), outside: false });
  let extra = 1;
  while (cells.length % 7 !== 0) {
    const dt = new Date(Date.UTC(p.y, p.m - 1, len + extra));
    cells.push({
      iso: toIso(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate()),
      day: String(dt.getUTCDate()),
      outside: true,
    });
    extra += 1;
  }
  return { title: `${G_MONTHS[p.m - 1]} ${p.y}`, weekdays: G_WEEK, cells };
}

export function shiftMonth(anchorIso: string, delta: number, locale: "fa" | "en"): string {
  const p = parseIso(anchorIso) ?? { y: 2026, m: 9, d: 1 };
  if (locale === "fa") {
    const j = toJalaali(p.y, p.m, p.d);
    let m = j.jm + delta;
    let y = j.jy;
    while (m < 1) {
      m += 12;
      y -= 1;
    }
    while (m > 12) {
      m -= 12;
      y += 1;
    }
    const g = toGregorian(y, m, 1);
    return toIso(g.gy, g.gm, g.gd);
  }
  const dt = new Date(Date.UTC(p.y, p.m - 1 + delta, 1));
  return toIso(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 1);
}

export function tehranTodayIso(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tehran",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const y = parts.find((part) => part.type === "year")?.value ?? "2026";
  const m = parts.find((part) => part.type === "month")?.value ?? "01";
  const d = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${y}-${m}-${d}`;
}

export function money(amount: number | null, locale: "fa" | "en"): string {
  return formatToman(amount, locale);
}

export { formatToman };
