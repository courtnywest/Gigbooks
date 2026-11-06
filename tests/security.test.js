// Stored text (brand names, merchants, notes, emails...) often comes from outside the
// app: scanned email, bank feeds, collaborators. None of it may ever run as code.
// Every field below holds a booby-trapped value; if any of them executes, __x records it.
const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const { openApp, closeAll, go } = require("./helpers");

after(closeAll);

const P = tag => `${tag}"'><img src=x onerror=__x('${tag}')>`;
const ME = "11111111-2222-3333-4444-555555555555";
const HOSTILE = { tables: {
  profiles: [{ id:ME, business_name:P("biz"), business_address:P("bizaddr"), logo_url:`javascript:__x('logo')`,
    creator_settings:{ setupDone:true, persona:{ type:"tiktok", streams:["brand","clients"] },
      gifts:[{ id:"g1", brand:P("giftbrand"), item:P("giftitem"), value:50, date:"2026-10-20", status:"received", terms:"unsure", counted:false }],
      goals:[{ id:"go1", name:P("goal"), target:500, saved:100 }],
      recurring:[{ id:"rc1", description:P("recurring"), amount:20, frequency:"monthly", nextDate:"2026-11-10", active:true }],
      payHandles:{ zelle:P("zelle"), bank:P("bankinfo") }, cashOnHand:5000, cashAsOf:"2026-10-30" } }],
  income: [{ id:"i1", date:"2026-10-10", source:P("source"), type:P("type"), glyph:P("glyph"), status:"received", amount:600 },
           { id:"i2", date:"2026-10-12", source:P("pending"), type:"Brand Deal", status:"pending", amount:300 }],
  expenses: [{ id:"e1", date:"2026-10-05", description:P("desc"), category:P("cat"), payment_method:P("pay"), glyph:P("eglyph"), deductible:true, amount:100 }],
  unclassified_income: [{ id:"ui1", date:"2026-10-28", source:P("uisource"), glyph:P("uiglyph"), amount:40 }],
  unclassified_expenses: [{ id:"ue1", date:"2026-10-28", description:P("uedesc"), glyph:P("ueglyph"), amount:12 }],
  income_categories: [{ id:"ic1", name:P("inccat") }, { id:"ic2", name:"Brand Deal" }],
  expense_categories: [{ id:"ec1", name:P("expcat") }, { id:"ec2", name:"Software" }],
  payment_methods: [{ id:"pm1", label:P("paymethod") }],
  connected_accounts: [{ id:"ca1", name:P("acct"), account_type:"checking" }],
  gmail_connection_status: [{ email:P("gmail") }],
  invoices: [{ id:"inv1", invoice_number:7, client_name:P("client"), client_email:"x@y.co", client_address:P("caddr"), issue_date:"2026-09-20", due_date:"2026-10-21",
    status:"sent", sent_at:"2026-09-20", line_items:[{ description:P("line"), quantity:1, rate:900 }], subtotal:900, total:900, notes:P("notes") }],
  clients: [{ id:"cl1", name:P("clientrow"), email:"c@d.co", address:P("clientaddr"), notes:P("clientnotes") }],
  email_opportunities: [{ id:"op1", date:"2026-10-27", brand_name:P("oppbrand"), amount:500, summary:P("oppsummary") }],
  tax_1099_tracking: [],
  projects: [{ id:"pr1", name:P("project"), status:"active", deal_notes:P("projnotes") }],
  pipeline_deals: [{ id:"d1", brand_name:P("deal"), deliverable:P("deliv"), estimated_value:1500, stage:"delivered", notes:P("dealnotes") }],
  rate_calculations: [{ id:"r1", project_type:P("ratetype"), estimated_hours:4, hourly_rate:80, total_rate:400 }],
  bank_connection_status: [{ id:"bc1", institution_name:P("bank"), status:"active" }],
  bank_transactions: [{ id:"bt1", date:"2026-10-29", amount:25, merchant_name:P("merchant"), description:P("btdesc"), status:"unclassified" }]
} };
const INIT = "window.__hits = []; window.__x = t => window.__hits.push(t);";
const VIEWS = ["overview","all","income","expenses","bank","invoices","pipeline","rateCalculator","reports","taxes","gifts","contracts","help","settings"];

