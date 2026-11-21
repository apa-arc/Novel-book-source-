"use strict";
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const reportPath = path.join(root, "reports/app-runtime-live-test.json");
const indexPath = path.join(root, "index.json");
const registryPath = path.join(root, "config/subscription-source-registry.json");
const historyPath = path.join(root, "config/source-health-history.json");
const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
const index = JSON.parse(fs.readFileSync(indexPath, "utf8"));
const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
const history = fs.existsSync(historyPath)
  ? JSON.parse(fs.readFileSync(historyPath, "utf8"))
  : { schemaVersion: 1, sources: {} };
const registryById = new Map(registry.sources.map(x => [x.id, x]));
const indexById = new Map(index.sources.map(x => [x.id, x]));
const reportById = new Map(report.results.map(x => [x.id, x]));
const now = report.generatedAt || new Date().toISOString();
const threshold = 3;
const changes = [];
for (const [id, result] of reportById) {
  const meta = registryById.get(id);
  const entry = indexById.get(id);
  if (!meta || !entry) continue;
  const previous = history.sources[id] || { consecutiveFailures: 0, checks: 0 };
  const passed = result.status === "passed-both";
  const next = {
    ...previous,
    checks: previous.checks + 1,
    consecutiveFailures: passed ? 0 : previous.consecutiveFailures + 1,
    lastCheckedAt: now,
    lastStatus: result.status,
    lastResult: result
  };
  if (false && !passed && entry.enabled === true && next.consecutiveFailures >= threshold) {
    entry.enabled = false;
    const sourcePath = path.join(root, meta.metadataFile);
    const source = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
    source.enabled = false;
    fs.writeFileSync(sourcePath, JSON.stringify(source, null, 2) + "\n");
    meta.formalDisposition = "quarantined-after-" + threshold + "-consecutive-failures";
    next.quarantinedAt = now;
    changes.push({ id, action: "removed-from-formal-subscription", failures: next.consecutiveFailures });
  }
  if (false && passed && entry.enabled !== true) {
    const sourcePath = path.join(root, meta.metadataFile);
    const source = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
    const qualityExists = source.qualityReport && fs.existsSync(path.join(root, source.qualityReport));
    const functionalExists = source.functionalTestReport && fs.existsSync(path.join(root, source.functionalTestReport));
    if (source.hostValidated === true && qualityExists && functionalExists && source.licenseApproved === true) {
      entry.enabled = true;
      source.enabled = true;
      fs.writeFileSync(sourcePath, JSON.stringify(source, null, 2) + "\n");
      meta.formalDisposition = "recovered-and-requalified";
      next.recoveredAt = now;
      changes.push({ id, action: "restored-to-formal-subscription" });
    } else {
      next.recoveryBlockedReason = "四阶段复测通过，但质量报告/许可/宿主验证证据不完整，保持排除";
    }
  }
  history.sources[id] = next;
}
index.updatedAt = now.slice(0, 10);
history.updatedAt = now;
history.policy = {
  testKeywords: report.keywords,
  requiredStages: ["搜索", "详情", "目录", "正文"],
  consecutiveFailureThreshold: threshold,
  automaticQuarantineDisabledPendingValidatedAppTest: true,
  oneFailureDoesNotRemoveSource: true,
  backupsRetained: true,
  reactivationRequiresAllFourStagesAndQualityLicenseEvidence: true
};
fs.writeFileSync(indexPath, JSON.stringify(index, null, 2) + "\n");
fs.writeFileSync(historyPath, JSON.stringify(history, null, 2) + "\n");
fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2) + "\n");
console.log(JSON.stringify({ checked: reportById.size, changes, historyPath: "config/source-health-history.json" }, null, 2));
