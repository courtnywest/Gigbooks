// Invoices: menus that stay usable, and finalizing a draft.
const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const { openApp, closeAll, go } = require("./helpers");

after(closeAll);

const INV = { tables: { invoices: [
  { id:"a", invoice_number:3, client_name:"Courteney West", issue_date:"2026-11-03", due_date:"2026-11-30", status:"draft", line_items:[{ description:"Reel", quantity:1, rate:937.5 }], subtotal:937.5, total:937.5 },
  { id:"b", invoice_number:2, client_name:"Courteney West", issue_date:"2026-09-19", due_date:"2026-10-18", status:"paid", paid_at:"2026-09-19", line_items:[], subtotal:40, total:40 },
  { id:"c", invoice_number:1, client_name:"Luckie", issue_date:"2026-09-18", status:"void", line_items:[], subtotal:0, total:0 }
] } };

for(const width of [1000, 1280]){
  test(`at ${width}px the row menu opens fully, with no extra scrollbar`, async () => {
    const page = await openApp(INV, { width, height:800 });
    await go(page, "invoices");
    await page.click('[data-row-menu="inv-b"]');
    const r = await page.evaluate(() => {
      const panel = document.querySelector('[data-row-menu-panel="inv-b"]'), box = panel.getBoundingClientRect();
      const sc = document.querySelector("#view-invoices .tbl-scroll");
      return { pos:getComputedStyle(panel).position, inView: box.left >= 0 && box.right <= innerWidth && box.bottom <= innerHeight,
        scrollsDown: sc.scrollHeight > sc.clientHeight + 1, scrollsSide: sc.scrollWidth > sc.clientWidth + 1 };
    });
    assert.deepEqual(r, { pos:"fixed", inView:true, scrollsDown:false, scrollsSide:false });
    assert.deepEqual(page.errors, []);
  });
}

test("a draft can be finalized, which locks it until reopened", async () => {
  const page = await openApp(INV);
  await go(page, "invoices");
  await page.click('[data-row-menu="inv-a"]');
  await page.click('[data-finalize-invoice="a"]');
  assert.match(await page.textContent("#settingsModalBox h2"), /Finalize invoice #0003\?/);
  await page.click("#finYes");
  assert.match(await page.textContent("#settingsModalBox h2"), /Invoice #0003 is final/);
  await page.click("[data-close-settings]").catch(() => page.evaluate(() => document.getElementById("settingsModal").classList.remove("open")));
  await page.evaluate(() => document.getElementById("settingsModal").classList.remove("open"));
  assert.match(await page.textContent("#invoicesTableBody tr:first-child"), /Final\s*Ready to send/);
  await page.click('[data-row-menu="inv-a"]');
  await page.click('[data-edit-invoice="a"]');
  assert.match(await page.textContent("#settingsModalBox"), /Reopen it as a draft to make changes/);
  await page.click("#finReopen");
  assert.ok(await page.$eval("#invoiceModal", m => m.classList.contains("open")));
  await page.evaluate(() => document.getElementById("invoiceModal").classList.remove("open"));
  assert.match(await page.textContent("#invoicesTableBody tr:first-child"), /Draft/);
});

test("editing a paid invoice asks first", async () => {
  const page = await openApp(INV);
  await go(page, "invoices");
  await page.click('[data-row-menu="inv-b"]');
  await page.click('[data-edit-invoice="b"]');
  assert.match(await page.textContent("#settingsModalBox h2"), /Invoice #0002 has been paid/);
});

test("Save & finalize from the invoice form", async () => {
  const page = await openApp(INV);
  await go(page, "invoices");
  await page.click('[data-row-menu="inv-a"]');
  await page.click('[data-edit-invoice="a"]');
  await page.click("#saveFinalInvoiceBtn");
  await page.waitForSelector("#finEmail");
  assert.match(await page.textContent("#settingsModalBox h2"), /Invoice #0003 is final/);
});
