// The numbers creators make decisions with. If any of these change,
// someone would be shown the wrong amount to spend or save.
const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const { openApp, closeAll } = require("./helpers");

after(closeAll);

const text = (page, sel) => page.$eval(sel, el => el.textContent.replace(/\s+/g, " ").trim());

test("safe to spend = money received - all spending - tax set-aside", async () => {
  const page = await openApp();
  assert.equal(await text(page, "#ovSetAside .sa-main .sa-value"), "$5,450.00");
  assert.deepEqual(page.errors, []);
});

test("tax set-aside is 30% of profit, where only deductible expenses lower profit", async () => {
  const page = await openApp();
  const cols = await page.$$eval("#ovSetAside .sa-col", els => els.map(e => e.querySelector(".sa-value").textContent.trim()));
  assert.equal(cols[1], "$2,550.00"); // (10,000 - 1,500) x 30%
  assert.equal(cols[2], "$2,550.00"); // Q4 runs Sep 1 - Dec 31, so all of it lands in this quarter
});

test("a different set-aside percentage changes the math", async () => {
  const page = await openApp({ tables: { profiles: [{ id:"11111111-2222-3333-4444-555555555555", creator_settings:{ setAsidePct:25, rateSet:true, setupDone:true } }] } });
  assert.equal(await text(page, "#ovSetAside .sa-main .sa-value"), "$5,875.00"); // 10,000 - 2,000 - 2,125
});

test("tax payments already made aren't counted twice", async () => {
  const page = await openApp({ tables: { profiles: [{ id:"11111111-2222-3333-4444-555555555555",
    creator_settings:{ setupDone:true, taxPayments:[{ id:"t1", amount:3000, quarter:"Q2", year:2026, date:"2026-06-15" }] } }] } });
  // Paid 3,000 is more than the 2,550 set-aside, so 3,000 comes off instead.
  assert.equal(await text(page, "#ovSetAside .sa-main .sa-value"), "$5,000.00");
});

test("'Can I afford it?' never spends the tax set-aside", async () => {
  const page = await openApp();
  await page.click("#ovSetAside [data-afford]");
  const ask = async amt => { await page.fill("#affAmt", String(amt)); return text(page, "#affOut"); };
  assert.match(await ask(1000), /^Yes, comfortably\..*\$4,450\.00/);
  assert.match(await ask(4000), /^Yes, but it uses most of your cushion\..*\$1,450\.00/);
  assert.match(await ask(6000), /^Not yet\..*\$550\.00 more/);
});
