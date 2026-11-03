import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv, toCsv } from "../utils/csv.js";
import { normalizeDate } from "../routes/csv.js";

test("parseCsv handles quotes, commas, CRLF and BOM", () => {
  const text = '﻿a,b\r\n"x,""y""",2\nlast,row';
  assert.deepEqual(parseCsv(text), [
    ["a", "b"],
    ['x,"y"', "2"],
    ["last", "row"],
  ]);
});

test("toCsv round-trips through parseCsv", () => {
  const rows = [
    ["title", "notes"],
    ['He said "hi"', "line1\nline2, with comma"],
  ];
  assert.deepEqual(parseCsv(toCsv(rows)), rows);
});

test("normalizeDate accepts both formats and rejects bad dates", () => {
  assert.equal(normalizeDate("2027-03-31"), "2027-03-31");
  assert.equal(normalizeDate("31/03/2027"), "2027-03-31");
  assert.equal(normalizeDate("1/3/2027"), "2027-03-01"); // D/M/YYYY padded
  assert.equal(normalizeDate("2027-02-30"), null); // impossible date
  assert.equal(normalizeDate("30/02/2027"), null);
  assert.equal(normalizeDate("03-31-2027"), null); // unsupported shape
  assert.equal(normalizeDate(""), null);
});
