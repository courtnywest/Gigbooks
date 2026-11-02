// Opens GigBooks in a headless browser against the stub in fixtures/,
// with the clock frozen so every number on screen is predictable.
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");

const ROOT = path.join(__dirname, "..");
const STUB = fs.readFileSync(path.join(__dirname, "fixtures", "supabase-stub.js"), "utf8");
const TODAY = new Date("2026-10-30T12:00:00");

// Ten thousand received, $1,500 deductible and $500 non-deductible spending.
// Profit for tax = 10,000 - 1,500 = 8,500; set-aside at 30% = 2,550;
// safe to spend = 10,000 - 2,000 - 2,550 = 5,450.
const BASE = {
  tables: {
    income: [
      { id:"i1", date:"2026-10-10", source:"Glossier", type:"Brand Deal", status:"received", amount:6000 },
      { id:"i2", date:"2026-09-12", source:"Nike", type:"Brand Deal", status:"received", amount:4000 }
    ],
    expenses: [
      { id:"e1", date:"2026-10-05", description:"Camera", category:"Equipment", payment_method:"Visa", deductible:true, amount:1500 },
      { id:"e2", date:"2026-09-20", description:"Lunch", category:"Meals", payment_method:"Visa", deductible:false, amount:500 }
    ],
    income_categories: ["Brand Deal","Other Income"].map((name, i) => ({ id:"ic" + i, name })),
    expense_categories: ["Equipment","Software","Meals","Other"].map((name, i) => ({ id:"ec" + i, name }))
  },
  missingTables: ["billing"]
};

function fixture(overrides = {}){
  const f = JSON.parse(JSON.stringify(BASE));
  for(const [k, v] of Object.entries(overrides)){
    if(k === "tables") Object.assign(f.tables, v); else f[k] = v;
  }
  return f;
}

let browser;
async function openApp(overrides = {}, viewport = { width:1280, height:900 }){
  browser = browser || await chromium.launch();
  const context = await browser.newContext({ viewport, isMobile: viewport.width < 800, hasTouch: viewport.width < 800 });
  const fx = fixture(overrides);
  await context.route(/supabase-js/, r => r.fulfill({ contentType:"application/javascript", body:`window.__FIXTURE=${JSON.stringify(fx)};` + STUB }));
  await context.route(/html2pdf/, r => r.fulfill({ contentType:"application/javascript", body:"window.html2pdf=()=>{const o={set(){return o},from(){return o},save(){return Promise.resolve()},outputPdf(){return Promise.resolve('data:application/pdf;base64,AA')}};return o};" }));
  await context.route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({ body:"" }));
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.clock.setFixedTime(TODAY);
  await page.goto("file://" + path.join(ROOT, "index.html"));
  await page.waitForSelector("#page-app.active");
  await page.waitForTimeout(300);
  page.errors = errors;
  return page;
}
async function closeAll(){ if(browser){ await browser.close(); browser = null; } }

const GROUPS = { overview:"home", income:"money", expenses:"money", gifts:"money", bank:"money", invoices:"getpaid",
  pipeline:"getpaid", rateCalculator:"getpaid", reports:"reports", taxes:"reports", ask:"more", contracts:"more", settings:"more" };
async function go(page, view){
  await page.click(`.nav-item[data-group="${GROUPS[view]}"]`);
  const tab = await page.$(`[data-goto="${view}"]`);
  if(tab) await tab.click();
  await page.waitForTimeout(150);
}

module.exports = { openApp, closeAll, go, ROOT };
