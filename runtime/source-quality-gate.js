"use strict";

const path = require("node:path");

function validateSourceQuality(meta, root) {
  if (!meta || meta.enabled !== true) return { ok: true, skipped: true };
  if (meta.licenseApproved !== true || typeof meta.licenseEvidence !== "string" || !meta.licenseEvidence.trim()) {
    throw new Error("enabled-source-license-review-required:" + (meta.id || "unknown"));
  }
  if (meta.hostValidated !== true) {
    throw new Error("enabled-source-host-validation-required:" + meta.id);
  }
  const reportPath = meta.qualityReport;
  if (typeof reportPath !== "string" || !reportPath.startsWith("quality-reports/") || reportPath.includes("..")) {
    throw new Error("enabled-source-quality-report-required:" + meta.id);
  }
  const absolute = path.resolve(root, reportPath);
  if (!absolute.startsWith(path.resolve(root, "quality-reports") + path.sep)) {
    throw new Error("enabled-source-quality-report-path-invalid:" + meta.id);
  }
  let report;
  try { report = require("node:fs").readFileSync(absolute, "utf8"); }
  catch { throw new Error("enabled-source-quality-report-missing:" + meta.id); }
  try { report = JSON.parse(report); }
  catch { throw new Error("enabled-source-quality-report-invalid-json:" + meta.id); }
  const summary = report && report.summary;
  if (report.schemaVersion !== 1 || report.sourceId !== meta.id || report.sourceVersion !== meta.version ||
      !summary || !Number.isInteger(summary.scanned) || summary.scanned < 1 ||
      summary.suspect !== 0 || summary.review !== 0 || summary.duplicates !== 0) {
    throw new Error("enabled-source-quality-report-not-passing:" + meta.id);
  }
  if (typeof report.generatedAt !== "string" || Number.isNaN(Date.parse(report.generatedAt))) {
    throw new Error("enabled-source-quality-report-date-invalid:" + meta.id);
  }
  return { ok: true, skipped: false, scanned: summary.scanned };
}

module.exports = { validateSourceQuality };