test("no stored text runs as code, on any page or in any panel", async () => {
  const page = await openApp(HOSTILE, { width:1280, height:900 }, { init: INIT });
  page.setDefaultTimeout(1500);
  const step = async fn => { try{ await fn(); }catch(e){ /* keep going; the hits are what matter */ } await page.waitForTimeout(120); };
  const closeModals = () => page.evaluate(() => document.querySelectorAll(".modal-overlay.open").forEach(m => m.classList.remove("open")));
  for(const v of VIEWS){ await step(() => go(page, v)); }
  // Reports, every tab including the accountant ones
  await step(() => go(page, "reports"));
  await step(() => page.click("#acctToggle"));
  for(const t of ["summary","clients","projects","income","balance","cashflow"]) await step(() => page.click(`[data-report-tab="${t}"]`));
  // Bank tabs
  await step(() => go(page, "bank"));
  for(const t of ["unclassified","matched","dismissed","reconciliation"]) await step(() => page.click(`[data-tabset="bankTxn"] [data-tab="${t}"]`));
  // Row menus, edit forms and the invoice preview
  await step(() => go(page, "invoices"));
  await step(() => page.click('[data-row-menu="inv-inv1"]'));
  await step(() => page.click('[data-edit-invoice="inv1"]'));
  await step(() => page.click("#finEditAnyway"));
  await closeModals();
  await step(() => go(page, "income"));
  await step(() => page.click('[data-edit-income="i1"]'));
  await closeModals();
  await step(() => go(page, "expenses"));
  await step(() => page.click('[data-edit-expense="e1"]'));
  await closeModals();
  // Home flows
  await step(() => go(page, "overview"));
  await step(() => page.click("#ovNudges .fy-btn:has-text('Review transactions')"));
  for(let i = 0; i < 4; i++) await step(() => page.click("#rvLater"));
  await closeModals();
  await step(() => page.click("[data-weekly-note]"));
  await step(() => page.click("#ciInvoices"));
  await closeModals();
  await step(() => page.click("[data-explain-safe]"));
  await closeModals();
  // Giggy
  await step(() => page.click("#giggyBtn"));
  for(const q of ["Who still owes me money?","Where did most of my money go?","How much did I make this month?","How much should I set aside for taxes?"]){
    await step(async () => { await page.fill("#askInput", q); await page.click("#askSend"); });
  }
  await step(() => page.click("[data-giggy-close]"));
  // Settings panels that list stored things
  await step(() => go(page, "settings"));
  for(const s of ["business","paymentMethods","connectedAccounts","emailSettings","personalization","getPaid","mediaKit","plan","invoiceBranding"]){
    await step(() => page.evaluate(k => { const b = document.querySelector(`[data-setting="${k}"]`); if(b) b.click(); }, s));
    await closeModals();
  }
  // Gifts and deals
  await step(() => go(page, "gifts"));
  await step(() => page.click('[data-gift-edit="g1"]'));
  await closeModals();
  await step(() => page.click("[data-wrapped]"));
  await closeModals();
  const hits = await page.evaluate(() => window.__hits);
  assert.deepEqual([...new Set(hits)].sort(), [], `stored text ran as code: ${[...new Set(hits)].join(", ")}`);
});

const reports = page => page.evaluate(() => (window.__inserts || []).filter(i => i.table === "app_errors").map(i => i.row));

test("errors are reported without emails, amounts or other details", async () => {
  const page = await openApp();
  await page.addScriptTag({ content:'throw new Error("Failed for jane@example.com on $12,500.00 payout")' });
  await page.waitForTimeout(200);
  const [r] = await reports(page);
  assert.equal(r.kind, "error");
  assert.equal(r.message, "Failed for [email] on $[n] payout");
  assert.equal(r.view, "overview");
  assert.doesNotMatch(JSON.stringify(r), /jane|12,500|example\.com/);
});

test("a failed save is reported with only the table and error code", async () => {
  const page = await openApp({ failInserts: ["expenses"] });
  await go(page, "expenses");
  await page.click("#openAddExpense");
  await page.fill("#expenseForm [name=description]", "Ring light for Glossier shoot");
  await page.fill("#expenseForm [name=amount]", "89.99");
  await page.click("#expenseSubmitBtn");
  await page.waitForTimeout(250);
  const r = (await reports(page)).find(x => x.kind === "save_failed");
  assert.ok(r, "save failure reported");
  assert.equal(r.message, "insert expenses: 42501 permission denied for table expenses");
  assert.doesNotMatch(JSON.stringify(await reports(page)), /Ring light|Glossier|89\.99/);
});

test("the same error is only reported once, and nothing is sent if the table doesn't exist", async () => {
  const page = await openApp();
  for(let i = 0; i < 3; i++) await page.addScriptTag({ content:'throw new Error("Same thing")' });
  await page.waitForTimeout(200);
  assert.equal((await reports(page)).length, 1);

  const off = await openApp({ missingTables: ["billing", "app_errors"] });
  await off.addScriptTag({ content:'throw new Error("First")' });
  await off.waitForTimeout(150);
  await off.addScriptTag({ content:'throw new Error("Second")' });
  await off.waitForTimeout(150);
  assert.equal((await reports(off)).length, 1); // tried once, saw the table was missing, stopped
});

test("names with & and apostrophes show up normally, not as &amp; or &#39;", async () => {
  const page = await openApp({ tables: {
    income: [{ id:"i1", date:"2026-10-10", source:"H&M", type:"Brand Deal", status:"received", amount:600 }],
    expenses: [{ id:"e1", date:"2026-10-05", description:"Ben & Jerry's", category:"Food & Drink", deductible:true, amount:20 }],
    expense_categories: [{ id:"ec1", name:"Food & Drink" }],
    invoices: [{ id:"inv1", invoice_number:7, client_name:"Ben & Jerry's", issue_date:"2026-09-20", due_date:"2026-10-21", status:"sent", line_items:[], subtotal:900, total:900 }],
    unclassified_expenses: [{ id:"ue1", date:"2026-10-28", description:"Trader Joe's", amount:12 }]
  } });
  page.setDefaultTimeout(3000);
  const seen = [];
  for(const v of ["overview","all","income","expenses","invoices","reports"]){
    await go(page, v);
    seen.push(await page.evaluate(() => document.querySelector(".view.active").innerText));
  }
  await go(page, "overview");
  await page.click("#ovNudges .fy-btn:has-text('Review transactions')");
  seen.push(await page.textContent(".rv"));
  await page.evaluate(() => document.querySelectorAll(".modal-overlay.open").forEach(m => m.classList.remove("open")));
  await page.click("#giggyBtn");
  await page.fill("#askInput", "Who still owes me money?"); await page.click("#askSend");
  seen.push(await page.$$eval(".ask-msg.assistant", els => els[els.length-1].innerText));
  const all = seen.join("\n");
  assert.doesNotMatch(all, /&amp;|&#39;|&quot;|&lt;/);
  assert.match(all, /H&M/); assert.match(all, /Ben & Jerry's/); assert.match(all, /Trader Joe's/);
});
