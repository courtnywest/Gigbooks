// Your Money Moves: up to three actions built only from the user's own records.
const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const { openApp, closeAll, go } = require("./helpers");

after(closeAll);
const ME = "11111111-2222-3333-4444-555555555555";
const overdue = (id, client, total, due) => ({ id, invoice_number:Number(id.replace(/\D/g, "")) || 1, client_name:client, issue_date:"2026-09-01", due_date:due, status:"sent", line_items:[], subtotal:total, total });
const moveTitles = page => page.$$eval("#ovNudges .fy-row .fy-text", els => els.map(e => e.textContent));

test("an overdue invoice becomes a move with its real amount, and leads to the reminder", async () => {
  const page = await openApp({ tables: { invoices: [overdue("v1", "Aritzia", 750, "2026-10-20")] } });
  const titles = await moveTitles(page);
  assert.ok(titles.includes("You have a $750.00 invoice that's overdue. Want to follow up?"), titles.join(" | "));
  assert.match(await page.textContent("#ovNudges"), /Aritzia was due 11 days ago/);
  await page.click("#ovNudges .fy-btn:has-text('View invoice')");
  await page.waitForTimeout(150);
  assert.match(await page.textContent("#settingsModalBox, .modal-overlay.open"), /Aritzia/);
  assert.deepEqual(page.errors, []);
});

test("never more than three moves, most urgent first", async () => {
  const page = await openApp({ tables: {
    invoices: [overdue("v1", "Aritzia", 750, "2026-10-20"), overdue("v2", "Sephora", 3000, "2026-10-01")],
    unclassified_expenses: [{ id:"u1", date:"2026-10-28", description:"Camera", amount:200 }],
    bank_connection_status: [{ id:"c1", institution_name:"Chase", status:"login_required" }]
  } });
  const titles = await moveTitles(page);
  assert.ok(titles.length <= 3);
  assert.match(titles[0], /Reconnect Chase/);
  assert.match(titles[1], /\$3,000\.00 invoice that's overdue/); // the bigger one
  assert.match(await page.textContent("#ovNudges"), /1 more invoice is overdue too/);
});

test("dismissed moves stay dismissed; essential ones can't be dismissed", async () => {
  const page = await openApp({ tables: { invoices: [overdue("v1", "Aritzia", 750, "2026-10-20")],
    unclassified_expenses: [{ id:"u1", date:"2026-10-28", description:"Camera", amount:200 }] } });
  const reviewRow = await page.$("#ovNudges .fy-row[data-move='review']");
  assert.equal(await reviewRow.$("[data-move-dismiss]"), null);
  await page.click("#ovNudges [data-move-dismiss^='late-v1']");
  assert.doesNotMatch(await page.textContent("#ovNudges"), /\$750\.00 invoice/);
  const saved = await page.evaluate(() => window.__updates.filter(u => u.table === "profiles").pop().values.creator_settings.movesDismissed);
  assert.ok(Object.keys(saved).some(k => k.startsWith("late-v1")));
  await go(page, "invoices"); await go(page, "overview");
  assert.doesNotMatch(await page.textContent("#ovNudges"), /\$750\.00 invoice/);
});

test("a spending jump is only flagged with three earlier months to compare", async () => {
  const months = ["2026-07-08", "2026-08-08", "2026-09-08"];
  const history = months.map((d, i) => ({ id:"s" + i, date:d, description:"Adobe", category:"Software", payment_method:"", deductible:true, amount:60 }));
  const thisMonth = { id:"s9", date:"2026-10-08", description:"New plugins", category:"Software", payment_method:"", deductible:true, amount:240 };
  let page = await openApp({ tables: { expenses: history.concat(thisMonth) } });
  assert.match(await page.textContent("#ovNudges"), /Your software expenses are higher than usual this month\./);
  assert.match(await page.textContent("#ovNudges"), /\$240\.00 so far this month, compared with about \$60\.00 a month over the last three months/);

  page = await openApp({ tables: { expenses: history.slice(1).concat(thisMonth) } }); // only two earlier months
  assert.doesNotMatch(await page.textContent("#ovNudges"), /higher than usual/);
});

test("the money goal changes what comes first", async () => {
  const tables = { invoices: [overdue("v1", "Aritzia", 750, "2026-10-20")],
    unclassified_expenses: [{ id:"u1", date:"2026-10-28", description:"Camera", amount:200 }] };
  let page = await openApp({ tables: Object.assign({ profiles: [{ id:ME, creator_settings:{ setupDone:true, business:{ ways:["freelance"], goal:"paid" } } }] }, tables) });
  assert.match((await moveTitles(page))[0], /invoice that's overdue/);
  page = await openApp({ tables: Object.assign({ profiles: [{ id:ME, creator_settings:{ setupDone:true, business:{ ways:["freelance"], goal:"organized" } } }] }, tables) });
  assert.match((await moveTitles(page))[0], /transaction needs your attention/);
});

test("an empty account gets a useful empty state, not made-up advice", async () => {
  const page = await openApp({ tables: { income: [], expenses: [], profiles: [{ id:ME, creator_settings:{ setupDone:true, checklistDismissed:true, business:{ ways:["content"], goal:"grow" } } }] } });
  assert.match(await page.textContent("#ovNudges"), /Your Money Moves show up here/);
  assert.equal(await page.$$eval("#ovNudges .fy-btn", b => b.length), 1);
});

test("Settings lets you change how you make money and your goal", async () => {
  const page = await openApp();
  await go(page, "settings");
  await page.click("[data-settings-tab='preferences']");
  await page.click("[data-setting='personalization']");
  await page.click("#pzBiz");
  await page.click("[data-way='selling']");
  await page.click("[data-goal='taxes']");
  await page.click("#bizSave");
  const cs = await page.evaluate(() => window.__updates.filter(u => u.table === "profiles").pop().values.creator_settings);
  assert.ok(cs.business.ways.includes("selling"));
  assert.equal(cs.business.goal, "taxes");
  assert.deepEqual(page.errors, []);
});
