"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const source = JSON.parse(fs.readFileSync(path.join(root, "development/mock-source.json"), "utf8"));
const data = JSON.parse(fs.readFileSync(path.join(root, "development/mock-responses.json"), "utf8"));
const required = ["baseUrl", "searchUrl", "bookUrl", "chapterListUrl", "chapterUrl"];
assert.equal(source.schemaVersion, 1);
assert.equal(source.enabled, false);
assert.equal(source.developmentOnly, true);
assert.ok(source.id && source.name);
for (const key of required) {
  const url = new URL(source[key].replace("{keyword}", "test").replace("{bookId}", "demo-book-001").replace("{chapterId}", "demo-chapter-001"));
  assert.equal(url.protocol, "https:");
  assert.equal(url.hostname, "mock-api.example.invalid");
}
assert.equal(data.search.items.length, 1);
const book = data.search.items[0];
assert.ok(book.title && book.author && book.bookUrl);
assert.ok(data.detail.title && data.detail.author);
assert.equal(data.chapters.length, 3);
for (const chapter of data.chapters) {
  assert.ok(chapter.id && chapter.title && Number.isInteger(chapter.index) && chapter.url);
  const content = data.contents[chapter.id];
  assert.ok(content && content.title && content.content.trim());
}
assert.match(data.contents["demo-chapter-001"].content, /星星/);
console.log("App 模拟书源通过：配置、搜索、详情、3章目录、3章正文；仅模拟，不进入正式订阅。");
