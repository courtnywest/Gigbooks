// Retention: the monthly check-in, the monthly recap, and Giggy in context.
const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const { openApp, closeAll, go } = require("./helpers");

after(closeAll);

const WEEK = { tables: {
  income: [
    { id:"i1", date:"2026-10-10", source:"Glossier", type:"Brand Deal", status:"received", amount:6000 },
    { id:"i2", date:"2026-09-12", source:"Nike", type:"Brand Deal", status:"received", amount:4000 },
    { id:"i3", date:"2026-10-28", source:"YouTube", type:"Ad Revenue", status:"received", amount:800 }
  ],
  unclassified_expenses: [{ id:"u1", date:"2026-10-29", description:"Camera", amount:120 }],
  invoices: [{ id:"inv1", invoice_number:12, client_name:"Aritzia", issue_date:"2026-09-20", due_date:"2026-10-21", status:"sent", line_items:[], subtotal:3500, total:3500 }]
} };

test("the monthly check-in asks only what applies, then shows the month at a glance", async () => {
  const page = await openApp(WEEK);
  assert.match(await page.textContent("#ovNudges"), /Your October money check-in is ready/);
  await page.click("#ovNudges [data-weekly-note]");
  await page.waitForSelector(".ci");
  assert.match(await page.textContent(".rv-top"), /October check-in · 1 of 3/); // review, one invoice, goal (no gifts question for this account)
  assert.match(await page.textContent(".ci-q"), /Can we clear up this transaction\?/);
  await page.click("#ciGo");
  await page.click("#rvYes");
  await page.click("#rvBack");
  assert.match(await page.textContent(".ci-q"), /Did Aritzia pay you yet\?/);
  assert.match(await page.textContent(".ci"), /\$3,500\.00 · invoice #0012 · 10 days past due/);
  await page.click("#ciSkip"); // not yet
  assert.match(await page.textContent(".ci-q"), /Want to update your income goal for next month\?/);
  await page.fill("#ciGoalAmt", "7000");
  await page.click("#ciGoalSave");
  await page.waitForSelector(".ci h2");
  assert.match(await page.textContent(".ci h2"), /Your month at a glance/);
  const rows = await page.$$eval(".ci .explain-math > div", els => els.map(e => [...e.children].map(c => c.textContent.replace(/\s+/g, " ").trim()).join(" ")));
  assert.deepEqual(rows, ["Total income $6,800.00", "Total expenses $1,620.00", "Net profit (before taxes) $5,180.00", "Outstanding invoices 1 · $3,500.00", "Items still needing review None"]);
  assert.match(await page.textContent(".ci-insight"), /Your income so far in October was 70% higher than in September\./);
  await page.click("#ciFinish");
  await page.waitForTimeout(150);
  assert.doesNotMatch(await page.textContent("#ovNudges"), /check-in is ready/);
  const evs = await page.evaluate(() => (window.__inserts || []).filter(i => i.table === "product_events").map(i => i.row.event));
  assert.ok(evs.includes("weekly_checkin_completed"));
  const cs = await page.evaluate(() => window.__updates.filter(u => u.table === "profiles").pop().values.creator_settings);
  assert.equal(cs.checkinMonth, "2026-10");
  assert.equal(cs.incomeGoal, 7000);
  assert.deepEqual(page.errors, []);
});

test("saying a client paid marks the invoice paid and records the income", async () => {
  const page = await openApp({ tables: { invoices: WEEK.tables.invoices } });
  await page.click("#ovNudges [data-weekly-note]");
  assert.match(await page.textContent(".ci-q"), /Did Aritzia pay you yet\?/);
  await page.click("#ciPaid");
  await page.waitForSelector("#ciGoalAmt");
  const ins = await page.evaluate(() => window.__inserts.filter(i => i.table === "income").map(i => [i.row.source, i.row.amount, i.row.status]));
  assert.deepEqual(ins, [["Aritzia", 3500, "received"]]);
});

test("creators get asked about products received in exchange for work", async () => {
  const page = await openApp({ tables: { profiles: [{ id:"11111111-2222-3333-4444-555555555555", creator_settings:{ setupDone:true, business:{ ways:["influencing"], goal:"organized" } } }] } });
  await page.click("#ovNudges [data-weekly-note]");
  assert.match(await page.textContent(".ci-q"), /Did you receive any products or services in exchange for work this month\?/);
  await page.click("#ciGift");
  await page.click("#ciSkip");
  assert.match(await page.textContent(".ci"), /Log them in Gifts/);
});

test("the monthly recap shows earned, spent and left, with factual insights", async () => {
  const page = await openApp();
  await go(page, "reports");
  assert.match(await page.textContent("#view-reports h1"), /Your Monthly Money Recap/);
  const vals = await page.$$eval(".recap-trio b", els => els.map(e => e.textContent));
  assert.deepEqual(vals, ["$6,000", "$1,500", "$4,500"]);
  assert.match(await page.textContent(".recap-trio .left"), /Not necessarily cash you can spend/);
  const insights = await page.$$eval(".recap-insights li", els => els.map(e => e.textContent));
  assert.deepEqual(insights, ["Equipment and supplies was where your spending went this month.", "You earned more than last month."]);
  assert.match(await page.textContent(".recap-spend"), /Equipment and supplies\s*\$1,500\s*100%/);
  assert.match(await page.textContent("#view-reports"), /Advanced reports/);
});

test("Giggy suggests the question that fits the page, and labels estimates", async () => {
  const page = await openApp(WEEK);
  await go(page, "invoices");
  await page.click("#giggyBtn");
  assert.equal(await page.$eval(".ask-chips .preset-chip", b => b.textContent), "Who still owes me money?");
  await page.click(".ask-chips .preset-chip");
  assert.match(await page.$$eval(".ask-msg.assistant", els => els[els.length-1].textContent), /From your records/);
  await page.fill("#askInput", "How much should I set aside for taxes?");
  await page.click("#askSend");
  assert.match(await page.$$eval(".ask-msg.assistant", els => els[els.length-1].textContent), /Estimate, not a guarantee/);
});
