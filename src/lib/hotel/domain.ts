/** Pure hotel domain rules. No I/O. Tested without a database. */

export const ROOM_STATUSES = [
  "AVAILABLE",
  "RESERVED",
  "OCCUPIED",
  "CHECKOUT_PENDING",
  "CLEANING",
  "MAINTENANCE",
  "OUT_OF_SERVICE",
  "BLOCKED",
] as const;
export type RoomStatus = (typeof ROOM_STATUSES)[number];

export const RESERVATION_STATUSES = [
  "PENDING",
  "CONFIRMED",
  "CHECKED_IN",
  "CHECKED_OUT",
  "CANCELLED",
  "NO_SHOW",
  "EXPIRED",
] as const;
export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];

export const ORDER_STATUSES = [
  "PENDING",
  "ACCEPTED",
  "PREPARING",
  "READY",
  "DELIVERING",
  "DELIVERED",
  "COMPLETED",
  "CANCELLED",
  "REJECTED",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const STAY_STATUSES = ["ACTIVE", "CHECKOUT_PENDING", "CLOSED"] as const;
export type StayStatus = (typeof STAY_STATUSES)[number];

const ROOM_EDGES: Record<RoomStatus, RoomStatus[]> = {
  AVAILABLE: ["RESERVED", "CLEANING", "MAINTENANCE", "OUT_OF_SERVICE", "BLOCKED"],
  RESERVED: ["OCCUPIED", "AVAILABLE", "MAINTENANCE", "BLOCKED", "OUT_OF_SERVICE"],
  OCCUPIED: ["CHECKOUT_PENDING", "MAINTENANCE"],
  CHECKOUT_PENDING: ["OCCUPIED", "CLEANING"],
  CLEANING: ["AVAILABLE", "MAINTENANCE", "OUT_OF_SERVICE"],
  MAINTENANCE: ["AVAILABLE", "OUT_OF_SERVICE", "CLEANING"],
  OUT_OF_SERVICE: ["MAINTENANCE", "AVAILABLE", "CLEANING"],
  BLOCKED: ["AVAILABLE", "OUT_OF_SERVICE"],
};

const ORDER_EDGES: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ["ACCEPTED", "REJECTED", "CANCELLED"],
  ACCEPTED: ["PREPARING", "REJECTED", "CANCELLED"],
  PREPARING: ["READY", "CANCELLED"],
  READY: ["DELIVERING", "DELIVERED", "CANCELLED"],
  DELIVERING: ["DELIVERED", "CANCELLED"],
  DELIVERED: ["COMPLETED"],
  COMPLETED: [],
  CANCELLED: [],
  REJECTED: [],
};

const BLOCKING_ROOM: RoomStatus[] = ["OUT_OF_SERVICE", "BLOCKED", "MAINTENANCE"];

