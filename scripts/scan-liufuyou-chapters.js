#!/usr/bin/env node
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { scanCandidates } = require("./scan-candidate-chapters");
const ROOT = path.resolve(__dirname, "..");
const input = JSON.parse(fs.readFileSync(path.join(ROOT, "imports/third-party/liufuyou/candidate-catalog.json"), "utf8"));
const offset = Number(process.env.SCAN_OFFSET || process.argv.find(x => x.startsWith("--offset="))?.split("=")[1] || 0);
const limit = 100;
(async () => {
  const report = await scanCandidates({ candidates: input.sources, limit, offset });
  const out = path.join(ROOT, "reports", "liufuyou-chapter-scan-" + offset + ".json");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ offset, totalUniqueCandidates: report.totalUniqueCandidates, candidateCount: report.candidateCount, counts: report.counts, output: out }, null, 2));
})().catch(error => { console.error(error); process.exit(1); });
