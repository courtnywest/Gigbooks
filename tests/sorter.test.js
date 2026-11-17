// Swiping through expenses, and uploading receipts that GigBooks reads.
const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const { openApp, closeAll, go } = require("./helpers");

after(closeAll);
const PHONE = { width:390, height:900 };
// A stand-in for the on-device receipt reader, so tests don't download it.
const reader = text => `window.Tesseract = { recognize: async () => ({ data:{ text: ${JSON.stringify(text)} } }) };`;
const png = { name:"receipt.png", mimeType:"image/png", buffer: Buffer.from("89504e470d0a1a0a", "hex") };
const exp = (id, date, description, amount, category = "Other", extra = {}) => Object.assign({ id, date, description, category, payment_method:"", deductible:true, amount }, extra);
const MESSY = { tables: { expenses: [
  exp("a", "2026-10-28", "SQ *BLUE BOTTLE", 18),
  exp("b", "2026-10-20", "B&H Photo", 640, "Equipment"),
  exp("c", "2026-10-12", "Canva", 15, "Software", { receipt_path:"x/c.png" }),
  exp("d", "2026-10-02", "Uber", 96)
] } };
const updates = (page, table) => page.evaluate(t => (window.__updates || []).filter(u => u.table === t).map(u => u.values), table);
const swipe = (page, dx) => page.evaluate(dx => {
  const el = document.getElementById("swCard");
  const t = (x) => new Touch({ identifier:1, target:el, clientX:x, clientY:300 });
  el.dispatchEvent(new TouchEvent("touchstart", { touches:[t(200)], bubbles:true }));
  el.dispatchEvent(new TouchEvent("touchmove", { touches:[t(200 + dx/2)], bubbles:true }));
  el.dispatchEvent(new TouchEvent("touchmove", { touches:[t(200 + dx)], bubbles:true }));
  el.dispatchEvent(new TouchEvent("touchend", { touches:[], bubbles:true }));
}, dx);

test("Money Moves points to expenses missing details", async () => {
  const page = await openApp(MESSY);
  assert.match(await page.textContent("#ovNudges"), /3 expenses are missing details\./);
  assert.match(await page.textContent("#ovNudges"), /2 bigger purchases without a receipt, 2 without a category/);
});

test("the swipe view starts with what's missing, and saves each change as you go", async () => {
  const page = await openApp(MESSY, PHONE);
  await go(page, "expenses");
  await page.click("#openSorterBtn");
  assert.match(await page.textContent(".rv-top"), /1 of 3/); // Canva is complete, so it's skipped
  assert.match(await page.textContent(".sw-scope"), /Needs details \(3\)/);
  assert.equal(await page.inputValue("#swDesc"), "SQ *BLUE BOTTLE");
  assert.match(await page.textContent(".sw-gaps"), /Needs a category/);
  await page.click("[data-sw-cat='Meals']");
  assert.deepEqual((await updates(page, "expenses")).pop(), { category:"Meals" });
  assert.match(await page.textContent(".sw-gaps"), /All set/);
  assert.match(await page.textContent("#swRemember"), /Remember SQ \*BLUE BOTTLE → Meals for next time/);
  await page.click("[data-sw-ded='no']");
  assert.deepEqual((await updates(page, "expenses")).pop(), { deductible:false });
  await swipe(page, -120);
  await page.waitForTimeout(250);
  assert.match(await page.textContent(".rv-top"), /2 of 3/);
  assert.equal(await page.inputValue("#swDesc"), "B&H Photo");
  assert.match(await page.textContent(".sw-gaps"), /Receipt recommended/);
  await swipe(page, 120);
  await page.waitForTimeout(250);
  assert.match(await page.textContent(".rv-top"), /1 of 3/);
  assert.deepEqual(page.errors, []);
});

test("adding a receipt in the swipe view reads it and offers to fix what doesn't match", async () => {
  const page = await openApp(MESSY, PHONE, { init: reader("B&H PHOTO VIDEO\n10/20/2026\nSUBTOTAL 590.00\nTOTAL $638.50") });
  await page.evaluate(() => document.querySelector("[data-open-sorter]").click());
  await page.click("#swNext");
  await page.waitForTimeout(250);
  await page.setInputFiles("#swFile", png);
  await page.waitForSelector("[data-sw-use='amount']");
  assert.match(await page.textContent("#swRead"), /We read: B&H PHOTO VIDEO · \$638\.50 · Oct 20, 2026\. It doesn't quite match/);
  const ups = await page.evaluate(() => window.__uploads);
  assert.equal(ups.length, 1);
  assert.match(ups[0].path, /\/b-\d+\.png$/);
  assert.ok((await updates(page, "expenses")).some(u => /\/b-\d+\.png$/.test(u.receipt_path || "")));
  await page.click("[data-sw-use='amount']");
  assert.deepEqual((await updates(page, "expenses")).pop(), { amount:638.5 });
  assert.equal(await page.inputValue("#swAmt"), "638.5");
  assert.match(await page.textContent(".sw-gaps"), /All set/);
});

test("an uploaded receipt that matches an existing expense is attached to it, not added twice", async () => {
  const page = await openApp(MESSY, undefined, { init: reader("UBER\nOct 2, 2026\nTotal $96.00") });
  await go(page, "expenses");
  await page.setInputFiles("#scanReceiptInput", png);
  await page.waitForSelector("#rmAttach");
  assert.match(await page.textContent(".sw-match"), /Uber\s*\$96\.00 · Oct 2, 2026/);
  await page.click("#rmAttach");
  await page.waitForTimeout(150);
  assert.equal(await page.evaluate(() => (window.__inserts || []).filter(i => i.table === "expenses").length), 0);
  assert.ok((await updates(page, "expenses")).some(u => /\/d-\d+\.png$/.test(u.receipt_path || "")));
});

test("a receipt with no match fills in a new expense", async () => {
  const page = await openApp(MESSY, undefined, { init: reader("TARGET\n10/29/2026\nTOTAL $42.18") });
  await go(page, "expenses");
  await page.setInputFiles("#scanReceiptInput", png);
  await page.waitForFunction(() => document.getElementById("expenseModal").classList.contains("open"));
  await page.waitForTimeout(100);
  assert.equal(await page.inputValue("#expenseForm [name=description]"), "TARGET");
  assert.equal(await page.inputValue("#expenseForm [name=amount]"), "42.18");
  assert.equal(await page.inputValue("#expenseForm [name=date]"), "2026-10-29");
  assert.match(await page.textContent("#receiptStatusWrap"), /Filled in from your receipt/);
  await page.click("#expenseSubmitBtn");
  await page.waitForTimeout(200);
  const ups = await page.evaluate(() => window.__uploads);
  assert.equal(ups.length, 1); // the photo is kept with the new expense
});

test("PDF receipts are kept with the expense, with a note that they aren't read", async () => {
  const page = await openApp(MESSY);
  await go(page, "expenses");
  await page.setInputFiles("#scanReceiptInput", { name:"invoice.pdf", mimeType:"application/pdf", buffer: Buffer.from("%PDF-1.4") });
  await page.waitForFunction(() => document.getElementById("expenseModal").classList.contains("open"));
  assert.match(await page.textContent("#receiptStatusWrap"), /PDF attached\. We can read photos/);
});
