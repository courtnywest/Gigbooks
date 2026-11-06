// Phase 4: creator tools and the public homepage.
const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const { openApp, closeAll, go } = require("./helpers");

after(closeAll);

async function logGift(page, terms){
  await go(page, "income");
  await page.click("[data-new-gift]");
  await page.fill("#giftForm [name=brand]", "Glossier");
  await page.fill("#giftForm [name=what]", "Skincare set");
  await page.fill("#giftForm [name=worth]", "150");
  await page.click(`#giftTerms [data-terms='${terms}']`);
  await page.click("#giftForm button[type=submit]");
  await page.waitForTimeout(200);
}
const incomeRows = page => page.evaluate(() => (window.__inserts || []).filter(i => i.table === "income").length);

test("a gift given for promotion counts as income", async () => {
  const page = await openApp();
  await logGift(page, "promo");
  assert.equal(await incomeRows(page), 1);
  assert.deepEqual(page.errors, []);
});

test("a no-strings gift is logged but not counted, and isn't nagged about", async () => {
  const page = await openApp();
  await logGift(page, "nostrings");
  assert.equal(await incomeRows(page), 0);
  await go(page, "overview");
  assert.doesNotMatch(await page.textContent("#ovNudges"), /gift/i);
});

test("an unsure gift waits in the to-do list instead of being assumed taxable", async () => {
  const page = await openApp();
  await logGift(page, "unsure");
  assert.equal(await incomeRows(page), 0);
  await go(page, "overview");
  assert.match(await page.textContent("#ovNudges"), /Decide on 1 gift you weren't sure about/);
});

test("the gift form asks before counting anything", async () => {
  const page = await openApp();
  await go(page, "income");
  await page.click("[data-new-gift]");
  assert.equal(await page.$("#giftForm [name=countNow]"), null); // no pre-ticked "count as income"
  assert.match(await page.textContent("#giftForm"), /Did you agree to post or promote it in exchange\?/);
});

test("deal stages use plain words, with the stored stages unchanged", async () => {
  const page = await openApp({ tables: { pipeline_deals: [{ id:"d1", brand_name:"Nike", deliverable:"Reel", estimated_value:2000, stage:"signed" }] } });
  await go(page, "pipeline");
  const opts = await page.$$eval("#view-pipeline select option", os => os.slice(0, 6).map(o => [o.value, o.textContent]));
  assert.deepEqual(opts, [["lead","Potential"],["pitched","In Talks"],["negotiating","In Talks: agreeing terms"],["signed","Agreed: in progress"],["delivered","Waiting for Payment"],["paid","Paid"]]);
});

test("the rate calculator asks what you want to earn and explains the math", async () => {
  const page = await openApp();
  await go(page, "rateCalculator");
  assert.ok(await page.isVisible("#rcHourlyRate")); // not hidden under Advanced any more
  assert.equal(await page.isVisible("#rcManagerFee"), false);
  await page.fill("#rcHours", "4");
  await page.fill("#rcHourlyRate", "100");
  assert.match(await page.textContent("#rcExplain"), /4 hours × \$100 for your time.*not a market rate/);
});

test("the homepage leads with outcomes and every button works", async () => {
  const page = await openApp({ loggedOut:true });
  await page.waitForTimeout(200);
  assert.match(await page.textContent("#page-landing .hero h1"), /Make money\.\s*Not spreadsheets\./);
  assert.doesNotMatch(await page.textContent("#page-landing"), /Watch Demo/);
  assert.match(await page.textContent("#page-landing"), /One plan, \$12 a month, with everything included\./);
  const steps = await page.$$eval("#howItWorks li b", els => els.map(e => e.textContent));
  assert.equal(steps.length, 3);
  await page.click("#watchDemoBtn");
  await page.waitForTimeout(500);
  assert.ok(await page.evaluate(() => window.scrollY) > 300, "page scrolled down to How it works");
  const box = await page.$eval("#howItWorks", el => { const r = el.getBoundingClientRect(); return { top:r.top, bottom:r.bottom }; });
  assert.ok(box.top < 900 && box.bottom > 0, "How it works is on screen");
});
