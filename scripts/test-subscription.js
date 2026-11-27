"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { buildSubscription } = require("./build-subscription");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "novel-subscription-"));
try {
  fs.mkdirSync(path.join(root, "sources"));
  fs.mkdirSync(path.join(root, "scripts"));
  fs.mkdirSync(path.join(root, "quality-reports"));
  const meta = {
    schemaVersion: 1, id: "demo-source", name: "演示书源", kind: "public-web",
    version: "1.0.0", description: "测试", baseUrl: "https://example.com",
    domains: ["example.com"], script: "scripts/demo-source.js", enabled: true,
    categories: ["测试"],
    appConfig: {
      searchUrl: "https://example.com/search?q={keyword}",
      bookUrl: "https://example.com/book/{bookId}",
      chapterListUrl: "https://example.com/toc/{bookId}",
      chapterUrl: "https://example.com/chapter/{chapterId}",
      htmlRules: { search: { itemSelector: ".book", titleSelector: "a", urlSelector: "a" } }
    },
    licenseApproved: true, licenseEvidence: "测试授权记录",
    licenseType: "open-license", licenseEvidenceUrl: "https://example.com/license",
    hostValidated: true, qualityReport: "quality-reports/demo-source.json",
    functionalTestReport: "quality-reports/demo-source-functional.json"
  };
  fs.writeFileSync(path.join(root, "sources/demo-source.json"), JSON.stringify(meta));
  fs.writeFileSync(path.join(root, "scripts/demo-source.js"), "module.exports = {};");
  fs.writeFileSync(path.join(root, meta.qualityReport), JSON.stringify({
    schemaVersion: 1, sourceId: "demo-source", sourceVersion: "1.0.0",
    generatedAt: "2026-11-20T00:00:00.000Z",
    summary: { scanned: 10, suspect: 0, review: 0, duplicates: 0 }
  }));
  fs.writeFileSync(path.join(root, meta.functionalTestReport), JSON.stringify({
    schemaVersion: 1, sourceId: "demo-source", sourceVersion: "1.0.0",
    status: "passed",
    summary: { passedStages: 6, failedStages: 0, sampledChapters: 2, qualityPassed: true }
  }));
  const index = { schemaVersion: 1, sources: [
    { id: "template-source", name: "模板", kind: "public-web", file: "sources/template.json", enabled: false },
    { id: "demo-source", name: "演示书源", kind: "public-web", file: "sources/demo-source.json", enabled: true }
  ] };
  const ordinary = buildSubscription(index, root, "2026-11-20T00:00:00.000Z");
  assert.equal(ordinary.sourceCount, 1);
  assert.equal(ordinary.sources[0].id, "demo-source");
  assert.equal(ordinary.sources[0].appConfig.searchUrl, "https://example.com/search?q={keyword}");
  assert.equal(ordinary.sources[0].appConfig.htmlRules.search.itemSelector, ".book");
  assert.equal(ordinary.sources[0].scriptUrl, "https://raw.githubusercontent.com/apa-arc/Novel-book-source-/main/scripts/demo-source.js");
  assert.equal(ordinary.sources[1].id, "book-aliases");
  assert.equal(ordinary.sources[1].kind, "alias-dictionary");
  assert.equal(ordinary.sources[1].dataUrl, "https://raw.githubusercontent.com/apa-arc/Novel-book-source-/main/aliases/book-aliases.json");
  assert.equal(ordinary.sourceCount, 1, "alias dictionaries must not count as content sources");
  assert.equal(ordinary.updatedAt, "2026-11-20T00:00:00.000Z");
  const pendingMeta = {
    ...meta,
    id: "pending-source",
    name: "待验证书源",
    hostValidated: false,
    validationStatus: "imported-unverified",
    validationNote: "等待 App 真机四阶段验证",
  };
  delete pendingMeta.qualityReport;
  delete pendingMeta.functionalTestReport;
  fs.writeFileSync(path.join(root, "sources/pending-source.json"), JSON.stringify(pendingMeta));
  fs.writeFileSync(path.join(root, "scripts/pending-source.js"), "module.exports = {};");
  const pending = buildSubscription({ schemaVersion: 1, sources: [
    { id: "pending-source", name: "待验证书源", kind: "public-web", file: "sources/pending-source.json", enabled: true }
  ] }, root, "2026-11-20T00:00:00.000Z");
  assert.equal(pending.sourceCount, 1);
  assert.equal(pending.sources[0].validationStatus, "imported-unverified");
  assert.equal(pending.sources[0].validationNote, "等待 App 真机四阶段验证");

  const adult = buildSubscription({ schemaVersion: 1, sources: [] }, root, "2026-11-20T00:00:00.000Z", {
    subscriptionId: "apa-arc-adult-novel-book-source", name: "成人小说书源", description: "独立隔离"
  });
  assert.equal(adult.sourceCount, 0);
  assert.equal(adult.subscriptionId, "apa-arc-adult-novel-book-source");
  assert.equal(adult.name, "成人小说书源");
  assert.deepEqual(adult.sources, []);

  assert.throws(() => buildSubscription({ ...index, sources: [...index.sources, index.sources[1]] }, root), /重复 ID/);
  assert.throws(() => buildSubscription({ ...index, sources: [{ ...index.sources[1], file: "sources/../index.json" }] }, root), /路径非法/);
  assert.throws(() => buildSubscription({ ...index, sources: [{ ...index.sources[1], name: "错名" }] }, root), /不一致/);
  assert.throws(() => buildSubscription({ ...index, sources: [{ ...index.sources[1], enabled: true, file: "sources/missing.json" }] }, root), /不存在/);
  fs.writeFileSync(path.join(root, "sources/demo-source.json"), JSON.stringify({ ...meta, baseUrl: "http://example.com" }));
  assert.throws(() => buildSubscription(index, root), /地址或域名白名单无效/);
  console.log("Subscription builder tests passed.");
} finally { fs.rmSync(root, { recursive: true, force: true }); }
