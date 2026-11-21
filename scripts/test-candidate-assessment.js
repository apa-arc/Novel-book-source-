"use strict";
const assert = require("node:assert/strict");
const { buildCandidateAssessment } = require("../scripts/aggregate-candidate-assessment");

const review = {
  sourceCount: 3,
  sources: [
    { id: "normal-www", name: "普通书源", group: "普通", baseUrl: "https://www.example.com/" },
    { id: "normal-mobile", name: "普通书源别名", group: "普通", baseUrl: "https://m.example.com/" },
    { id: "adult", name: "成人书源", group: "🔞", baseUrl: "https://adult.example/" }
  ]
};
const reports = [{
  generatedAt: "2026-11-22T00:00:00.000Z",
  offset: 0,
  totalUniqueCandidates: 1,
  candidateCount: 1,
  results: [{
    id: "normal-www",
    name: "普通书源",
    domain: "www.example.com",
    status: "chapter-sample-clean",
    homepage: true,
    robotsChecked: true,
    robotsStatus: "ok",
    sitemapFound: true,
    chapterPagesFound: 1,
    sampledChapters: 1,
    quality: { clean: 1 },
    reasons: []
  }]
}];
const assessment = buildCandidateAssessment(review, reports);
assert.equal(assessment.totals.sourceRecords, 3);
assert.equal(assessment.totals.uniqueDomains, 2);
assert.equal(assessment.totals.duplicateSourceRecords, 1);
assert.equal(assessment.totals.eligibleUniqueDomains, 1);
assert.equal(assessment.totals.scannedUniqueDomains, 1);
assert.equal(assessment.totals.adultExcludedSourceRecords, 1);
assert.equal(assessment.totals.readyForSubscription, 0);
assert.equal(assessment.sources[0].chapterSampleStatus, "chapter-sample-clean");
assert.equal(assessment.sources[1].chapterSampleStatus, "chapter-sample-clean");
assert.equal(assessment.sources[0].technicalStatus, "not-adapted");
assert.equal(assessment.sources[0].licenseStatus, "not-assessed");
assert.equal(assessment.sources[2].accessibilityStatus, "excluded-adult-policy");
assert.equal(assessment.sources[2].chapterSampleStatus, "not-run-adult-excluded");
assert.throws(() => buildCandidateAssessment(review, []), /没有找到/);
assert.throws(() => buildCandidateAssessment(review, [{ ...reports[0], totalUniqueCandidates: 2 }]), /totalUniqueCandidates/);
console.log("Candidate assessment tests passed.");
