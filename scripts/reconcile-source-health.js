"use strict";
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const reportPath = path.join(root, "reports/app-runtime-live-test.json");
const historyPath = path.join(root, "config/source-health-history.json");
const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
const history = fs.existsSync(historyPath)
  ? JSON.parse(fs.readFileSync(historyPath, "utf8"))
  : { schemaVersion: 1, sources: {} };
const now = report.generatedAt || new Date().toISOString();
for (const result of report.results) {
  const previous = history.sources[result.id] || { checks: 0, userConfirmedWorking: false };
  history.sources[result.id] = {
    ...previous,
    checks: previous.checks + 1,
    lastCheckedAt: now,
    lastProbeStatus: result.status,
    lastProbeResult: result,
    // Probe failures are diagnostic only. They do not prove a source is broken
    // and must never automatically remove an owner-confirmed source.
    sourceAvailabilityStatus: previous.userConfirmedWorking ? "user-confirmed-baseline" : "requires-manual-verification"
  };
}
history.updatedAt = now;
history.policy = {
  testKeywords: report.keywords,
  requiredStages: ["搜索", "详情", "目录", "正文"],
  userConfirmedSourcesAreProtected: true,
  probeFailuresAreDiagnosticOnly: true,
  automaticQuarantine: false,
  backupsRetained: true,
  manualReviewAndRepairRequiredBeforeAnyFormalRemoval: true
};
fs.writeFileSync(historyPath, JSON.stringify(history, null, 2) + "\n");
console.log(JSON.stringify({ checked: report.results.length, updated: "config/source-health-history.json", automaticQuarantine: false }, null, 2));
