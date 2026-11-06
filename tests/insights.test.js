// Insights and the monthly income goal: computed from records, with the math shown.
const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const { openApp, closeAll, go } = require("./helpers");

after(closeAll);
const ME = "11111111-2222-3333-4444-555555555555";
const inc = (id, date, source, amount, status = "received") => ({ id, date, source, type:"Brand Deal", status, amount });
const exp = (id, date, description, amount, category = "Software") => ({ id, date, description, category, payment_method:"", deductible:true, amount });
const insights = page => page.evaluate(() => window.__gbTest.computeInsights(1).map(x => [x.id, x.text]));

test("the income goal counts only money received, and says what's left out", async () => {
  const page = await openApp({ tables: {
    income: [inc("a", "2026-10-10", "Glossier", 4000), inc("b", "2026-10-20", "Nike", 900, "pending")],
    invoices: [{ id:"v1", invoice_number:4, client_name:"Aritzia", issue_date:"2026-10-01", due_date:"2026-11-20", status:"sent", line_items:[], subtotal:1200, total:1200 }],
    profiles: [{ id:ME, creator_settings:{ setupDone:true, incomeGoal:5000 } }] } });
  assert.match(await page.textContent("#homeSnapshot .hs-goal"), /80% of your \$5,000 goal/);
  assert.match(await page.textContent("#ovNudges"), /You're 80% of the way to your monthly income goal\./);
  await page.click("#homeSnapshot .hs-goal");
  const rows = await page.$$eval("#settingsModalBox .explain-math > div", els => els.map(e => [...e.children].map(c => c.textContent.replace(/\s+/g, " ").trim()).join(" ")));
  assert.deepEqual(rows, ["Monthly income goal $5,000.00", "Recorded income toward it (Oct 1, 2026 – Oct 30, 2026) $4,000.00", "Remaining $1,000.00"]);
  assert.match(await page.textContent("#settingsModalBox"), /\$900\.00 marked as pending and \$1,200\.00 in unpaid invoices aren't included/);
  await page.click("#igRemove");
  await page.waitForTimeout(100);
  assert.equal(await page.$("#homeSnapshot .hs-goal"), null);
  const cs = await page.evaluate(() => window.__updates.filter(u => u.table === "profiles").pop().values.creator_settings);
  assert.equal(cs.incomeGoal, undefined);
});

test("a goal can be set from scratch", async () => {
  const page = await openApp();
  await page.evaluate(() => document.querySelector("[data-income-goal]") || document.body.insertAdjacentHTML("beforeend", '<button id="t" data-income-goal="1"></button>'));
  await page.click("[data-income-goal]");
  await page.fill("#igAmt", "8000");
  await page.click("#igSave");
  assert.match(await page.textContent("#homeSnapshot .hs-goal"), /75% of your \$8,000 goal/);
});

test("insights only appear with enough data, and every number adds up", async () => {
  // Sep 5,000 vs Aug 4,000: +25%. Sep profit 5,000 − 300 = 4,700.
  let page = await openApp({ tables: {
    income: [inc("a", "2026-08-10", "Nike", 4000), inc("b", "2026-09-10", "Glossier", 5000)],
    expenses: [exp("e", "2026-09-03", "Adobe", 300)] } });
  assert.deepEqual(await insights(page), [
    ["profit", "You earned $4,700.00 in September after recorded business expenses."],
    ["trend", "Your income in September was 25% higher than in August."]]);

  page = await openApp({ tables: { income: [inc("a", "2026-09-10", "Glossier", 5000)], expenses: [] } });
  assert.deepEqual((await insights(page)).map(x => x[0]), ["profit"]); // nothing to compare with
  page = await openApp({ tables: { income: [], expenses: [] } });
  assert.deepEqual(await insights(page), []);
  assert.equal(await page.textContent("#ovInsight"), "");
});

test("one client's share of the quarter, recurring costs, and consistency", async () => {
  const page = await openApp({ tables: {
    income: [inc("q1", "2026-10-02", "Glossier", 3000), inc("q2", "2026-10-12", "Nike", 1000), inc("q3", "2026-10-20", "Glossier", 1000),
      ...["2026-04", "2026-05", "2026-06"].map((m, i) => inc("o" + i, m + "-15", "Mix", [1000, 5000, 2000][i])),
      ...["2026-07", "2026-08", "2026-09"].map((m, i) => inc("n" + i, m + "-15", "Mix", [3000, 3100, 2900][i]))],
    expenses: [exp("r1", "2026-07-02", "Adobe", 20), exp("r2", "2026-08-02", "Adobe", 20), exp("r3", "2026-09-02", "Adobe", 60),
      exp("r4", "2026-07-03", "Notion", 10), exp("r5", "2026-08-03", "Notion", 10), exp("r6", "2026-09-03", "Notion", 10)] } });
  const all = Object.fromEntries(await insights(page));
  assert.equal(all.concentration, "One client, Glossier, made up 80% of your income this quarter so far.");
  assert.equal(all.recurring, "Your recurring expenses went up in September: $70.00, compared with $30.00 in August.");
  assert.equal(all.consistency, "Your monthly income has become more consistent over the past six months.");
});

test("Home shows one insight picked for your goal, and its numbers", async () => {
  const page = await openApp({ tables: { profiles: [{ id:ME, creator_settings:{ setupDone:true, business:{ ways:["content"], goal:"grow" } } }] } });
  // Base fixture: Sep has $4,000 in and $500 out, August has nothing, so there's no trend to report.
  assert.match(await page.textContent("#ovInsight"), /You earned \$3,500\.00 in September after recorded business expenses\./);
  assert.match(await page.textContent("#ovInsight"), /Sep 1, 2026 – Sep 30, 2026/);
  await page.click("#ovInsight [data-insight]");
  assert.match(await page.textContent("#settingsModalBox"), /Recorded transactions only, no projections/);
});