export function isDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function eachNight(checkIn: string, checkOut: string): string[] {
  if (!isDateOnly(checkIn) || !isDateOnly(checkOut) || checkOut <= checkIn) return [];
  const nights: string[] = [];
  let cursor = checkIn;
  while (cursor < checkOut) {
    nights.push(cursor);
    cursor = addDays(cursor, 1);
    if (nights.length > 366) break;
  }
  return nights;
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${dt.getUTCFullYear()}-${mm}-${dd}`;
}

/** Tehran civil date, YYYY-MM-DD. */
export function tehranToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tehran",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function tehranTime(now = new Date()): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Tehran",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(now);
}

export function canTransitionRoom(from: RoomStatus, to: RoomStatus, hasActiveStay: boolean): boolean {
  if (from === to) return true;
  if (hasActiveStay && (to === "AVAILABLE" || to === "CLEANING" || to === "BLOCKED" || to === "OUT_OF_SERVICE")) {
    return false;
  }
  if (!hasActiveStay && to === "OCCUPIED") return false;
  return ROOM_EDGES[from].includes(to);
}

export function canTransitionOrder(from: OrderStatus, to: OrderStatus): boolean {
  if (from === to) return false;
  return ORDER_EDGES[from].includes(to);
}

export function guestCanCancelOrder(status: OrderStatus): boolean {
  return status === "PENDING" || status === "ACCEPTED";
}

export function roomCanBeSold(status: RoomStatus): boolean {
  return !BLOCKING_ROOM.includes(status);
}

export function quoteStay(nights: number, nightlyRate: number | null): { nights: number; amount: number | null } {
  if (nights < 1) return { nights: 0, amount: null };
  if (nightlyRate == null) return { nights, amount: null };
  return { nights, amount: nights * nightlyRate };
}

export type FolioLine = { amount: number; voided: boolean };
export type PaymentLine = { amount: number; status: string };

/** Charges minus recorded payments. Cancelled/voided lines are excluded. */
export function folioBalance(items: FolioLine[], payments: PaymentLine[]): number {
  const charges = items.filter((i) => !i.voided).reduce((s, i) => s + i.amount, 0);
  const paid = payments.filter((p) => p.status === "RECORDED").reduce((s, p) => s + p.amount, 0);
  return charges - paid;
}

export function isBillableOrder(status: OrderStatus, billOn: OrderStatus, cancelled: boolean): boolean {
  if (cancelled || status === "CANCELLED" || status === "REJECTED") return false;
  const rank: OrderStatus[] = ["PENDING", "ACCEPTED", "PREPARING", "READY", "DELIVERING", "DELIVERED", "COMPLETED"];
  return rank.indexOf(status) >= rank.indexOf(billOn) && rank.indexOf(status) !== -1;
}

export function canPlaceOrder(stayStatus: StayStatus): boolean {
  return stayStatus === "ACTIVE";
}

export function assertStayAccess(input: {
  actorId: string;
  stayUserId: string;
  stayRoomId: number;
  requestedRoomId: number;
  stayStatus: StayStatus;
}): { ok: true } | { ok: false; code: string } {
  if (input.actorId !== input.stayUserId) return { ok: false, code: "forbidden_guest" };
  if (input.requestedRoomId !== input.stayRoomId) return { ok: false, code: "wrong_room" };
  if (!canPlaceOrder(input.stayStatus)) return { ok: false, code: "stay_inactive" };
  return { ok: true };
}

export function extensionDecision(input: {
  currentCheckOut: string;
  requestedCheckOut: string;
  conflictingNights: string[];
}): { ok: true; nights: string[] } | { ok: false; code: string } {
  if (!isDateOnly(input.requestedCheckOut) || input.requestedCheckOut <= input.currentCheckOut) {
    return { ok: false, code: "invalid_dates" };
  }
  const nights = eachNight(input.currentCheckOut, input.requestedCheckOut);
  if (nights.length === 0 || nights.length > 366) return { ok: false, code: "invalid_dates" };
  const hit = nights.filter((n) => input.conflictingNights.includes(n));
  if (hit.length) return { ok: false, code: "extension_conflict" };
  return { ok: true, nights };
}

const BROAD_ROLES = new Set(["SUPER_ADMIN", "HOTEL_ADMIN", "RECEPTION", "ACCOUNTING"]);
const DEPT_BY_ROLE: Record<string, string> = {
  HOUSEKEEPING: "HOUSEKEEPING",
  LAUNDRY: "LAUNDRY",
  KITCHEN: "KITCHEN",
  COFFEE_SHOP: "COFFEE_SHOP",
  PARKING: "PARKING",
  MAINTENANCE: "MAINTENANCE",
};

/** null = all departments. "NONE" = no staff queue. */
export function departmentScope(roles: string[]): string | null | "NONE" {
  if (roles.some((r) => BROAD_ROLES.has(r))) return null;
  for (const role of roles) {
    if (DEPT_BY_ROLE[role]) return DEPT_BY_ROLE[role];
  }
  return "NONE";
}

export function hasPermission(granted: string[], permission: string): boolean {
  return granted.includes(permission);
}

export type OrderItemPrice = { unitPrice: number | null; complimentary: boolean; quantity: number };

export function orderIsPriced(items: OrderItemPrice[]): boolean {
  return items.every((i) => i.complimentary || (i.unitPrice != null && i.unitPrice >= 0));
}

export function orderChargeAmount(items: OrderItemPrice[]): number {
  return items.reduce((sum, item) => {
    if (item.complimentary || item.unitPrice == null) return sum;
    return sum + item.unitPrice * item.quantity;
  }, 0);
}

const FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

export function toPersianDigits(value: string): string {
  return value.replace(/\d/g, (d) => FA_DIGITS[Number(d)] ?? d);
}

export function formatToman(amount: number | null, locale: "fa" | "en"): string {
  if (amount == null) return locale === "fa" ? "نرخ اعلام نشده" : "Rate not set";
  const formatted = amount.toLocaleString(locale === "fa" ? "fa-IR" : "en-US");
  return locale === "fa" ? `${formatted} تومان` : `${formatted} toman`;
}
