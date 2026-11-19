// "Owed to you": every dollar still on its way, in one place. Plus sample data.
const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const { openApp, closeAll, go } = require("./helpers");

after(closeAll);
const ME = "11111111-2222-3333-4444-555555555555";
const OWED = { tables: {
  invoices: [
    { id:"v1", invoice_number:7, client_name:"Northpeak", issue_date:"2026-09-15", due_date:"2026-10-15", status:"sent", line_items:[], subtotal:2500, total:2500 },
    { id:"v2", invoice_number:8, client_name:"Studio Maple", issue_date:"2026-10-20", due_date:"2026-11-19", status:"sent", line_items:[], subtotal:1200, total:1200 }],
  income: [
    { id:"i1", date:"2026-10-10", source:"Glossier", type:"Brand Deal", status:"received", amount:6000 },
    { id:"i9", date:"2026-10-25", source:"Bright Bean", type:"Brand Deal", status:"pending", amount:900 }],
  pipeline_deals: [{ id:"d1", brand_name:"Halo Audio", deliverable:"2 TikToks", estimated_value:3000, stage:"delivered" }, { id:"d2", brand_name:"Lead Co", estimated_value:5000, stage:"lead" }],
  unclassified_income: [{ id:"u1", date:"2026-10-28", source:"PayPal: payment from Studio Maple", glyph:"📧", amount:600 }],
  email_opportunities: [{ id:"o1", date:"2026-10-29", brand_name:"Bright Bean", amount:1500, summary:"Asked about a 3-post package.", status:"new" }],
  profiles: [{ id:ME, creator_settings:{ setupDone:true, reimbursements:{ e1:{ from:"Lumen", status:"owed", followUps:[], expectBy:"2026-10-20" } } } }]
} };
const sums = page => page.$$eval(".owed-sum .card", els => els.map(e => [e.querySelector("span").textContent, e.querySelector("b").textContent]));

test("Get Paid opens on everything owed, with totals that add up", async () => {
  const page = await openApp(OWED);
  await page.click('.nav-item[data-group="getpaid"]');
  await page.waitForTimeout(150);
  assert.match(await page.textContent("#view-owed h1"), /Owed to you/);
  // 2,500 + 1,200 invoices + 900 pending + 1,500 reimbursement (Camera, e1)
  assert.deepEqual(await sums(page), [["Owed to you", "$6,100.00"], ["Late", "$4,000.00"], ["Coming up", "$3,000.00"]]);
  const text = await page.textContent("#owedWrap");
  assert.match(text, /Invoices waiting for payment.*Northpeak.*16 days late.*Studio Maple.*due Nov 19/s);
  assert.match(text, /Payments you're expecting.*Bright Bean.*\$900\.00/s);
  assert.match(text, /Money you're due back.*Lumen.*past the expected date/s);
  assert.match(text, /Deals to invoice.*Halo Audio.*2 TikToks/s);
  assert.doesNotMatch(text, /Lead Co/); // not agreed yet
  assert.match(text, /Spotted in your email.*PayPal: payment from Studio Maple.*\$600\.00.*Possible deals from your inbox.*Bright Bean.*~\$1,500\.00/s);
  assert.deepEqual(page.errors, []);
});

test("actions work from the page: it arrived, approve an email payment", async () => {
  const page = await openApp(OWED);
  await go(page, "owed");
  await page.click("[data-owed-arrived='i9']");
  await page.waitForTimeout(150);
  assert.deepEqual((await page.evaluate(() => window.__updates.filter(u => u.table === "income").pop().values)).status, "received");
  assert.doesNotMatch(await page.textContent("#owedWrap"), /Payments you're expecting/);
  await page.click("#owedWrap [data-attn-approve='u1']");
  await page.waitForTimeout(150);
  const ins = await page.evaluate(() => window.__inserts.filter(i => i.table === "income").map(i => [i.row.source, i.row.amount]));
  assert.deepEqual(ins, [["PayPal: payment from Studio Maple", 600]]);
  assert.match(await page.textContent("#owedWrap"), /Connect your email and Giggy will spot payments/); // the list is empty now, and email isn't connected here
});

test("an empty account gets a helpful empty state", async () => {
  const page = await openApp({ tables: { income: [], expenses: [], profiles: [{ id:ME, creator_settings:{ setupDone:true } }] } });
  await go(page, "owed");
  assert.match(await page.textContent("#owedWrap"), /Nobody owes you anything right now/);
  assert.match(await page.textContent("#owedWrap"), /Connect your email and Giggy will spot payments/);
});

test("sample data is added to this account and tracked so it can be removed exactly", async () => {
  const page = await openApp({ rpc: { next_invoice_number: 41 } });
  await page.evaluate(() => { window.__gbReload = () => { window.__reloaded = true; }; });
  await go(page, "settings");
  await page.click("[data-settings-tab='data']");
  await page.click("[data-setting='sampleData']");
  await page.click("#sampleAdd");
  await page.waitForFunction(() => window.__reloaded, null, { timeout:10000 });
  const ins = await page.evaluate(() => window.__inserts.map(i => i.table));
  for(const t of ["clients", "income", "expenses", "invoices", "pipeline_deals", "unclassified_income", "email_opportunities"]) assert.ok(ins.includes(t), t);
  const cs = await page.evaluate(() => window.__updates.filter(u => u.table === "profiles").pop().values.creator_settings);
  assert.equal(cs.sampleData.ids.income.length, 6);
  assert.equal(cs.sampleData.ids.invoices.length, 4);
  assert.equal(Object.values(cs.reimbursements).filter(r => r.status === "owed").length, 2);
  assert.equal(cs.incomeGoal, 6000);
});

test("removing sample data deletes only the sample rows, then the banner goes", async () => {
  const sample = { at:"2026-10-29", ids:{ income:["s1","s2"], expenses:["x1"], invoices:["n1"] }, reimbIds:["x1"], goalSet:true };
  const page = await openApp({ tables: { profiles: [{ id:ME, creator_settings:{ setupDone:true, incomeGoal:6000, sampleData:sample, reimbursements:{ x1:{ from:"Northpeak", status:"paid", incomeId:"s9" } } } }] } });
  assert.match(await page.textContent("#sampleBanner"), /Sample data is showing/);
  await page.evaluate(() => { window.__gbReload = () => { window.__reloaded = true; }; });
  await page.click("#sampleBanner [data-sample-remove]");
  await page.waitForFunction(() => window.__reloaded, null, { timeout:10000 });
  const dels = await page.evaluate(() => window.__deletes.map(d => [d.table, d.filters.find(f => f[0] === "id")[1]]));
  assert.deepEqual(dels, [["income", ["s1","s2","s9"]], ["expenses", ["x1"]], ["invoices", ["n1"]]]);
  const cs = await page.evaluate(() => window.__updates.filter(u => u.table === "profiles").pop().values.creator_settings);
  assert.equal(cs.sampleData, undefined);
  assert.equal(cs.incomeGoal, undefined);
  assert.equal(cs.reimbursements.x1, undefined);
});
