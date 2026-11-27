"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const readJson = file => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
const readText = file => fs.readFileSync(path.join(root, file), "utf8");
const subscription = readJson("subscription.json");

function subscriptionEntry(id) {
  const entry = subscription.sources.find(source => source.id === id);
  assert.ok(entry, "subscription entry missing: " + id);
  return entry;
}

function metadata(id) {
  return readJson("sources/" + id + ".json");
}

for (const id of ["xqianqian-m", "d8zw-com"]) {
  const entry = subscriptionEntry(id);
  const source = metadata(id);
  assert.equal(entry.version, source.version, id + " subscription version must match metadata");
  assert.equal(entry.metadataUrl, "https://raw.githubusercontent.com/apa-arc/Novel-book-source-/main/sources/" + id + ".json");
  assert.equal(entry.scriptUrl, "https://raw.githubusercontent.com/apa-arc/Novel-book-source-/main/scripts/" + id + ".js");
}

const qianqian = readText("scripts/xqianqian-m.js");
for (const selector of [
  'title: css(".name")',
  'description: css(".book_about dd")',
  'list: css(".book_last dl dd", "all")',
  'body: css("#chaptercontent")'
]) {
  assert.ok(qianqian.includes(selector), "Qianqian adapter selector mismatch: " + selector);
}
assert.ok(!qianqian.includes('title: css("h1")'), "Qianqian detail title must use .name");
assert.ok(!qianqian.includes('body: css("#content")'), "Qianqian content must use #chaptercontent");

const d8zw = readText("scripts/d8zw-com.js");
assert.ok(d8zw.includes('list: css(".book_list2 > ul > li", "all")'));
assert.ok(!/toc:\s*\{\s*url\s*:/.test(d8zw), "D8ZW TOC must load from book detail URL, not append index_1.html");

console.log("source adapter parity tests passed");
