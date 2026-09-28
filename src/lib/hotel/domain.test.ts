import assert from "node:assert/strict";
import test from "node:test";
import {
  assertStayAccess,
  canPlaceOrder,
  canTransitionOrder,
  canTransitionRoom,
  departmentScope,
  eachNight,
  extensionDecision,
  folioBalance,
  formatToman,
  guestCanCancelOrder,
  isBillableOrder,
  orderChargeAmount,
  orderIsPriced,
  quoteStay,
  roomCanBeSold,
  tehranToday,
} from "./domain.ts";

test("eachNight is checkout-exclusive and rejects inverted dates", () => {
  assert.deepEqual(eachNight("2026-09-28", "2026-10-01"), ["2026-09-28", "2026-09-29", "2026-09-30"]);
  assert.deepEqual(eachNight("2026-10-01", "2026-09-28"), []);
  assert.deepEqual(eachNight("2026-02-31", "2026-03-02"), []);
});

test("room transitions respect an in-house guest", () => {
  assert.equal(canTransitionRoom("OCCUPIED", "CHECKOUT_PENDING", true), true);
  assert.equal(canTransitionRoom("CHECKOUT_PENDING", "CLEANING", false), true);
  assert.equal(canTransitionRoom("OCCUPIED", "AVAILABLE", true), false);
  assert.equal(canTransitionRoom("CLEANING", "AVAILABLE", false), true);
  assert.equal(canTransitionRoom("AVAILABLE", "OCCUPIED", false), false);
  assert.equal(roomCanBeSold("MAINTENANCE"), false);
  assert.equal(roomCanBeSold("CLEANING"), true);
});

test("order routing states and guest cancel window", () => {
  assert.equal(canTransitionOrder("PENDING", "ACCEPTED"), true);
  assert.equal(canTransitionOrder("PENDING", "DELIVERED"), false);
  assert.equal(canTransitionOrder("READY", "DELIVERED"), true);
  assert.equal(canTransitionOrder("DELIVERED", "CANCELLED"), false);
  assert.equal(guestCanCancelOrder("PENDING"), true);
  assert.equal(guestCanCancelOrder("PREPARING"), false);
});

test("folio ignores voided charges and cancelled payments", () => {
  const balance = folioBalance(
    [
      { amount: 1000, voided: false },
      { amount: 400, voided: true },
      { amount: 200, voided: false },
    ],
    [
      { amount: 500, status: "RECORDED" },
      { amount: 999, status: "PENDING_GATEWAY" },
    ],
  );
  assert.equal(balance, 700);
  assert.equal(quoteStay(3, 5600000).amount, 16800000);
  assert.equal(quoteStay(3, null).amount, null);
});

test("cancelled orders are not billable", () => {
  assert.equal(isBillableOrder("CANCELLED", "DELIVERED", true), false);
  assert.equal(isBillableOrder("PREPARING", "DELIVERED", false), false);
  assert.equal(isBillableOrder("DELIVERED", "DELIVERED", false), true);
  assert.equal(isBillableOrder("COMPLETED", "DELIVERED", false), true);
});

test("guest cannot order for another room or after checkout", () => {
  assert.deepEqual(
    assertStayAccess({
      actorId: "a",
      stayUserId: "b",
      stayRoomId: 23,
      requestedRoomId: 23,
      stayStatus: "ACTIVE",
    }),
    { ok: false, code: "forbidden_guest" },
  );
  assert.deepEqual(
    assertStayAccess({
      actorId: "a",
      stayUserId: "a",
      stayRoomId: 23,
      requestedRoomId: 24,
      stayStatus: "ACTIVE",
    }),
    { ok: false, code: "wrong_room" },
  );
  assert.equal(canPlaceOrder("CLOSED"), false);
  assert.deepEqual(
    assertStayAccess({
      actorId: "a",
      stayUserId: "a",
      stayRoomId: 23,
      requestedRoomId: 23,
      stayStatus: "CLOSED",
    }),
    { ok: false, code: "stay_inactive" },
  );
});

test("extension conflict rejects overlapping nights and accepts a free range", () => {
  const denied = extensionDecision({
    currentCheckOut: "2026-09-30",
    requestedCheckOut: "2026-10-03",
    conflictingNights: ["2026-10-01"],
  });
  assert.equal(denied.ok, false);
  const allowed = extensionDecision({
    currentCheckOut: "2026-09-30",
    requestedCheckOut: "2026-10-03",
    conflictingNights: [],
  });
  assert.equal(allowed.ok, true);
  if (allowed.ok) assert.deepEqual(allowed.nights, ["2026-09-30", "2026-10-01", "2026-10-02"]);
});

test("department scope keeps coffee out of housekeeping", () => {
  assert.equal(departmentScope(["COFFEE_SHOP", "GUEST"]), "COFFEE_SHOP");
  assert.equal(departmentScope(["HOUSEKEEPING"]), "HOUSEKEEPING");
  assert.equal(departmentScope(["RECEPTION"]), null);
  assert.equal(departmentScope(["GUEST"]), "NONE");
});

test("unpriced items block delivery pricing and do not invent a zero charge", () => {
  assert.equal(orderIsPriced([{ unitPrice: null, complimentary: false, quantity: 1 }]), false);
  assert.equal(orderIsPriced([{ unitPrice: null, complimentary: true, quantity: 2 }]), true);
  assert.equal(
    orderChargeAmount([
      { unitPrice: 50, complimentary: false, quantity: 2 },
      { unitPrice: null, complimentary: true, quantity: 1 },
    ]),
    100,
  );
});

test("tehran date and toman formatting stay explicit", () => {
  const middayUtc = new Date("2026-09-28T08:30:00.000Z");
  assert.equal(tehranToday(middayUtc), "2026-09-28");
  assert.match(formatToman(null, "en"), /not set/i);
  assert.match(formatToman(1200, "en"), /1,200 toman/);
});
