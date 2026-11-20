"use strict";
const assert = require("node:assert/strict");
const { runSourceTests } = require("../runtime/source-test-runner");
const source = { id: "fixture-source", version: "1.0.0", domains: ["example.org"] };
const http = { get: async url => ({ document: {}, url }) };
const adapter = {
  search: async () => [{ title: "测试小说", bookUrl: "https://example.org/book/1" }],
  getBookDetail: async () => ({ title: "测试小说", intro: "简介" }),
  getChapters: async () => [{ title: "第一章", chapterUrl: "https://example.org/chapter/1", index: 0 }, { title: "第二章", chapterUrl: "https://example.org/chapter/2", index: 1 }],
  getContent: async ({ chapterUrl }) => ({ content: chapterUrl.endsWith("/1") ? "正文内容".repeat(30) : "第二章正文".repeat(30) })
};
(async () => {
  const good = await runSourceTests({ adapter, http, source, profile: { keyword: "测试小说", expectedTitlePattern: "测试小说" } });
  assert.equal(good.status, "passed");
  assert.equal(good.summary.sampledChapters, 2);
  assert.equal(good.articleQuality.normal, 2);
  const empty = await runSourceTests({ adapter: { ...adapter, getChapters: async () => [] }, http, source, profile: { keyword: "测试小说" } });
  assert.equal(empty.status, "failed");
  assert.match(empty.error, /chapter-list-empty/);
  const badUrl = await runSourceTests({ adapter: { ...adapter, search: async () => [{ title: "外站", bookUrl: "https://evil.example/book" }] }, http, source, profile: { keyword: "x" } });
  assert.equal(badUrl.status, "failed");
  assert.match(badUrl.error, /allowlist/);
  const garbled = await runSourceTests({ adapter: { ...adapter, getContent: async () => ({ content: "�".repeat(100) }) }, http, source, profile: { keyword: "x" } });
  assert.equal(garbled.status, "failed");
  assert.equal(garbled.articleQuality.suspect, 2);
  console.log("Source test runner fixture tests passed.");
})().catch(error => { console.error(error); process.exitCode = 1; });