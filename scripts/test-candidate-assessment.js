"use strict";
const assert = require("node:assert/strict");
const { buildCandidateAssessment } = require("../scripts/aggregate-candidate-assessment");

const review = {
  sourceCount: 5,
  sources: [
    { id: "normal-www", name: "普通书源", group: "普通", baseUrl: "https://www.example.com/" },
    { id: "normal-mobile", name: "普通书源别名", group: "普通", baseUrl: "https://m.example.com/" },
    { id: "adult", name: "成人书源", group: "🔞", baseUrl: "https://adult.example/" },
    { id: "manga", name: "漫画站", group: "漫画", baseUrl: "https://manga.example/" },
    { id: "adult-manga", name: "🔞漫画站", group: "漫画", baseUrl: "https://adultmanga.example/" }
  ]
};
const reports = [{
  generatedAt: "2026-11-22T00:00:00.000Z",
  offset: 0,
  totalUniqueCandidates: 2,
  candidateCount: 2,
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
  }, {
    id: "adult",
    name: "成人书源",
    domain: "adult.example",
    status: "manual-review",
    homepage: true,
    robotsChecked: true,
    robotsStatus: "ok",
    sitemapFound: false,
    chapterPagesFound: 0,
    sampledChapters: 0,
    quality: null,
    reasons: ["no-chapter-link-in-homepage-or-public-sitemap"]
  }]
}];
const licenseReview = {
  sites: [{
    domain: "www.example.com",
    licenseStatus: "no-authorization-evidence-found",
    redistributionStatus: "not-approved",
    assessmentNote: "公开声明未提供授权。",
    evidence: [{ url: "https://www.example.com/terms", observation: "未发现授权条款。" }]
  }]
};
const assessment = buildCandidateAssessment(review, reports, undefined, licenseReview);
assert.equal(assessment.totals.sourceRecords, 5);
assert.equal(assessment.totals.uniqueDomains, 4);
assert.equal(assessment.totals.duplicateSourceRecords, 1);
assert.equal(assessment.totals.eligibleUniqueDomains, 2);
assert.equal(assessment.totals.scannedUniqueDomains, 2);
assert.equal(assessment.totals.adultCategorySourceRecords, 2);
assert.equal(assessment.totals.adultExcludedSourceRecords, 0);
assert.equal(assessment.totals.adultOnlyDomains, 1);
assert.equal(assessment.totals.nonNovelExcludedSourceRecords, 2);
assert.equal(assessment.totals.nonNovelOnlyDomains, 2);
assert.equal(assessment.totals.readyForSubscription, 0);
assert.equal(assessment.sources[0].chapterSampleStatus, "chapter-sample-clean");
assert.equal(assessment.sources[1].chapterSampleStatus, "chapter-sample-clean");
assert.equal(assessment.sources[0].technicalStatus, "not-adapted");
assert.equal(assessment.sources[0].licenseStatus, "no-authorization-evidence-found");
assert.equal(assessment.sources[0].redistributionStatus, "not-approved");
assert.equal(assessment.sources[0].licenseReviewMethod, "manual-public-page-review");
assert.equal(assessment.sources[0].licenseEvidence.length, 1);
assert.equal(assessment.sources[2].licenseStatus, "no-explicit-evidence-in-candidate-metadata");
assert.equal(assessment.sources[2].redistributionStatus, "not-approved-unverified");
assert.equal(assessment.licenseReviewSummary.sourceRecordsReviewed, 4);
assert.equal(assessment.licenseReviewSummary.manualSiteReviewDomains, 1);
assert.equal(assessment.licenseReviewSummary.redistributionApprovedRecords, 0);
assert.equal(assessment.sources[2].accessibilityStatus, "manual-review");
assert.equal(assessment.sources[2].chapterSampleStatus, "manual-review");
assert.equal(assessment.sources[2].technicalStatus, "not-adapted");
assert.equal(assessment.sources[3].accessibilityStatus, "excluded-non-novel-category");
assert.equal(assessment.sources[3].technicalStatus, "excluded-non-novel-category");
assert.equal(assessment.sources[4].adultCategory, true);
assert.equal(assessment.sources[4].nonNovelCategory, true);
assert.equal(assessment.sources[4].accessibilityStatus, "excluded-non-novel-category");
assert.equal(assessment.sources[4].technicalStatus, "excluded-non-novel-category");
assert.throws(() => buildCandidateAssessment(review, []), /没有找到/);
assert.throws(() => buildCandidateAssessment(review, [{ ...reports[0], totalUniqueCandidates: 3 }]), /totalUniqueCandidates/);
console.log("Candidate assessment tests passed.");
