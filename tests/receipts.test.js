// The receipt reader runs on text from the phone's camera. These check that the
// store, date and total come out right for common receipt layouts.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const src = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const body = src.slice(src.indexOf("  function parseReceipt(text){"), src.indexOf("  async function scanReceipt(file){"));
const parseReceipt = new Function("pad2", "parseISODate", "todayISO", body + "\nreturn parseReceipt;")(
  n => String(n).padStart(2, "0"), s => new Date(s + "T00:00:00"), () => "2026-10-30");

test("takes the TOTAL line, not the subtotal or the biggest item", () => {
  const r = parseReceipt("TARGET\nStore 1234\n10/12/2026 14:02\nCAMERA SD CARD 24.99\nSUBTOTAL 33.98\nTAX 2.89\nTOTAL $36.87\nVISA 36.87");
  assert.deepEqual(r, { total:36.87, date:"2026-10-12", merchant:"TARGET" });
});

test("reads 'Amount due' and written-out dates", () => {
  const r = parseReceipt("Blue Bottle Coffee\nOct 3, 2026\nLatte 6.50\nCroissant 4.25\nAmount Due 10.75");
  assert.deepEqual(r, { total:10.75, date:"2026-10-03", merchant:"Blue Bottle Coffee" });
});

test("reads ISO dates and 'Grand total'", () => {
  const r = parseReceipt("Adobe Inc.\nInvoice date 2026-09-14\nCreative Cloud All Apps 59.99\nGrand total 59.99");
  assert.deepEqual(r, { total:59.99, date:"2026-09-14", merchant:"Adobe Inc." });
});

test("ignores dates in the future", () => {
  const r = parseReceipt("Shop\n12/25/2026\nTotal 10.00");
  assert.equal(r.date, null);
});
