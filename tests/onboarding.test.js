// First-time setup: three steps to a first real number, plus the privacy of analytics.
const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const { openApp, closeAll, go } = require("./helpers");

after(closeAll);

const ME = "11111111-2222-3333-4444-555555555555";
// A brand-new account: no income, no expenses, just the default categories.
const NEW_USER = { tables: { income: [], expenses: [] } };
const events = page => page.evaluate(() => (window.__inserts || []).filter(i => i.table === "product_events").map(i => i.row));

test("new users get three steps: work, how to start, first transaction, then their first number", async () => {
  const page = await openApp(NEW_USER);
  await page.waitForSelector(".ob-options");
  assert.match(await page.textContent("#settingsModalBox h2"), /What kind of work do you do\?/);
  const kinds = await page.$$eval("[data-work] b", els => els.map(e => e.textContent));
  assert.deepEqual(kinds, ["Content creator / influencer", "Freelancer", "Small business owner", "Something else"]);
  await page.click("[data-work='freelancer']");
  await page.click("#wizNext");
  assert.match(await page.textContent("#settingsModalBox h2"), /How would you like to get started\?/);
  assert.match(await page.textContent("[data-path='connect']"), /never your bank password/);
  await page.click("[data-path='manual']");
  await page.click("[data-dir='out']");
  assert.equal(await page.getAttribute("#obName", "placeholder"), "e.g. Figma subscription"); // freelancer example
  await page.fill("#obName", "Figma subscription");
  await page.fill("#obAmt", "15");
  await page.click("#obSave");
  await page.waitForSelector(".ob-first");
  assert.match(await page.textContent(".ob-big"), /−\$15/);
  await page.click("#obDone");
  assert.match(await page.textContent("#homeSnapshot .hh-value"), /−\$15/);
  assert.deepEqual(page.errors, []);
});

test("every step can be skipped, and progress is saved", async () => {
  const page = await openApp({ tables: { income: [], expenses: [], profiles: [{ id:ME, creator_settings:{ workKind:"creator", onboarding:{ step:2 } } }] } });
  await page.waitForSelector(".ob-options");
  assert.match(await page.textContent("#settingsModalBox h2"), /How would you like to get started\?/); // picks up at step 2
  await page.click("#wizSkip");
  await page.waitForTimeout(150);
  assert.equal(await page.$eval("#settingsModal", m => m.classList.contains("open")), false);
  assert.match(await page.textContent("#ovNudges"), /Log your first income/); // first step still offered, gently
});

test("existing accounts aren't sent through setup again", async () => {
  const page = await openApp();
  await page.waitForTimeout(200);
  assert.equal(await page.$(".ob-options"), null);
});

test("empty pages say what to do next", async () => {
  const page = await openApp({ tables: { income: [], expenses: [], profiles: [{ id:ME, creator_settings:{ setupDone:true } }] } });
  await go(page, "income");
  assert.match(await page.textContent("#view-income"), /No money in yet/);
  await go(page, "expenses");
  assert.match(await page.textContent("#view-expenses"), /No money out yet/);
  await go(page, "invoices");
  assert.match(await page.textContent("#view-invoices"), /No invoices yet/);
});

test("analytics records milestones, never amounts or names", async () => {
  const page = await openApp(NEW_USER);
  await page.waitForSelector(".ob-options");
  await page.click("[data-work='creator']");
  await page.click("#wizNext");
  await page.click("[data-path='manual']");
  await page.fill("#obName", "Brand deal with Glossier");
  await page.fill("#obAmt", "1200");
  await page.click("#obSave");
  await page.click("#obDone");
  await page.waitForTimeout(200);
  const evs = await events(page);
  const names = evs.map(e => e.event);
  for(const e of ["first_transaction_added", "onboarding_completed", "first_money_summary_viewed"]) assert.ok(names.includes(e), `${e} recorded`);
  assert.deepEqual(evs.find(e => e.event === "onboarding_completed").props, { path:"manual", work:"creator" });
  const blob = JSON.stringify(evs);
  assert.doesNotMatch(blob, /1200|Glossier|amount/i);
  // "first" events are only sent once
  await page.evaluate(() => document.querySelector('.nav-item[data-group="home"]').click());
  await page.waitForTimeout(100);
  assert.equal((await events(page)).filter(e => e.event === "first_money_summary_viewed").length, 1);
});
