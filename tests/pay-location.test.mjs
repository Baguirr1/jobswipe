import { deepStrictEqual, strictEqual } from "node:assert";
import { test } from "node:test";
import { canUsePayEstimate, formatPay, isLikelyNonUS } from "../src/lib/format.ts";

test("explicit foreign locations override remote and apparent state codes", () => {
  for (const location of ["Poland", "Remote (Canada)", "Barcelona, CT, Spain", "London, U.K."]) {
    strictEqual(isLikelyNonUS(location), true, location);
  }
});

test("US and ambiguous locations retain estimate eligibility", () => {
  for (const location of [null, "", "Remote", "Grand Rapids", "Charlotte, NC", "Seattle", "New Mexico", "US / Canada"]) {
    strictEqual(isLikelyNonUS(location), false, String(location));
  }
});

test("foreign locations hide stale BLS estimates while preserving stated pay and Adzuna estimates", () => {
  const job = { location: "Poland", est_pay_min: 67000, est_pay_max: 120000, est_pay_source: "bls" };
  strictEqual(canUsePayEstimate(job), false);
  deepStrictEqual(formatPay(job), { text: "Salary not listed", estimated: false, note: null });
  deepStrictEqual(formatPay({ ...job, salary_min: 90000 }), { text: "$90k+", estimated: false, note: null });
  strictEqual(formatPay({ ...job, est_pay_source: "adzuna" }).estimated, true);
  strictEqual(formatPay({ ...job, location: "Remote" }).estimated, true);
});
