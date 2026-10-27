"use strict";
// Usage: node restore_parity.cjs DUMP.json   (DUMP = {full, slim, omitted})
// Loads js/data.js in a vm, runs restoreAlerts on the slim list and deep-compares with full.
const fs = require("fs");
const vm = require("vm");
const assert = require("assert");
const path = require("path");
const dump = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const ctx = vm.createContext({ console });
ctx.window = ctx;
vm.runInContext(fs.readFileSync(path.resolve(__dirname, "..", "..", "js", "data.js"), "utf8"), ctx);
ctx.slim = dump.slim;
ctx.omitted = dump.omitted;
vm.runInContext("restoreAlerts(slim, omitted)", ctx);
const restored = JSON.parse(JSON.stringify(ctx.slim));
assert.strictEqual(restored.length, dump.full.length);
let bad = 0;
for (let i = 0; i < restored.length; i++) {
  try { assert.deepStrictEqual(restored[i], dump.full[i]); } catch (e) {
    if (bad++ < 3) console.error("alert", dump.full[i].id, "differs");
  }
}
if (bad) { console.error(bad + " alerts differ"); process.exit(1); }
console.log("restore parity ok: " + restored.length + " alerts");
