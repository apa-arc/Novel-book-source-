"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { validateSourceQuality } = require("../runtime/source-quality-gate");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "source-quality-gate-"));
try {
  fs.mkdirSync(path.join(root, "quality-reports"));
  const meta = {
    id: "demo-source", version: "1.0.0", enabled: true,
    licenseApproved: true, licenseEvidence: "明确的开放许可记录",
    licenseType: "open-license", licenseEvidenceUrl: "https://example.com/license",
    hostValidated: true, qualityReport: "quality-reports/demo-source.json",
    functionalTestReport: "quality-reports/demo-source-functional.json",
    domains: ["example.com"],
    appConfig: {
      searchUrl: "https://example.com/search?q={keyword}",
      bookUrl: "https://example.com/book/{bookId}",
      chapterListUrl: "https://example.com/toc/{bookId}",
      chapterUrl: "https://example.com/chapter/{chapterId}"
    }
  };
  const quality = {
    schemaVersion: 1, sourceId: "demo-source", sourceVersion: "1.0.0",
    generatedAt: "2026-11-20T00:00:00.000Z",
    summary: { scanned: 20, suspect: 0, review: 0, duplicates: 0 }
  };
  const functional = {
    schemaVersion: 1, sourceId: "demo-source", sourceVersion: "1.0.0",
    status: "passed",
    summary: { passedStages: 6, failedStages: 0, sampledChapters: 2, qualityPassed: true }
  };
  fs.writeFileSync(path.join(root, meta.qualityReport), JSON.stringify(quality));
  fs.writeFileSync(path.join(root, meta.functionalTestReport), JSON.stringify(functional));
  assert.deepEqual(validateSourceQuality(meta, root), {
    ok: true, skipped: false, scanned: 20, sampledChapters: 2
  });
  assert.equal(validateSourceQuality({ ...meta, enabled: false }, root).skipped, true);
  assert.throws(() => validateSourceQuality({ ...meta, licenseApproved: false }, root), /license-review-required/);
  assert.throws(() => validateSourceQuality({ ...meta, licenseType: "unknown" }, root), /license-type-required/);
  assert.throws(() => validateSourceQuality({ ...meta, licenseEvidenceUrl: "http://example.com/license" }, root), /evidence-url-invalid/);
  assert.throws(() => validateSourceQuality({ ...meta, hostValidated: false }, root), /host-validation-required/);
  assert.throws(() => validateSourceQuality({ ...meta, qualityReport: "" }, root), /quality-report-required/);
  assert.throws(() => validateSourceQuality({ ...meta, functionalTestReport: "" }, root), /functional-report-required/);
  assert.throws(() => validateSourceQuality({ ...meta, appConfig: { ...meta.appConfig, chapterUrl: "https://other.example/chapter" } }, root), /outside-allowlist/);
  fs.writeFileSync(path.join(root, meta.qualityReport), JSON.stringify({
    ...quality, summary: { ...quality.summary, suspect: 1 }
  }));
  assert.throws(() => validateSourceQuality(meta, root), /quality-report-not-passing/);
  fs.writeFileSync(path.join(root, meta.qualityReport), JSON.stringify(quality));
  fs.writeFileSync(path.join(root, meta.functionalTestReport), JSON.stringify({
    ...functional, summary: { ...functional.summary, failedStages: 1 }
  }));
  assert.throws(() => validateSourceQuality(meta, root), /functional-report-not-passing/);
  console.log("Source quality gate tests passed.");
} finally { fs.rmSync(root, { recursive: true, force: true }); }
