// Small visual rules: money looks like money, empty projects are blank, no recurring button.
const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const { openApp, closeAll, go } = require("./helpers");

after(closeAll);

test("money inputs show a $ and the formatted amount for bigger numbers", async () => {
  const page = await openApp();
  await page.evaluate(() => document.body.insertAdjacentHTML("beforeend", '<button id="t" data-income-goal="1"></button>'));
  await page.click("#t");
  assert.equal(await page.$eval("#igAmt", el => el.hasAttribute("data-money")), true);
  const pad = await page.$eval("#igAmt", el => parseFloat(getComputedStyle(el).paddingLeft));
  assert.ok(pad >= 24, "room for the $ sign");
  await page.fill("#igAmt", "40000");
  assert.equal(await page.textContent("#igAmt + .money-echo"), "$40,000.00");
  await page.fill("#igAmt", "500");
  assert.equal(await page.$eval("#igAmt + .money-echo", el => getComputedStyle(el).display), "none"); // small numbers don't need it
});

test("every amount box in the app is marked as money, and percentages as percent", async () => {
  const page = await openApp();
  const html = await page.content();
  for(const id of ["rcHourlyRate", "rcExpenses"]) assert.match(html, new RegExp(`<input data-money[^>]*id="${id}"`));
  for(const id of ["rcManagerFee", "rcProfitMargin"]) assert.match(html, new RegExp(`<input data-pct[^>]*id="${id}"`));
  assert.equal(await page.$$eval('input[type="number"][name="amount"]:not([data-money])', els => els.length), 0);
});

test("an expense with no project shows a blank Project cell", async () => {
  const page = await openApp();
  await go(page, "expenses");
  const cells = await page.$$eval("#expenseTableBody tr", rows => rows.map(r => r.children[4].innerHTML.trim()));
  assert.deepEqual(cells, [""]); // only October's Camera is in view
  assert.doesNotMatch(await page.textContent("#view-expenses"), /<span|—/);
});

test("recurring expenses are switched off: no button, nothing created on load", async () => {
  const page = await openApp({ tables: { profiles: [{ id:"11111111-2222-3333-4444-555555555555", creator_settings:{ setupDone:true,
    recurring:[{ id:"r1", description:"Adobe", category:"Software", amount:60, frequency:"monthly", nextDate:"2026-10-01", anchorDay:1, active:true }] } }] } });
  await go(page, "expenses");
  assert.equal(await page.$("#openRecurring"), null);
  assert.equal(await page.evaluate(() => (window.__inserts || []).filter(i => i.table === "expenses").length), 0);
});
