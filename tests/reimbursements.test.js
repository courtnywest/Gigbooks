// Reimbursable expenses: mark them, see what's still owed, get reminded to follow up.
const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const { openApp, closeAll, go } = require("./helpers");

after(closeAll);
const ME = "11111111-2222-3333-4444-555555555555";
const lastSettings = page => page.evaluate(() => { const u = (window.__updates || []).filter(u => u.table === "profiles").pop(); return u ? u.values.creator_settings : {}; });
const withSettings = (cs, tables = {}) => ({ tables: Object.assign({ profiles: [{ id:ME, creator_settings: Object.assign({ setupDone:true }, cs) }] }, tables) });
// Today is Oct 30, 2026. Base fixture: e1 Camera $1,500 (Oct 5, deductible), e2 Lunch $500 (Sep 20, not deductible).
const OWED = { reimbursements: { e1: { from:"Glossier", status:"owed", markedAt:"2026-10-05", followUps:[] } } };

test("an expense can be marked as something someone will pay back", async () => {
  const page = await openApp();
  await go(page, "expenses");
  await page.click("#openAddExpense");
  await page.fill("#expenseForm [name=description]", "Props for Glossier shoot");
  await page.fill("#expenseForm [name=amount]", "240");
  assert.equal(await page.isVisible("#expReimbMore"), false);
  await page.check("#expReimb");
  await page.click("#expenseSubmitBtn"); // no name yet
  await page.waitForTimeout(150);
  assert.equal(await page.$eval("#expenseModal", m => m.classList.contains("open")), true, "stays open until we know who pays");
  await page.fill("#expenseForm [name=reimbFrom]", "Glossier");
  await page.fill("#expenseForm [name=reimbBy]", "2026-11-15");
  await page.click("#expenseSubmitBtn");
  await page.waitForSelector("#view-expenses tbody tr:has-text('Props for Glossier shoot')");
  assert.match(await page.textContent("#view-expenses tbody tr:has-text('Props for Glossier shoot')"), /Owed by Glossier/);
  assert.match(await page.textContent("#reimbStrip"), /\$240\.00 waiting to be paid back.*From Glossier/s);
  const cs = await lastSettings(page);
  const rec = Object.values(cs.reimbursements)[0];
  assert.deepEqual([rec.from, rec.status, rec.expectBy], ["Glossier", "owed", "2026-11-15"]);
  const exp = await page.evaluate(() => window.__inserts.filter(i => i.table === "expenses").pop().row);
  assert.equal(exp.amount, 240); // the expense itself is saved as usual
  assert.deepEqual(page.errors, []);
});

test("the report lists what's owed by whom, and marking it paid back records the repayment", async () => {
  const page = await openApp(withSettings(OWED));
  await go(page, "expenses");
  await page.click("#reimbStrip [data-reimb-report]");
  assert.match(await page.textContent(".reimb-total"), /\$1,500\.00\s*1 expense from 1 person or brand/);
  assert.match(await page.textContent(".reimb-group"), /Glossier.*\$1,500\.00 · oldest 25 days · not followed up yet.*Camera/s);
  await page.click("[data-rr-paid='e1']");
  assert.equal(await page.isChecked("#rpRecord"), true); // a write-off, so the repayment counts as money in
  await page.click("#rpSave");
  await page.waitForSelector(".reimb-report");
  assert.match(await page.textContent(".reimb-report"), /Nothing outstanding/);
  assert.match(await page.textContent(".reimb-report"), /Paid back in the last 90 days \(1\)/);
  const inc = await page.evaluate(() => window.__inserts.filter(i => i.table === "income").map(i => [i.row.source, i.row.amount, i.row.status]));
  assert.deepEqual(inc, [["Glossier (reimbursement)", 1500, "received"]]);
  const cs = await lastSettings(page);
  assert.equal(cs.reimbursements.e1.status, "paid");
  assert.ok(cs.reimbursements.e1.incomeId);
});

