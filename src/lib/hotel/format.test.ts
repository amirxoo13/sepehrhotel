import assert from "node:assert/strict";
import test from "node:test";
import { toJalaali } from "jalaali-js";
import { addDays, monthGrid, showDate } from "./format.ts";

test("english dates stay gregorian and persian dates are jalali", () => {
  assert.equal(showDate("2016-04-11", "en"), "April 11, 2016");
  assert.equal(showDate("2016-04-11", "fa"), "۲۳ فروردین ۱۳۹۵");
});

test("a jalali month grid maps back to the same absolute day", () => {
  const grid = monthGrid("fa", "2016-04-11");
  assert.equal(grid.cells.length % 7, 0);
  const cell = grid.cells.find((item) => item.iso === "2016-04-11");
  assert.ok(cell);
  assert.equal(cell.outside, false);
  const [y, m, d] = cell.iso.split("-").map(Number);
  const j = toJalaali(y, m, d);
  assert.equal(j.jy, 1395);
  assert.equal(j.jm, 1);
  assert.equal(j.jd, 23);
});

test("adding a day does not depend on the machine timezone", () => {
  assert.equal(addDays("2026-09-28", 1), "2026-09-29");
  const grid = monthGrid("en", "2026-09-28");
  assert.equal(grid.title, "September 2026");
  assert.equal(grid.cells.filter((cell) => !cell.outside).length, 30);
});
