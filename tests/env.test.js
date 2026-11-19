// Which environment the app thinks it's in, from its web address. The live
// site must never pick the dev database, so anything unknown is production.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const src = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const start = src.indexOf("const APP_ENV = (()=>{");
const body = src.slice(start + "const APP_ENV = ".length, src.indexOf("})();", start) + 4);
const envFor = (hostname, protocol = "https:") => new Function("location", `return ${body};`)({ hostname, protocol });

test("production addresses are production", () => {
  for(const h of ["gigbooks.vercel.app", "gigbooks-gigbooks.vercel.app", "gigbooks-git-main-gigbooks.vercel.app", "app.gigbooks.com", "www.example.com"])
    assert.equal(envFor(h), "production", h);
});
test("the dev branch and this computer are dev", () => {
  assert.equal(envFor("gigbooks-git-dev-gigbooks.vercel.app"), "dev");
  assert.equal(envFor("localhost"), "dev");
  assert.equal(envFor("", "file:"), "dev");
});
test("pull request previews are test previews", () => {
  assert.equal(envFor("gigbooks-git-claude-great-dirac-2qisrj-gigbooks.vercel.app"), "preview");
  assert.equal(envFor("gigbooks-3kjcohkbwy-gigbooks.vercel.app"), "preview");
});
test("production always uses the production database", () => {
  assert.match(src, /const USING_DEV_DB = APP_ENV !== "production" && !!DATABASES\.dev\.url;/);
});
