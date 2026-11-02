// The numbers creators make decisions with. If any of these change,
// someone would be shown the wrong amount to spend or save.
const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const { openApp, closeAll } = require("./helpers");

after(closeAll);

const text = (page, sel) => page.$eval(sel, el => el.textContent.replace(/\s+/g, " ").trim());
const ME = "11111111-2222-3333-4444-555555555555";

test("safe to spend = money received - all spending - tax set-aside", async () => {
  const page = await openApp();
  assert.equal(await text(page, "#homeSnapshot .hh-value"), "$5,450");
  assert.deepEqual(page.errors, []);
});

test("Home shows this month's money earned and spent", async () => {
  const page = await openApp();
  const [earned, spent] = await page.$$eval("#homeSnapshot .hs-value", els => els.map(e => e.textContent.trim()));
  assert.equal(earned, "$6,000"); // October income
  assert.equal(spent, "$1,500");  // October spending
  assert.match(await text(page, "#homeSnapshot .home-stat .hs-sub"), /↑ 50% vs\. last month/); // 6,000 vs 4,000 in September
});

test("tax set-aside is 30% of profit, where only deductible expenses lower profit", async () => {
  const page = await openApp();
  // (10,000 - 1,500) x 30% = 2,550, and Q4 (Sep 1 - Dec 31) holds all of it
  assert.match(await text(page, "#homeSnapshot .home-tax"), /\$2,550 set aside so far this year · next payment about \$2,550, due Jan 15/);
});

test("a different set-aside percentage changes the math", async () => {
  const page = await openApp({ tables: { profiles: [{ id:ME, creator_settings:{ setAsidePct:25, rateSet:true, setupDone:true } }] } });
  assert.equal(await text(page, "#homeSnapshot .hh-value"), "$5,875"); // 10,000 - 2,000 - 2,125
});

test("tax payments already made aren't counted twice", async () => {
  const page = await openApp({ tables: { profiles: [{ id:ME,
    creator_settings:{ setupDone:true, taxPayments:[{ id:"t1", amount:3000, quarter:"Q2", year:2026, date:"2026-06-15" }] } }] } });
  // Paid 3,000 is more than the 2,550 set-aside, so 3,000 comes off instead.
  assert.equal(await text(page, "#homeSnapshot .hh-value"), "$5,000");
});

test("'Can I afford it?' never spends the tax set-aside", async () => {
  const page = await openApp();
  await page.click("#homeSnapshot [data-afford]");
  const ask = async amt => { await page.fill("#affAmt", String(amt)); return text(page, "#affOut"); };
  assert.match(await ask(1000), /^Yes, comfortably\..*\$4,450\.00/);
  assert.match(await ask(4000), /^Yes, but it uses most of your cushion\..*\$1,450\.00/);
  assert.match(await ask(6000), /^Not yet\..*\$550\.00 more/);
});
