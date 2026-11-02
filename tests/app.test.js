// Everyday flows: sorting new transactions, plans, and the phone layout.
const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const { openApp, closeAll, go } = require("./helpers");

after(closeAll);

test("new transactions are pre-sorted from history and approved in one tap", async () => {
  const page = await openApp({ tables: {
    unclassified_expenses: [{ id:"u1", date:"2026-10-28", description:"Camera", amount:200 }, { id:"u2", date:"2026-10-28", description:"Mystery shop", amount:30 }]
  } });
  const row = await page.textContent(".fy-card");
  assert.match(row, /We sorted 1 of 2 new transactions for you/);
  await page.click("#fyApproveAll");
  await page.waitForTimeout(300);
  assert.match(await page.textContent(".fy-card"), /1 new transaction to sort/);
  assert.deepEqual(page.errors, []);
});

test("before the billing table exists, nothing is behind a paywall", async () => {
  const page = await openApp();
  await go(page, "ask");
  await page.fill("#askInput", "How am I doing?");
  await page.click("#askSend").catch(() => page.keyboard.press("Enter"));
  await page.waitForTimeout(200);
  assert.equal(await page.$(".upg"), null);
});

test("Free accounts see the upgrade sheet for Pro features", async () => {
  const page = await openApp({ missingTables: [], tables: { billing: [] } });
  await go(page, "ask");
  await page.fill("#askInput", "How am I doing?");
  await page.click("#askSend").catch(() => page.keyboard.press("Enter"));
  await page.waitForSelector(".upg");
  assert.match(await page.textContent(".upg h2"), /Ask Giggy is a Pro feature/);
});

test("new accounts get Pro during the 14-day trial", async () => {
  const page = await openApp({ missingTables: [], tables: { billing: [] }, user: { created_at:"2026-10-25T00:00:00Z" } });
  await go(page, "ask");
  await page.fill("#askInput", "How am I doing?");
  await page.click("#askSend").catch(() => page.keyboard.press("Enter"));
  await page.waitForTimeout(200);
  assert.equal(await page.$(".upg"), null);
});

test("founding members keep Pro until their date", async () => {
  const page = await openApp({ missingTables: [], tables: { billing: [{ user_id:"x", plan:"free", pro_until:"2028-01-01T00:00:00Z" }] } });
  await page.evaluate(() => { document.querySelector('.nav-item[data-view="settings"]').click(); document.querySelector('[data-setting="plan"]').click(); });
  assert.match(await page.textContent("#settingsModalBox .settings-note"), /Founding member: Pro is free for you until/);
});

test("on phones, no page scrolls sideways", async () => {
  const page = await openApp({}, { width:375, height:800 });
  const views = await page.$$eval(".view", vs => vs.map(v => v.id.replace("view-", "")));
  for(const v of views){
    const wide = await page.evaluate(v => {
      document.querySelectorAll(".view").forEach(x => x.classList.toggle("active", x.id === "view-" + v));
      const more = document.getElementById("ovMore"); if(more) more.open = true;
      return document.documentElement.scrollWidth;
    }, v);
    assert.ok(wide <= 375, `${v} is ${wide}px wide`);
  }
});
