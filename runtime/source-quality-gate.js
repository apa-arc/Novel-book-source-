"use strict";

const fs = require("node:fs");
const path = require("node:path");

const LICENSE_TYPES = new Set(["self-owned", "written-permission", "open-license", "public-domain"]);
const APP_ENDPOINTS = ["searchUrl", "bookUrl", "chapterListUrl", "chapterUrl"];

function readJson(file, label) {
  let value;
  try { value = JSON.parse(fs.readFileSync(file, "utf8")); }
  catch { throw new Error(label + "-invalid-json"); }
  return value;
}

function validateAppConfig(meta) {
  if (!meta.appConfig || typeof meta.appConfig !== "object") {
    throw new Error("enabled-source-app-config-required:" + meta.id);
  }
  const allowed = new Set((meta.domains || []).map(x => String(x).toLowerCase()));
  for (const key of APP_ENDPOINTS) {
    const value = meta.appConfig[key];
    if (typeof value !== "string" || !value.trim()) {
      throw new Error("enabled-source-app-endpoint-required:" + meta.id + ":" + key);
    }
    let url;
    try { url = new URL(value.replace(/\{[^}]+\}/g, "placeholder")); }
    catch { throw new Error("enabled-source-app-endpoint-invalid:" + meta.id + ":" + key); }
    if (url.protocol !== "https:" || url.username || url.password ||
        !allowed.has(url.hostname.toLowerCase())) {
      throw new Error("enabled-source-app-endpoint-outside-allowlist:" + meta.id + ":" + key);
    }
  }
}

function validateSourceQuality(meta, root) {
  if (!meta || meta.enabled !== true) return { ok: true, skipped: true };
  if (meta.licenseApproved !== true || typeof meta.licenseEvidence !== "string" || !meta.licenseEvidence.trim()) {
    throw new Error("enabled-source-license-review-required:" + (meta.id || "unknown"));
  }
  if (!LICENSE_TYPES.has(meta.licenseType)) {
    throw new Error("enabled-source-license-type-required:" + meta.id);
  }
  let evidenceUrl;
  try { evidenceUrl = new URL(meta.licenseEvidenceUrl); }
  catch { throw new Error("enabled-source-license-evidence-url-required:" + meta.id); }
  if (evidenceUrl.protocol !== "https:" || evidenceUrl.username || evidenceUrl.password) {
    throw new Error("enabled-source-license-evidence-url-invalid:" + meta.id);
  }
  validateAppConfig(meta);

  const reportPath = meta.qualityReport;
  if (typeof reportPath !== "string" || !reportPath.startsWith("quality-reports/") || reportPath.includes("..")) {
    throw new Error("enabled-source-quality-report-required:" + meta.id);
  }
  const qualityAbsolute = path.resolve(root, reportPath);
  if (!qualityAbsolute.startsWith(path.resolve(root, "quality-reports") + path.sep)) {
    throw new Error("enabled-source-quality-report-path-invalid:" + meta.id);
  }
  const quality = readJson(qualityAbsolute, "enabled-source-quality-report");
  const summary = quality && quality.summary;
  if (quality.schemaVersion !== 1 || quality.sourceId !== meta.id || quality.sourceVersion !== meta.version ||
      !summary || !Number.isInteger(summary.scanned) || summary.scanned < 1 ||
      summary.suspect !== 0 || summary.review !== 0 || summary.duplicates !== 0) {
    throw new Error("enabled-source-quality-report-not-passing:" + meta.id);
  }
  if (typeof quality.generatedAt !== "string" || Number.isNaN(Date.parse(quality.generatedAt))) {
    throw new Error("enabled-source-quality-report-date-invalid:" + meta.id);
  }

  if (meta.hostValidated !== true) {
    throw new Error("enabled-source-host-validation-required:" + meta.id);
  }
  const functionalPath = meta.functionalTestReport;
  if (typeof functionalPath !== "string" || !functionalPath.startsWith("quality-reports/") || functionalPath.includes("..")) {
    throw new Error("enabled-source-functional-report-required:" + meta.id);
  }
  const functionalAbsolute = path.resolve(root, functionalPath);
  if (!functionalAbsolute.startsWith(path.resolve(root, "quality-reports") + path.sep)) {
    throw new Error("enabled-source-functional-report-path-invalid:" + meta.id);
  }
  const functional = readJson(functionalAbsolute, "enabled-source-functional-report");
  const functionalSummary = functional && functional.summary;
  if (functional.schemaVersion !== 1 || functional.sourceId !== meta.id ||
      functional.sourceVersion !== meta.version || functional.status !== "passed" ||
      !functionalSummary || functionalSummary.failedStages !== 0 ||
      !Number.isInteger(functionalSummary.passedStages) || functionalSummary.passedStages < 4 ||
      !Number.isInteger(functionalSummary.sampledChapters) || functionalSummary.sampledChapters < 1 ||
      functionalSummary.qualityPassed !== true) {
    throw new Error("enabled-source-functional-report-not-passing:" + meta.id);
  }
  return { ok: true, skipped: false, scanned: summary.scanned, sampledChapters: functionalSummary.sampledChapters };
}

module.exports = { validateSourceQuality };
