"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const readJson = file => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
const readText = file => fs.readFileSync(path.join(root, file), "utf8");
const subscription = readJson("subscription.json");

for (const entry of subscription.sources.filter(source => source.kind !== "alias-dictionary")) {
  const id = entry.id;
  const source = readJson("sources/" + id + ".json");
  assert.equal(entry.version, source.version, id + " subscription version must match metadata");
  assert.equal(entry.metadataUrl, "https://raw.githubusercontent.com/apa-arc/Novel-book-source-/main/sources/" + id + ".json");
  assert.equal(entry.scriptUrl, "https://raw.githubusercontent.com/apa-arc/Novel-book-source-/main/scripts/" + id + ".js");
  assert.ok(source.appConfig, id + " must have an App-compatible configuration");
  for (const endpoint of ["searchUrl", "bookUrl", "chapterListUrl", "chapterUrl"]) {
    assert.equal(typeof source.appConfig[endpoint], "string", id + " missing " + endpoint);
  }
}

const qianqian = readText("scripts/xqianqian-m.js");
for (const selector of [
  'title: css(".name")',
  'description: css(".book_about dd")',
  'list: css(".book_last dl dd", "all")',
  'body: css("#chaptercontent")'
]) assert.ok(qianqian.includes(selector), "Qianqian adapter selector mismatch: " + selector);
assert.ok(qianqian.includes('title: css(".name")'));
assert.ok(qianqian.includes('body: css("#chaptercontent")'));

const d8zw = readText("scripts/d8zw-com.js");
assert.ok(d8zw.includes('list: css(".book_list2 > ul > li", "all")'));
assert.ok(!/toc:\s*\{\s*url\s*:/.test(d8zw), "D8ZW TOC must use the detail page URL");


const source17177 = readJson("sources/biquge-17177.json");
const detail17177 = source17177.appConfig.htmlRules.detail;
assert.equal(detail17177.titleAttribute, "content");
assert.equal(detail17177.authorAttribute, "content");
assert.equal(detail17177.descriptionAttribute, "content");

console.log("source adapter parity tests passed");
