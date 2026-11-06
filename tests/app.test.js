// Everyday flows: reviewing transactions, adding an expense, Giggy, plans and the phone layout.
const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const { openApp, closeAll, go } = require("./helpers");

after(closeAll);

const NEW_TXNS = { tables: {
  unclassified_expenses: [{ id:"u1", date:"2026-10-28", description:"Camera", amount:200 }, { id:"u2", date:"2026-10-27", description:"Mystery shop", amount:30 }]
} };
const lastAnswer = page => page.$$eval(".ask-msg.assistant", els => els[els.length-1].textContent);

test("Home lists what to check, with how long it takes", async () => {
  const page = await openApp(NEW_TXNS);
  const todo = await page.textContent("#ovNudges");
  assert.match(todo, /Your Money Moves/);
  assert.match(todo, /Just 2 transactions need your attention/);
  assert.match(todo, /About 1 minute/);
  assert.deepEqual(page.errors, []);
});

test("review goes one card at a time, with Giggy's guess, and Yes / No / I'm not sure", async () => {
  const page = await openApp(NEW_TXNS);
  await page.click("#ovNudges .fy-btn:has-text('Review transactions')");
  assert.match(await page.textContent(".rv-top"), /1 of 2/);
  assert.match(await page.textContent(".rv-name"), /Camera/);
  assert.match(await page.textContent(".rv-hint"), /Suggested.*Giggy thinks this is an equipment expense/); // learned from history
  assert.match(await page.textContent(".rv-q"), /Was this purchase for your business\?/);
  await page.click("#rvYes");
  assert.match(await page.textContent(".rv-name"), /Mystery shop/);
  await page.click("#rvLater");
  await page.waitForSelector(".rv-done");
  assert.match(await page.textContent(".rv-done"), /You sorted 1 transaction\. 1 saved for later\./);
  await page.click(".rv-done [data-close-settings]");
  assert.match(await page.textContent("#ovNudges"), /Take another look at 1 you weren't sure about/);
});

test("bank money-in asks about work, offers non-income choices, and flags likely duplicates", async () => {
  const page = await openApp({ tables: { bank_transactions: [{ id:"b1", date:"2026-10-11", amount:-6000, merchant_name:"GLOSSIER", status:"unclassified" }] } });
  await page.click("#ovNudges .fy-btn:has-text('Review transactions')");
  assert.match(await page.textContent(".rv-kind"), /Money in · from your bank/);
  assert.match(await page.textContent(".rv-q"), /Was this payment for work you did\?/);
  assert.match(await page.textContent(".rv"), /might be the same payment as Glossier on Oct 10, 2026/); // already logged on Oct 10
  await page.click("#rvNo");
  const choices = await page.$$eval("[data-rv-other]", els => els.map(e => e.textContent.trim()));
  assert.deepEqual(choices, ["A refund", "A transfer between my accounts", "A reimbursement", "Personal (a gift, family)"]);
  await page.click("#rvSame").catch(() => {});
});

test("adding an expense takes three answers, with the date defaulting to today", async () => {
  const page = await openApp();
  await go(page, "expenses");
  await page.click("#openAddExpense");
  assert.equal(await page.textContent("#expDateLabel"), "Today");
  await page.fill("#expenseForm [name=description]", "Adobe Creative Cloud");
  await page.fill("#expenseForm [name=amount]", "59.99");
  assert.match(await page.textContent("#expGuess"), /Category: Software/);
  await page.click("#expenseSubmitBtn");
  await page.waitForTimeout(200);
  assert.match(await page.textContent("#view-expenses tbody"), /Adobe Creative Cloud/);
});

test("'No, personal' keeps it out of the books; 'I'm not sure' saves it and asks later", async () => {
  const page = await openApp();
  await go(page, "expenses");
  await page.click("#openAddExpense");
  await page.fill("#expenseForm [name=description]", "Groceries");
  await page.fill("#expenseForm [name=amount]", "80");
  await page.click("[data-biz='no']");
  await page.click("#expenseSubmitBtn");
  await page.waitForTimeout(200);
  assert.doesNotMatch(await page.textContent("#view-expenses tbody"), /Groceries/);

  await page.click("#openAddExpense");
  await page.fill("#expenseForm [name=description]", "Ring light");
  await page.fill("#expenseForm [name=amount]", "45");
  await page.click("[data-biz='unsure']");
  await page.click("#expenseSubmitBtn");
  await page.waitForTimeout(200);
  assert.match(await page.textContent("#view-expenses tbody"), /Ring light/);
  await go(page, "overview");
  assert.match(await page.textContent("#ovNudges"), /Just 1 transaction needs your attention/);
});

test("Giggy answers everyday questions from the books, and says what it doesn't know", async () => {
  const page = await openApp({ tables: { invoices: [{ id:"inv1", invoice_number:12, client_name:"Aritzia", issue_date:"2026-09-20", due_date:"2026-10-21", status:"sent", line_items:[], subtotal:3500, total:3500 }] } });
  await page.click("#giggyBtn");
  const chips = await page.$$eval(".ask-chips .preset-chip", els => els.map(e => e.textContent));
  assert.deepEqual(chips, ["How much did I make this month?", "Who still owes me money?", "Where did most of my money go?", "How much should I set aside for taxes?", "What should I charge for this project?"]);
  const ask = async q => { await page.fill("#askInput", q); await page.click("#askSend"); return lastAnswer(page); };
  assert.match(await ask("How much should I set aside for taxes?"), /\$2,550\.00 set aside.*What I don't know yet/s);
  assert.match(await ask("Who still owes me money?"), /Aritzia: \$3,500\.00 10 days late/);
  assert.match(await ask("Where did most of my money go?"), /Equipment: \$1,500\.00 \(100%\)/);
  assert.match(await ask("What should I charge for this project?"), /rate calculator/);
  assert.equal(await page.$(".upg"), null); // everyday answers aren't behind Pro
});

const askAi = async page => { await page.click("#giggyBtn"); await page.fill("#askInput", "Write me a pitch email"); await page.click("#askSend"); };

test("before the billing table exists, nothing is behind a paywall", async () => {
  const page = await openApp();
  await askAi(page);
  await page.waitForTimeout(200);
  assert.equal(await page.$(".upg"), null);
});

test("Free accounts see the upgrade sheet for Pro features", async () => {
  const page = await openApp({ missingTables: [], tables: { billing: [] } });
  await askAi(page);
  await page.waitForSelector(".upg");
  assert.match(await page.textContent(".upg h2"), /Ask Giggy is a Pro feature/);
});

test("new accounts get Pro during the 14-day trial", async () => {
  const page = await openApp({ missingTables: [], tables: { billing: [] }, user: { created_at:"2026-10-25T00:00:00Z" } });
  await askAi(page);
  await page.waitForTimeout(200);
  assert.equal(await page.$(".upg"), null);
});

test("founding members keep Pro until their date", async () => {
  const page = await openApp({ missingTables: [], tables: { billing: [{ user_id:"x", plan:"free", pro_until:"2028-01-01T00:00:00Z" }] } });
  await go(page, "settings");
  await page.click('[data-setting="plan"]');
  assert.match(await page.textContent("#settingsModalBox .settings-note"), /Founding member: Pro is free for you until/);
});

test("five destinations, each with its own tabs", async () => {
  const page = await openApp();
  const groups = await page.$$eval("#mainNav .nav-item", els => els.map(e => e.textContent.trim()));
  assert.deepEqual(groups, ["Home", "Money", "Get Paid", "Reports", "More"]);
  const tabsOf = async g => { await page.click(`.nav-item[data-group="${g}"]`); return page.$$eval(".view.active .section-tabs button", els => els.map(e => e.textContent.trim())); };
  assert.deepEqual(await tabsOf("money"), ["All", "Money in", "Money out", "Accounts"]);
  assert.deepEqual(await tabsOf("getpaid"), ["Invoices", "Brand deals", "What to charge"]);
  assert.deepEqual(await tabsOf("reports"), ["Monthly recap", "Taxes"]);
  assert.deepEqual(await tabsOf("more"), ["Gifts & freebies", "Contract reader", "Help", "Settings"]);
});

test("Money → All lists everything in one place", async () => {
  const page = await openApp();
  await page.click('.nav-item[data-group="money"]');
  const names = await page.$$eval("#allList .ar-name", els => els.map(e => e.textContent));
  assert.deepEqual(names, ["Glossier", "Camera", "Lunch", "Nike"]);
});

test("on phones, no page scrolls sideways", async () => {
  const page = await openApp({}, { width:375, height:800 });
  const views = await page.$$eval(".view", vs => vs.map(v => v.id.replace("view-", "")));
  for(const v of views){
    const wide = await page.evaluate(v => {
      document.querySelectorAll(".view").forEach(x => x.classList.toggle("active", x.id === "view-" + v));
      return document.documentElement.scrollWidth;
    }, v);
    assert.ok(wide <= 375, `${v} is ${wide}px wide`);
  }
});
