// Creator intelligence: deal profit estimates, rate defaults, invoice heads-ups.
const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const { openApp, closeAll, go } = require("./helpers");

after(closeAll);
const ME = "11111111-2222-3333-4444-555555555555";
const rows = page => page.$$eval("#settingsModalBox .explain-math > div", els => els.map(e => [...e.children].map(c => c.textContent.replace(/\s+/g, " ").trim()).join(" ")));

test("deal profit uses only expenses you link, and says it's an estimate", async () => {
  const page = await openApp({ tables: {
    pipeline_deals: [{ id:"d1", brand_name:"Nike", deliverable:"Reel", estimated_value:2000, stage:"signed" }],
    expenses: [{ id:"x1", date:"2026-10-02", description:"Nike shoot props", category:"Equipment", payment_method:"", deductible:true, amount:150 },
      { id:"x2", date:"2026-10-05", description:"Camera", category:"Equipment", payment_method:"", deductible:true, amount:1500 }] } });
  await go(page, "pipeline");
  await page.click("[data-deal-profit='d1']");
  assert.deepEqual(await rows(page), ["Deal amount (estimated value) $2,000.00", "Recorded expenses for this deal −$0.00", "Estimated profit $2,000.00"]);
  assert.match(await page.textContent("#settingsModalBox"), /isn't your final accounting/);
  const first = await page.$eval(".deal-exp-row span", e => e.textContent);
  assert.match(first, /Nike shoot props/); // likely match listed first, but not linked
  assert.equal(await page.$eval("[data-deal-exp='x1']", c => c.checked), false);
  await page.check("[data-deal-exp='x1']");
  await page.waitForTimeout(100);
  assert.deepEqual(await rows(page), ["Deal amount (estimated value) $2,000.00", "Recorded expenses for this deal −$150.00", "Estimated profit $1,850.00"]);
  const cs = await page.evaluate(() => window.__updates.filter(u => u.table === "profiles").pop().values.creator_settings);
  assert.deepEqual(cs.dealExpenses, { d1:["x1"] });
  assert.deepEqual(page.errors, []);
});

test("the rate calculator works out an hourly rate from a yearly target, with the formula shown", async () => {
  const page = await openApp();
  await go(page, "rateCalculator");
  await page.click("#rcFromTarget");
  await page.fill("#rtTarget", "60000");
  await page.fill("#rtHours", "20");
  await page.fill("#rtWeeks", "50");
  assert.deepEqual(await rows(page), ["Billable hours a year (20 × 50) 1,000", "Hourly rate ($60,000 ÷ 1,000) $60.00"]);
  await page.click("#rtUse");
  assert.equal(await page.inputValue("#rcHourlyRate"), "60");
  assert.match(await page.textContent("#rcExplain"), /10 hours × \$60 for your time/);
});

test("saved rate defaults come back next time", async () => {
  const page = await openApp({ tables: { profiles: [{ id:ME, creator_settings:{ setupDone:true, rateDefaults:{ hourlyRate:90, expenses:40, managerFee:15, profitMargin:25 } } }] } });
  await go(page, "rateCalculator");
  assert.equal(await page.inputValue("#rcHourlyRate"), "90");
  assert.equal(await page.inputValue("#rcManagerFee"), "15");
  assert.equal(await page.inputValue("#rcProfitMargin"), "25");
});

test("a client who usually pays late gets a heads-up before the due date", async () => {
  const paid = (id, due, paidAt) => ({ id, invoice_number:Number(id.slice(1)), client_name:"Sephora", issue_date:"2026-06-01", due_date:due, status:"paid", paid_at:paidAt, line_items:[], subtotal:500, total:500 });
  const page = await openApp({ tables: { invoices: [paid("p1", "2026-07-01", "2026-07-20T12:00:00Z"), paid("p2", "2026-08-01", "2026-08-25T12:00:00Z"),
    { id:"o1", invoice_number:9, client_name:"Sephora", issue_date:"2026-10-01", due_date:"2026-11-02", status:"sent", line_items:[], subtotal:1200, total:1200 }] } });
  assert.match(await page.textContent("#ovNudges"), /Sephora's \$1,200\.00 invoice is due in 3 days\./);
  assert.match(await page.textContent("#ovNudges"), /They've paid 2 of 2 invoices late before/);
});
