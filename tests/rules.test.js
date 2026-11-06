// Category rules: saved only when asked, specific to the merchant, editable.
const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const { openApp, closeAll, go } = require("./helpers");

after(closeAll);
const ME = "11111111-2222-3333-4444-555555555555";
const lastSettings = page => page.evaluate(() => { const u = (window.__updates || []).filter(u => u.table === "profiles").pop(); return u ? u.values.creator_settings : {}; });

test("matching is by merchant name, so unrelated merchants aren't caught", async () => {
  const page = await openApp();
  const r = await page.evaluate(() => {
    const t = window.__gbTest;
    return [t.merchantKey("ADOBE *CREATIVE CLD 800-833"), t.merchantKey("Venmo from Jane Doe"), t.ruleMatches("adobe", "Adobe Stock"),
      t.ruleMatches("adobe", "ADOBE *CREATIVE CLD"), t.ruleMatches("adobe", "Adoberry Farms"), t.ruleMatches("adobe", "Photo Adobe"), t.ruleMatches("adobe stock", "Adobe Creative")];
  });
  assert.deepEqual(r, ["adobe creative", "jane doe", true, true, false, false, false]);
});

test("reviewing never saves a rule unless you tick 'Remember'", async () => {
  const page = await openApp({ tables: { unclassified_expenses: [{ id:"u1", date:"2026-10-28", description:"Canva Pro", amount:15 }, { id:"u2", date:"2026-10-27", description:"Adobe", amount:60 }] } });
  await page.click("#ovNudges .fy-btn:has-text('Review transactions')");
  assert.equal(await page.$eval("#rvCat", s => s.value), "Software"); // suggested
  await page.click("#rvYes"); // "Remember" not ticked
  await page.click("#rvChange");
  await page.selectOption("#rvCat", "Equipment");
  await page.selectOption("#rvCat", "Software");
  assert.match(await page.textContent("#rvRemText"), /Remember Adobe → Software for next time/);
  await page.check("#rvRemember");
  await page.click("#rvYes");
  await page.waitForSelector(".rv-done");
  const cs = await lastSettings(page);
  assert.deepEqual(cs.categoryRules.map(r => [r.key, r.cat, r.kind]), [["adobe", "Software", "expense"]]);
  assert.ok(cs.categoryLog.some(l => l.name === "Canva Pro" && l.to === "Software"), "decisions are logged");
});

test("a saved rule is labelled as yours, and still waits for a Yes", async () => {
  const rules = [{ id:"r1", kind:"expense", key:"adobe", label:"Adobe", cat:"Software" }];
  const page = await openApp({ tables: { profiles: [{ id:ME, creator_settings:{ setupDone:true, rulesMigrated:true, categoryRules:rules } }],
    unclassified_expenses: [{ id:"u1", date:"2026-10-28", description:"ADOBE *CREATIVE CLD", amount:60 }, { id:"u2", date:"2026-10-27", description:"Adoberry Farms", amount:20 }] } });
  await page.click("#ovNudges .fy-btn:has-text('Review transactions')");
  assert.match(await page.textContent(".rv-hint"), /Your rule.*ADOBE \*CREATIVE CLD → Software/);
  assert.equal(await page.$eval("#rvCat", s => s.value), "Software");
  await page.click("#rvYes");
  assert.doesNotMatch(await page.textContent(".rv-hint"), /Your rule/); // Adoberry is a different merchant
});

test("changing a category on an expense offers to remember it; a different answer for a saved merchant asks before replacing", async () => {
  const page = await openApp({ tables: { profiles: [{ id:ME, creator_settings:{ setupDone:true, rulesMigrated:true, categoryRules:[{ id:"r1", kind:"expense", key:"camera", label:"Camera", cat:"Equipment" }] } }] } });
  await go(page, "expenses");
  await page.click("#view-expenses .row-edit-btn[data-edit-expense='e1']");
  await page.evaluate(() => { document.getElementById("expMore").open = true; });
  await page.selectOption("#expenseForm [name=category]", "Software");
  await page.click("#expenseSubmitBtn");
  await page.waitForSelector("#remYes");
  assert.match(await page.textContent("#settingsModalBox"), /Want GigBooks to remember this for next time\?/);
  await page.click("#remYes");
  await page.waitForSelector("#ruleReplace");
  assert.match(await page.textContent("#settingsModalBox"), /You told GigBooks Camera is Equipment\. Change it to Software/);
  await page.click("#ruleReplace");
  await page.waitForTimeout(150);
  const cs = await lastSettings(page);
  assert.equal(cs.categoryRules.find(r => r.key === "camera").cat, "Software");
});

test("rules can be reviewed, edited and deleted in Settings, with conflicts pointed out", async () => {
  const rules = [{ id:"r1", kind:"expense", key:"adobe", label:"Adobe", cat:"Software" }, { id:"r2", kind:"expense", key:"adobe stock", label:"Adobe Stock", cat:"Equipment" }];
  const page = await openApp({ tables: { profiles: [{ id:ME, creator_settings:{ setupDone:true, rulesMigrated:true, categoryRules:rules } }] } });
  await go(page, "settings");
  await page.click("[data-settings-tab='preferences']");
  await page.click("[data-setting='categoryRules']");
  assert.match(await page.textContent(".rules-list"), /Disagrees with “Adobe Stock” → Equipment/);
  await page.selectOption("[data-rule-cat='r2']", "Software");
  assert.doesNotMatch(await page.textContent(".rules-list"), /Disagrees/);
  await page.click("[data-rule-del='r1']");
  const cs = await lastSettings(page);
  assert.deepEqual(cs.categoryRules.map(r => [r.key, r.cat]), [["adobe stock", "Software"]]);
  assert.deepEqual(page.errors, []);
});

test("rules from the earlier version carry over without being deleted", async () => {
  const page = await openApp({ tables: { profiles: [{ id:ME, creator_settings:{ setupDone:true, merchantRules:{ "canva": { cat:"Software" } } } }],
    unclassified_expenses: [{ id:"u1", date:"2026-10-28", description:"Canva", amount:15 }] } });
  await page.click("#ovNudges .fy-btn:has-text('Review transactions')");
  assert.match(await page.textContent(".rv-hint"), /Your rule.*Canva → Software/);
});

test("rules are saved to the signed-in user's own profile only", async () => {
  const page = await openApp({ tables: { unclassified_expenses: [{ id:"u1", date:"2026-10-28", description:"Adobe", amount:60 }] } });
  await page.click("#ovNudges .fy-btn:has-text('Review transactions')");
  await page.check("#rvRemember");
  await page.click("#rvYes");
  await page.waitForSelector(".rv-done");
  const saves = await page.evaluate(() => window.__updates.filter(u => u.table === "profiles" && (u.values.creator_settings.categoryRules || []).length));
  assert.ok(saves.length);
  for(const u of saves) assert.deepEqual(u.filters, [["id", ME]]);
});