test("a non-deductible expense paid back isn't counted as income by default", async () => {
  const page = await openApp(withSettings({ reimbursements: { e2: { from:"Mom", status:"owed", followUps:[] } } }));
  await page.evaluate(() => document.body.insertAdjacentHTML("beforeend", '<button id="t" data-reimb-paid="e2"></button>'));
  await page.click("#t");
  assert.equal(await page.isChecked("#rpRecord"), false);
  await page.click("#rpSave");
  await page.waitForTimeout(150);
  assert.equal(await page.evaluate(() => (window.__inserts || []).filter(i => i.table === "income").length), 0);
});

test("Money Moves reminds you to follow up, and backs off after you do", async () => {
  const page = await openApp(withSettings(OWED));
  assert.match(await page.textContent("#ovNudges"), /Glossier owes you \$1,500\.00 for an expense you covered\./);
  assert.match(await page.textContent("#ovNudges"), /The oldest is 25 days old/);
  await page.click("#ovNudges [data-reimb-follow]");
  assert.match(await page.inputValue("#rfMsg"), /Camera \(Oct 5, 2026\): \$1,500\.00[\s\S]*Total: \$1,500\.00/);
  await page.click("#rfDone");
  await page.waitForTimeout(150);
  assert.doesNotMatch(await page.textContent("#ovNudges"), /Glossier owes you/); // quiet for a week after following up
  const cs = await lastSettings(page);
  assert.deepEqual(cs.reimbursements.e1.followUps, ["2026-10-30"]);
});

test("no reminder before the wait is up, unless the expected date has passed", async () => {
  const fresh = { reimbursements: { e9: { from:"Nike", status:"owed", followUps:[] } } };
  const tables = { expenses: [{ id:"e9", date:"2026-10-25", description:"Travel", category:"Other", payment_method:"", deductible:true, amount:300 }] };
  let page = await openApp(withSettings(fresh, tables));
  assert.doesNotMatch(await page.textContent("#ovNudges"), /Nike owes you/); // 5 days old
  fresh.reimbursements.e9.expectBy = "2026-10-28";
  page = await openApp(withSettings(fresh, tables));
  assert.match(await page.textContent("#ovNudges"), /Nike owes you \$300\.00.*It was expected 2 days ago/s);
});

test("reminders can be turned off or delayed in Notifications", async () => {
  const page = await openApp(withSettings(OWED));
  await go(page, "settings");
  await page.click("[data-setting='notifications']");
  await page.selectOption("#notifReimbDays", "30");
  await page.click("[data-close-settings]");
  await go(page, "overview");
  assert.doesNotMatch(await page.textContent("#ovNudges"), /Glossier owes you/); // 25 days < 30
  const cs = await lastSettings(page);
  assert.equal(cs.reimbReminders.days, 30);
});

test("the monthly check-in asks whether you've been paid back, and the summary shows what's still owed", async () => {
  const page = await openApp(withSettings(OWED));
  await page.click("#ovNudges [data-weekly-note]");
  assert.match(await page.textContent(".ci-q"), /Did Glossier pay you back yet\?/);
  await page.click("#ciSkip");
  await page.click("#ciSkip"); // goal
  const rows = await page.$$eval(".ci .explain-math > div", els => els.map(e => [...e.children].map(c => c.textContent.trim()).join(" ")));
  assert.ok(rows.includes("Waiting to be paid back $1,500.00"), rows.join(" | "));
});

test("Giggy includes reimbursements when you ask who owes you", async () => {
  const page = await openApp(withSettings(OWED));
  await page.click("#giggyBtn");
  await page.fill("#askInput", "Who still owes me money?");
  await page.click("#askSend");
  const last = await page.$$eval(".ask-msg.assistant", els => els[els.length-1].textContent);
  assert.match(last, /Glossier: \$1,500\.00/);
});
