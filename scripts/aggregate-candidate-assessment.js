"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { hostAliases } = require("./scan-candidate-chapters");

const ADULT = /(?:色情|成人|情色|淫|18\+|18禁|r[-_ ]?18|🔞|adult)/i;
const NON_NOVEL = /(?:漫画|动漫|音乐|有声|听书|视频)/i;

function isAdult(source) {
  return ADULT.test(String(source.group || "") + " " + String(source.name || ""));
}
function isNonNovel(source) {
  return !isAdult(source) && NON_NOVEL.test(String(source.group || "") + " " + String(source.name || ""));
}
function isOutOfScope(source) {
  return isAdult(source) || isNonNovel(source);
}
function getHost(source) {
  try {
    const url = new URL(source.baseUrl);
    return url.hostname.toLowerCase();
  } catch {
    return null;
  }
}
function hostKey(host) {
  return [...hostAliases(host)].sort().join("|");
}
function countBy(items, selector) {
  const counts = {};
  for (const item of items) {
    const key = selector(item) || "unknown";
    counts[key] = (counts[key] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort((a, b) => a[0].localeCompare(b[0])));
}
function buildCandidateAssessment(candidateReview, reports, generatedAt, licenseReview = null) {
  const sources = candidateReview && candidateReview.sources;
  if (!Array.isArray(sources) || sources.length !== candidateReview.sourceCount) {
    throw new Error("candidate-review.json sourceCount 与 sources 数组不匹配");
  }
  if (!Array.isArray(reports) || reports.length === 0) {
    throw new Error("没有找到候选站点扫描报告");
  }

  const manualLicenseReviews = new Map(
    (licenseReview?.sites || []).map(site => [String(site.domain || "").toLowerCase(), site])
  );
  const groups = new Map();
  let invalidUrlRecords = 0;
  for (const source of sources) {
    const host = getHost(source);
    if (!host) {
      invalidUrlRecords++;
      continue;
    }
    const key = hostKey(host);
    if (!groups.has(key)) groups.set(key, { host, records: [], adultCount: 0, nonNovelCount: 0, eligibleCount: 0 });
    const group = groups.get(key);
    group.records.push(source);
    if (isAdult(source)) group.adultCount++;
    else if (isNonNovel(source)) group.nonNovelCount++;
    else group.eligibleCount++;
  }

  const eligibleGroups = new Map([...groups].filter(([, group]) => group.eligibleCount > 0));
  const adultOnlyGroups = [...groups.values()].filter(group => group.eligibleCount === 0 && group.adultCount === group.records.length);
  const nonNovelOnlyGroups = [...groups.values()].filter(group => group.eligibleCount === 0 && group.adultCount === 0 && group.nonNovelCount > 0);
  const mixedGroups = [...groups.values()].filter(group => group.eligibleCount > 0 && (group.adultCount > 0 || group.nonNovelCount > 0));

  const expectedHosts = eligibleGroups.size;
  const scanResults = new Map();
  const scanStatusCounts = {};
  const reportTotals = new Set();
  let resultCount = 0;
  for (const report of reports) {
    if (!Array.isArray(report.results) || Number(report.candidateCount) !== report.results.length) {
      throw new Error("扫描报告 candidateCount 与 results 数量不匹配");
    }
    reportTotals.add(Number(report.totalUniqueCandidates));
    for (const result of report.results) {
      if (!result.domain) throw new Error("扫描结果缺少 domain");
      const key = hostKey(String(result.domain).toLowerCase());
      if (!eligibleGroups.has(key)) throw new Error("扫描结果域名不在非成人候选队列中：" + result.domain);
      if (scanResults.has(key)) throw new Error("同一规范化域名出现重复扫描结果：" + result.domain);
      scanResults.set(key, result);
      scanStatusCounts[result.status] = (scanStatusCounts[result.status] || 0) + 1;
      resultCount++;
    }
  }
  if (reportTotals.size !== 1 || !reportTotals.has(expectedHosts)) {
    throw new Error("矩阵批次报告的 totalUniqueCandidates 不一致或与候选队列不匹配");
  }
  if (resultCount !== expectedHosts || scanResults.size !== expectedHosts) {
    throw new Error("扫描未覆盖全部非成人规范化域名：预期 " + expectedHosts + "，实际 " + resultCount);
  }

  const generated = generatedAt || reports.map(report => report.generatedAt).filter(Boolean).sort().at(-1) || new Date().toISOString();
  const assessments = sources.map(source => {
    const host = getHost(source);
    const key = host ? hostKey(host) : null;
    const adult = isAdult(source);
    const nonNovel = isNonNovel(source);
    const excluded = isOutOfScope(source);
    const scan = !excluded && key ? scanResults.get(key) : null;
    const accessibilityStatus = adult
      ? "excluded-adult-policy"
      : nonNovel
        ? "excluded-non-novel-category"
        : !key
          ? "invalid-or-missing-url"
          : scan.status;
    const sampleStatus = adult ? "not-run-adult-excluded" : nonNovel ? "not-run-non-novel-category" : scan ? scan.status : "not-run-invalid-url";
    const manualLicenseReview = host ? manualLicenseReviews.get(host) : null;
    const candidateLicenseEvidence = [
      ["license", source.license],
      ["licenseUrl", source.licenseUrl],
      ["licenseEvidence", source.licenseEvidence],
      ["redistributionEvidence", source.redistributionEvidence]
    ].filter(([, value]) => value !== undefined && value !== null && value !== "" && !(Array.isArray(value) && value.length === 0));
    const licenseStatus = manualLicenseReview?.licenseStatus ||
      (candidateLicenseEvidence.length ? "evidence-present-not-yet-verified" : "no-explicit-evidence-in-candidate-metadata");
    const redistributionStatus = manualLicenseReview?.redistributionStatus || "not-approved-unverified";
    const licenseEvidence = [
      ...candidateLicenseEvidence.map(([kind, value]) => ({ kind: "candidate-metadata:" + kind, value })),
      ...(manualLicenseReview?.evidence || [])
    ];
    const licenseAssessmentNote = manualLicenseReview?.assessmentNote ||
      (candidateLicenseEvidence.length
        ? "候选元数据含有许可相关字段，但尚未验证授权主体、范围、期限及再分发权，不能据此启用。"
        : "已检查该条候选元数据；未提供逐源许可证、授权链接或再分发证据。上游仓库声明 AGPL-3.0 不代表目标站点小说内容或第三方规则已获授权。");
    return {
      id: source.id,
      collectionId: source.collectionId,
      collectionName: source.collectionName,
      index: source.index,
      name: source.name,
      baseUrl: source.baseUrl || null,
      group: source.group || null,
      host: host,
      hostRecordCount: key && groups.has(key) ? groups.get(key).records.length : 1,
      adultCategory: adult,
      nonNovelCategory: nonNovel,
      accessibilityStatus: accessibilityStatus,
      accessibilityReasons: adult ? ["adult-category-excluded-from-automated-fetch"] : nonNovel ? ["non-novel-category-excluded-from-automated-fetch"] : scan ? (scan.reasons || []) : ["candidate-has-no-parseable-base-url"],
      accessibilityCheckedAt: scan ? generated : null,
      chapterSampleStatus: sampleStatus,
      chapterSampleQuality: scan ? scan.quality : null,
      technicalStatus: adult ? "excluded-adult-policy" : nonNovel ? "excluded-non-novel-category" : "not-adapted",
      appFunctionalTests: {
        search: "not-run",
        bookDetail: "not-run",
        chapters: "not-run",
        content: "not-run"
      },
      licenseStatus,
      redistributionStatus,
      licenseEvidence,
      licenseReviewMethod: manualLicenseReview ? "manual-public-page-review" : "candidate-metadata-review",
      licenseAssessmentNote
    };
  });

  const hostResults = [...scanResults.values()].map(result => ({
    id: result.id,
    name: result.name,
    domain: result.domain,
    status: result.status,
    homepage: Boolean(result.homepage),
    robotsChecked: Boolean(result.robotsChecked),
    robotsStatus: result.robotsStatus || null,
    sitemapFound: Boolean(result.sitemapFound),
    chapterPagesFound: Number(result.chapterPagesFound || 0),
    sampledChapters: Number(result.sampledChapters || 0),
    quality: result.quality || null,
    reasons: result.reasons || []
  })).sort((a, b) => a.domain.localeCompare(b.domain));

  const totals = {
    sourceRecords: sources.length,
    uniqueDomains: groups.size,
    duplicateSourceRecords: sources.length - invalidUrlRecords - groups.size,
    invalidUrlRecords: invalidUrlRecords,
    adultExcludedSourceRecords: assessments.filter(x => x.adultCategory).length,
    nonNovelExcludedSourceRecords: assessments.filter(x => x.nonNovelCategory).length,
    adultOnlyDomains: adultOnlyGroups.length,
    nonNovelOnlyDomains: nonNovelOnlyGroups.length,
    mixedOutOfScopeAndNovelDomains: mixedGroups.length,
    eligibleUniqueDomains: expectedHosts,
    scannedUniqueDomains: scanResults.size,
    licenseMetadataReviewedRecords: assessments.length,
    recordsWithExplicitLicenseMetadata: assessments.filter(x => x.licenseReviewMethod === "candidate-metadata-review" && x.licenseStatus === "evidence-present-not-yet-verified").length,
    manuallyReviewedLicenseRecords: assessments.filter(x => x.licenseReviewMethod === "manual-public-page-review").length,
    manuallyReviewedLicenseDomains: manualLicenseReviews.size,
    redistributionApprovedRecords: assessments.filter(x => x.redistributionStatus === "approved").length,
    readyForSubscription: 0
  };

  return {
    schemaVersion: 1,
    generatedAt: generated,
    sourceCatalog: "imports/aoaostar/candidate-review.json",
    sourceCatalogCount: sources.length,
    scanMode: "public-homepage-and-sitemap-chapter-sample",
    policy: "只检查公开 HTTPS 页面和公开 sitemap；遵守 robots.txt；不登录、不使用 Cookie/凭据、不绕过付费墙/验证码/DRM/反爬；不保存小说正文。",
    note: "可访问性探测不等于许可审核或 App 适配。所有候选仍须有明确授权/再分发依据，并通过目标 App 的 search、detail、chapters、content 四接口实测和正文质量门禁，才可启用。",
    totals: totals,
    hostScanStatusCounts: Object.fromEntries(Object.entries(scanStatusCounts).sort((a, b) => a[0].localeCompare(b[0]))),
    sourceAccessibilityStatusCounts: countBy(assessments, x => x.accessibilityStatus),
    chapterSampleStatusCounts: countBy(assessments, x => x.chapterSampleStatus),
    technicalStatusCounts: countBy(assessments, x => x.technicalStatus),
    licenseStatusCounts: countBy(assessments, x => x.licenseStatus),
    redistributionStatusCounts: countBy(assessments, x => x.redistributionStatus),
    licenseReviewSummary: {
      sourceRecordsReviewed: assessments.length,
      explicitLicenseMetadataRecords: assessments.filter(x => x.licenseReviewMethod === "candidate-metadata-review" && x.licenseStatus === "evidence-present-not-yet-verified").length,
      manualSiteReviewDomains: manualLicenseReviews.size,
      manuallyReviewedSourceRecords: assessments.filter(x => x.licenseReviewMethod === "manual-public-page-review").length,
      redistributionApprovedRecords: assessments.filter(x => x.redistributionStatus === "approved").length
    },
    manualSiteLicenseReviews: licenseReview?.sites || [],
    hostResults: hostResults,
    sources: assessments
  };
}

function renderSummary(assessment) {
  const t = assessment.totals;
  const table = Object.entries(assessment.hostScanStatusCounts)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([status, count]) => "| " + status + " | " + count + " |")
    .join("\n");
  return [
    "# AOAOSTAR 书源候选审查进度",
    "",
    "- 候选记录：" + t.sourceRecords,
    "- 规范化域名：" + t.uniqueDomains,
    "- 同域重复记录：" + t.duplicateSourceRecords,
    "- 成人类别排除记录：" + t.adultExcludedSourceRecords + "（仅排除自动抓取，不代表许可判断）",
    "- 非小说类别排除记录：" + t.nonNovelExcludedSourceRecords,
    "- 成人专属域名：" + t.adultOnlyDomains,
    "- 非小说专属域名：" + t.nonNovelOnlyDomains,
    "- 成人/非小说与普通混合域名：" + t.mixedOutOfScopeAndNovelDomains,
    "- 非成人待审域名：" + t.eligibleUniqueDomains,
    "- 已完成公开页面/章节样本扫描：" + t.scannedUniqueDomains,
    "- 逐条完成许可元数据检查：" + t.licenseMetadataReviewedRecords + " 条",
    "- 候选元数据中含逐源许可/授权字段：" + t.recordsWithExplicitLicenseMetadata + " 条",
    "- 人工核查公开许可声明的域名：" + t.manuallyReviewedLicenseDomains + " 个（对应 " + t.manuallyReviewedLicenseRecords + " 条候选记录）",
    "- 已获批准再分发的候选记录：" + t.redistributionApprovedRecords + " 条",
    "- 已具备明确许可且完成 App 四接口验收、可进入订阅：" + t.readyForSubscription,
    "",
    "## 域名扫描结果",
    "",
    "| 状态 | 域名数 |",
    "|---|---:|",
    table,
    "",
    "## 许可与技术状态",
    "",
    "- 许可/再分发依据：候选元数据已逐条检查；无逐源许可证/授权字段的记录标记为 no-explicit-evidence-in-candidate-metadata，不能视为已获许可。",
    "- 上游仓库虽声明 AGPL-3.0，但其目录明确指出单条规则来源和再分发权未评估；AGPL 不能替代站点内容授权。",
    "- 已人工核查两个章节样本可访问域名；公开声明均未提供授权链或再分发许可，保持 not-approved。",
    "- App 四接口：候选队列中所有记录仍未由本报告证明通过；搜索、详情、目录、正文均标记 not-run。",
    "- 技术适配：非成人候选均为 not-adapted；章节样本干净只代表抽样页质量初筛，不代表适配器可用。",
    "- 只有明确许可证据、四接口真实测试和质量门禁全部通过，才会加入正式订阅。",
    "",
    "人工许可审查记录：imports/aoaostar/license-review.json",
    "机器可读逐条评估：imports/aoaostar/candidate-assessment.json",
    "",
    ...(assessment.manualSiteLicenseReviews || []).map(site => "- " + site.domain + "：" + site.assessmentNote),
    "扫描限制：GitHub Actions 网络环境下的 403、超时或连接失败只能说明当前探测环境不可访问，不能推断站点永久失效。"
  ].join("\n") + "\n";
}

