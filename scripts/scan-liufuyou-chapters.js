#!/usr/bin/env node
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { scanCandidates } = require("./scan-candidate-chapters");
const ROOT = path.resolve(__dirname, "..");
const input = JSON.parse(fs.readFileSync(path.join(ROOT, "imports/third-party/liufuyou/candidate-catalog.json"), "utf8"));
const offset = Number(process.env.SCAN_OFFSET || process.argv.find(x => x.startsWith("--offset="))?.split("=")[1] || 0);
const limit = 100;
const chosen = input.sources.slice(Math.max(0, offset), Math.max(0, offset) + limit);
const concurrency = 3;
(async () => {
  const chunks = Array.from({ length: Math.min(concurrency, chosen.length) }, (_, i) =>
    chosen.filter((_, index) => index % concurrency === i)
  ).filter(chunk => chunk.length);
  const reports = await Promise.all(chunks.map(candidates =>
    scanCandidates({ candidates, limit: candidates.length, offset: 0 })
  ));
  const results = reports.flatMap(report => report.results);
  const counts = {};
  for (const result of results) counts[result.status] = (counts[result.status] || 0) + 1;
  const report = {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    offset,
    totalUniqueCandidates: input.sources.length,
    mode: "public-homepage-and-sitemap-chapter-sample",
    candidateCount: chosen.length,
    counts,
    note: "Limited public-page sample only. No login, cookies, paywall bypass, upstream rules or novel text are stored. Clean sample is not license approval or full-site validation.",
    results
  };
  const out = path.join(ROOT, "reports", "liufuyou-chapter-scan-" + offset + ".json");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ offset, totalUniqueCandidates: report.totalUniqueCandidates, candidateCount: report.candidateCount, counts: report.counts, output: out }, null, 2));
})().catch(error => { console.error(error); process.exit(1); });
