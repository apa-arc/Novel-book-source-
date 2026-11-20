"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { validateSourceQuality } = require("../runtime/source-quality-gate");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "source-quality-gate-"));
try {
  fs.mkdirSync(path.join(root, "quality-reports"));
  const meta = { id: "demo-source", version: "1.0.0", enabled: true, licenseApproved: true, licenseEvidence: "授权文件记录", hostValidated: true, qualityReport: "quality-reports/demo-source.json" };
  const report = { schemaVersion: 1, sourceId: "demo-source", sourceVersion: "1.0.0", generatedAt: "2026-11-20T00:00:00.000Z", summary: { scanned: 20, suspect: 0, review: 0, duplicates: 0 } };
  fs.writeFileSync(path.join(root, meta.qualityReport), JSON.stringify(report));
  assert.deepEqual(validateSourceQuality(meta, root), { ok: true, skipped: false, scanned: 20 });
  assert.equal(validateSourceQuality({ ...meta, enabled: false }, root).skipped, true);
  assert.throws(() => validateSourceQuality({ ...meta, licenseApproved: false }, root), /license-review-required/);
  assert.throws(() => validateSourceQuality({ ...meta, hostValidated: false }, root), /host-validation-required/);
  assert.throws(() => validateSourceQuality({ ...meta, qualityReport: "" }, root), /quality-report-required/);
  fs.writeFileSync(path.join(root, meta.qualityReport), JSON.stringify({ ...report, summary: { ...report.summary, suspect: 1 } }));
  assert.throws(() => validateSourceQuality(meta, root), /quality-report-not-passing/);
  fs.writeFileSync(path.join(root, meta.qualityReport), JSON.stringify({ ...report, sourceVersion: "0.9.0" }));
  assert.throws(() => validateSourceQuality(meta, root), /quality-report-not-passing/);
  console.log("Source quality gate tests passed.");
} finally { fs.rmSync(root, { recursive: true, force: true }); }