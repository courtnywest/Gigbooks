// Phase 3: the weekly check-in, the monthly recap, and Giggy in context.
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

test("the weekly check-in greets you with what's waiting, then walks through it", async () => {
  const page = await openApp(WEEK);
  assert.match(await page.textContent("#ovNudges"), /Your weekly money check-in/);
  await page.click("#ovNudges [data-weekly-note]");
  await page.waitForSelector(".ci");
  assert.match(await page.textContent(".ci h2"), /Your Weekly Money Check-In/);
  assert.equal((await page.textContent(".ci-hello")).trim(), "Hey! You have 1 transaction to check and one invoice waiting for payment. Let's knock that out.");
  const [mIn, mOut] = await page.$$eval(".ci-pair b", els => els.map(e => e.textContent));
  assert.equal(mIn, "$800");   // only the Oct 28 payment is in the last 7 days
  assert.equal(mOut, "$0");
  await page.click("#ciReview");
  await page.click("#rvYes");
  await page.click("#rvBack");
  await page.waitForSelector(".ci");
  assert.match(await page.textContent(".ci-steps"), /All sorted/);
  await page.click("#ciInvoices");
  assert.match(await page.textContent(".ci-list"), /Aritzia.*10 days late/s);
  await page.click("#ciBack");
  await page.click("#ciFinish");
  await page.waitForTimeout(150);
  assert.doesNotMatch(await page.textContent("#ovNudges"), /weekly money check-in/);
  const evs = await page.evaluate(() => (window.__inserts || []).filter(i => i.table === "product_events").map(i => i.row.event));
  assert.ok(evs.includes("weekly_checkin_completed"));
  assert.deepEqual(page.errors, []);
});

test("a quiet week says so, without guilt", async () => {
  const page = await openApp();
  await page.click("#ovNudges [data-weekly-note]");
  assert.equal((await page.textContent(".ci-hello")).trim(), "Hey! Nothing needs you this week. Here's your quick summary.");
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