function walkJsonFiles(root) {
  if (!fs.existsSync(root)) return [];
  const out = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) out.push(...walkJsonFiles(full));
    else if (entry.isFile() && entry.name === "candidate-chapter-scan.json") out.push(full);
  }
  return out;
}

function main() {
  const root = path.resolve(__dirname, "..");
  const reportsDir = path.resolve(process.argv[2] || path.join(root, "artifacts/scans"));
  const review = JSON.parse(fs.readFileSync(path.join(root, "imports/aoaostar/candidate-review.json"), "utf8"));
  const licenseReviewPath = path.join(root, "imports/aoaostar/license-review.json");
  const licenseReview = fs.existsSync(licenseReviewPath)
    ? JSON.parse(fs.readFileSync(licenseReviewPath, "utf8"))
    : null;
  const files = walkJsonFiles(reportsDir);
  const reports = files.map(file => JSON.parse(fs.readFileSync(file, "utf8")));
  const assessment = buildCandidateAssessment(review, reports, undefined, licenseReview);
  fs.mkdirSync(path.join(root, "imports/aoaostar"), { recursive: true });
  fs.mkdirSync(path.join(root, "reports"), { recursive: true });
  fs.writeFileSync(path.join(root, "imports/aoaostar/candidate-assessment.json"), JSON.stringify(assessment, null, 2) + "\n");
  fs.writeFileSync(path.join(root, "reports/aoaostar-candidate-assessment-summary.md"), renderSummary(assessment));
  console.log("Candidate assessment updated:", JSON.stringify(assessment.totals));
}

if (require.main === module) main();
module.exports = { buildCandidateAssessment, renderSummary };
