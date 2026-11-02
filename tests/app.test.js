// Everyday flows: reviewing transactions, adding an expense, Giggy, plans and the phone layout.
const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const { openApp, closeAll, go } = require("./helpers");

after(closeAll);

const NEW_TXNS = { tables: {
  unclassified_expenses: [{ id:"u1", date:"2026-10-28", description:"Camera", amount:200 }, { id:"u2", date:"2026-10-27", description:"Mystery shop", amount:30 }]
} };

test("Home's to-do list says how many transactions to check, and how long it takes", async () => {
  const page = await openApp(NEW_TXNS);
  const todo = await page.textContent("#ovNudges");
  assert.match(todo, /Check 2 transactions/);
  assert.match(todo, /About 1 minute/);
  assert.deepEqual(page.errors, []);
});

test("review goes one at a time, with the category already guessed", async () => {
  const page = await openApp(NEW_TXNS);
  await page.click("#ovNudges .fy-btn:has-text('Start')");
  assert.match(await page.textContent(".rv-top"), /1 of 2/);
  assert.equal(await page.textContent(".rv-name"), "Camera");
  assert.equal(await page.$eval("#rvCat", s => s.value), "Equipment"); // learned from the earlier Camera expense
  await page.click("#rvYes");
  assert.equal(await page.textContent(".rv-name"), "Mystery shop");
  await page.click("#rvNo");
  await page.waitForSelector(".rv-done");
  assert.match(await page.textContent(".rv-done"), /You sorted 2 transactions/);
  assert.doesNotMatch(await page.textContent("#ovNudges"), /Check \d+ transaction/);
});

test("adding an expense takes three answers, and Giggy picks the category", async () => {
  const page = await openApp();
  await go(page, "expenses");
  await page.click("#openAddExpense");
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
  assert.match(await page.textContent("#ovNudges"), /Check 1 transaction/);
});

test("Giggy answers everyday questions from the books, and says what it doesn't know", async () => {
  const page = await openApp({ tables: { invoices: [{ id:"inv1", invoice_number:12, client_name:"Aritzia", issue_date:"2026-09-20", due_date:"2026-10-21", status:"sent", line_items:[], subtotal:3500, total:3500 }] } });
  await page.click("#giggyBtn");
  const ask = async q => { await page.fill("#askInput", q); await page.click("#askSend"); return page.$$eval(".ask-msg.assistant", els => els[els.length-1].textContent); };
  assert.match(await ask("How much should I save for taxes?"), /\$2,550\.00 set aside.*What I don't know yet/s);
  assert.match(await ask("Which brands still owe me money?"), /Aritzia: \$3,500\.00 10 days late/);
  assert.match(await ask("Can I afford a $2,000 camera?"), /Yes, comfortably\. You'd still have \$3,450\.00/);
  assert.match(await ask("Can I afford to buy a new camera?"), /How much does it cost\?/);
  assert.equal(await page.$(".upg"), null); // everyday answers aren't behind Pro
});

test("before the billing table exists, nothing is behind a paywall", async () => {
  const page = await openApp();
  await go(page, "ask");
  await page.fill("#askInput", "Write me a pitch email");
  await page.click("#askSend");
  await page.waitForTimeout(200);
  assert.equal(await page.$(".upg"), null);
});

test("Free accounts see the upgrade sheet for Pro features", async () => {
  const page = await openApp({ missingTables: [], tables: { billing: [] } });
  await go(page, "ask");
  await page.fill("#askInput", "Write me a pitch email");
  await page.click("#askSend");
  await page.waitForSelector(".upg");
  assert.match(await page.textContent(".upg h2"), /Ask Giggy is a Pro feature/);
});

test("new accounts get Pro during the 14-day trial", async () => {
  const page = await openApp({ missingTables: [], tables: { billing: [] }, user: { created_at:"2026-10-25T00:00:00Z" } });
  await go(page, "ask");
  await page.fill("#askInput", "Write me a pitch email");
  await page.click("#askSend");
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
  await page.click('.nav-item[data-group="getpaid"]');
  const tabs = await page.$$eval("#view-invoices .section-tabs button", els => els.map(e => e.textContent.trim()));
  assert.deepEqual(tabs, ["Invoices", "Brand deals", "What to charge"]);
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
