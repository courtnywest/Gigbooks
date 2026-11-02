// The numbers creators make decisions with. If any of these change,
// someone would be shown the wrong amount to spend or save.
const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const { openApp, closeAll } = require("./helpers");

after(closeAll);

const text = (page, sel) => page.$eval(sel, el => el.textContent.replace(/\s+/g, " ").trim());
const ME = "11111111-2222-3333-4444-555555555555";
const withSettings = cs => ({ tables: { profiles: [{ id:ME, creator_settings: Object.assign({ setupDone:true }, cs) }] } });

// Fixture (see helpers.js): Oct income 6,000; Sep income 4,000; Oct spending 1,500 (deductible);
// Sep spending 500 (not deductible). Today is Oct 30, 2026.

test("business profit = money in - business expenses, for the chosen period", async () => {
  const page = await openApp();
  assert.equal(await text(page, "#homeSnapshot .hh-label"), "Your business profit");
  assert.equal(await text(page, "#homeSnapshot .hh-value"), "$4,500");
  const [mIn, mOut] = await page.$$eval("#homeSnapshot .hs-value", els => els.map(e => e.textContent.trim()));
  assert.equal(mIn, "$6,000");
  assert.equal(mOut, "$1,500");
  assert.match(await text(page, "#homeSnapshot .home-stat.in .hs-sub"), /↑ 50% vs\. last month/);
  await page.click("[data-home-period='year']");
  assert.equal(await text(page, "#homeSnapshot .hh-value"), "$8,000"); // 10,000 - 2,000
  await page.click("[data-home-period='last']");
  assert.equal(await text(page, "#homeSnapshot .hh-value"), "$3,500"); // Sep: 4,000 - 500
  assert.deepEqual(page.errors, []);
});

test("without a real balance, Home asks for one instead of guessing what's safe to spend", async () => {
  const page = await openApp();
  assert.match(await text(page, "#homeSafe"), /Let's figure out what you can safely spend\./);
  assert.equal(await page.$("#homeSafe .sc-value"), null);
});

test("safe to spend starts from the balance and holds back taxes still to pay", async () => {
  const page = await openApp(withSettings({ cashOnHand:8000, cashAsOf:"2026-10-30" }));
  // 8,000 - taxes still to pay (30% of 8,500 profit = 2,550)
  assert.equal(await text(page, "#homeSafe .sc-value"), "$5,450");
});

test("money logged after the balance date is added or taken off", async () => {
  const page = await openApp(withSettings({ cashOnHand:8000, cashAsOf:"2026-10-01" }));
  // 8,000 + 6,000 (Oct 10 income) - 1,500 (Oct 5 expense) - 2,550 taxes
  assert.equal(await text(page, "#homeSafe .sc-value"), "$9,950");
});

test("a different set-aside percentage changes the tax hold-back", async () => {
  const page = await openApp(withSettings({ cashOnHand:8000, cashAsOf:"2026-10-30", setAsidePct:25, rateSet:true }));
  assert.equal(await text(page, "#homeSafe .sc-value"), "$5,875"); // 8,000 - 2,125
});

test("tax payments already made aren't held back twice", async () => {
  const page = await openApp(withSettings({ cashOnHand:8000, cashAsOf:"2026-10-30",
    taxPayments:[{ id:"t1", amount:3000, quarter:"Q2", year:2026, date:"2026-06-15" }] }));
  assert.equal(await text(page, "#homeSafe .sc-value"), "$8,000"); // 3,000 paid covers the 2,550
});

test("tax money kept in a separate account isn't subtracted again", async () => {
  const page = await openApp(withSettings({ cashOnHand:8000, cashAsOf:"2026-10-30", taxSeparate:true }));
  assert.equal(await text(page, "#homeSafe .sc-value"), "$8,000");
});

test("'Can I afford it?' uses safe to spend, never profit", async () => {
  const page = await openApp(withSettings({ cashOnHand:8000, cashAsOf:"2026-10-30" }));
  await page.click("#homeSafe [data-afford]");
  const ask = async amt => { await page.fill("#affAmt", String(amt)); return text(page, "#affOut"); };
  assert.match(await ask(1000), /^Yes, comfortably\..*\$4,450\.00/);
  assert.match(await ask(4000), /^Yes, but it uses most of your cushion\..*\$1,450\.00/);
  assert.match(await ask(6000), /^Not yet\..*\$550\.00 more/);
});

test("'Can I afford it?' asks for a balance first when there isn't one", async () => {
  const page = await openApp();
  await page.click("#giggyBtn");
  await page.fill("#askInput", "Can I afford a $2,000 camera?");
  await page.click("#askSend");
  assert.match(await page.$$eval(".ask-msg.assistant", els => els[els.length-1].textContent), /what's in your business account right now/);
});
