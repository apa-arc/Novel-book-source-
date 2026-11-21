#!/usr/bin/env node
"use strict";
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const ARTIFACTS = path.join(ROOT, "artifacts");
const SUBSCRIPTION = path.join(ROOT, "subscription.json");
const ADULT_HINT = /🔞|成人|情色|色情|R18|18\+/i;

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}
function normalizeUrl(value) {
  try {
    const u = new URL(value);
    u.hash = "";
    u.search = "";
    u.pathname = u.pathname.replace(/\/+$/, "") || "/";
    return u.href.toLowerCase();
  } catch { return ""; }
}
function validateCandidate(source, expectedAdult = false) {
  if (!fs.existsSync(path.join(ROOT, "imports/third-party/luanmuc/LICENSE"))) return false;
  if (!source || typeof source !== "object" || Array.isArray(source)) return false;
  if (source.enabled !== true || source.bookSourceType !== 0) return false;
  const isAdult = ADULT_HINT.test([source.bookSourceName, source.bookSourceGroup, source.bookSourceComment].join(" "));
  if (isAdult !== expectedAdult) return false;
  if (typeof source.bookSourceName !== "string" || !source.bookSourceName.trim()) return false;
  if (typeof source.bookSourceComment !== "string" ||
      !source.bookSourceComment.includes("luanmuc/legado-book-sources") ||
      !source.bookSourceComment.includes("MIT License")) return false;
  let base, search;
  try {
    base = new URL(source.bookSourceUrl);
    const rawSearch = String(source.searchUrl);
    const requestConfig = rawSearch.match(/^([^,]+),\s*(\{[\s\S]*\})$/);
    let searchSpec = rawSearch;
    if (requestConfig) {
      const config = JSON.parse(requestConfig[2]);
      if (!["GET","POST"].includes(String(config.method || "GET").toUpperCase()) ||
          config.webView || config.cookie || config.header ||
          (typeof config.body === "string" && /(?:token|auth|password|secret|cookie|authorization)\s*["']?\s*[:=]/i.test(config.body))) return false;
      searchSpec = requestConfig[1].trim();
    } else if (rawSearch.includes(",")) {
      searchSpec = rawSearch.split(/,(?=https?:\/\/)/i)[0].trim();
    }
    search = new URL(searchSpec, base);
  } catch { return false; }
  if (base.protocol !== "https:" || search.protocol !== "https:" || base.username || base.password || search.username || search.password) return false;
  const required = {
    ruleSearch: ["bookList", "name", "bookUrl"],
    ruleToc: ["chapterList", "chapterName", "chapterUrl"],
    ruleContent: ["content"]
  };
  for (const [group, fields] of Object.entries(required)) {
    for (const field of fields) if (typeof source[group]?.[field] !== "string" || !source[group][field].trim()) return false;
  }
  function hasCredentialKey(value) {
    if (Array.isArray(value)) return value.some(hasCredentialKey);
    if (!value || typeof value !== "object") return false;
    for (const [key, nested] of Object.entries(value)) {
      if (/cookie|authorization|access[_-]?token|password|secret|loginUrl|loginUi/i.test(key)) return true;
      if (hasCredentialKey(nested)) return true;
    }
    return false;
  }
  if (hasCredentialKey(source)) return false;
  if (/[?&](?:token|auth|password|secret|cookie)=/i.test(source.searchUrl)) return false;
  return true;
}
function collectCandidates(expectedAdult) {
  const filePattern = expectedAdult
    ? /live-functional-test-passed-adult-sources-\d+-of-\d+\.json$/
    : /live-functional-test-passed-sources-\d+-of-\d+\.json$/;
  const candidates = [];
  for (const file of walk(ARTIFACTS).filter(file => filePattern.test(file))) {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    const match = path.basename(file).match(/passed(?:-adult)?-sources-(\d+)-of-(\d+)\.json$/);
    if (!Array.isArray(parsed) || !match) continue;
    const reportPath = path.join(path.dirname(file), "live-functional-test-" + match[1] + "-of-" + match[2] + ".json");
    if (!fs.existsSync(reportPath)) continue;
    const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
    for (const source of parsed) {
      const host = (() => { try { return new URL(source.bookSourceUrl).hostname.toLowerCase(); } catch { return ""; } })();
      const result = (report.results || []).find(item =>
        item.provider === "luanmuc-candidate" &&
        item.category === (expectedAdult ? "adult" : "ordinary") &&
        item.status === "passed" && item.name === source.bookSourceName && item.host === host
      );
      const contentStage = result && (result.stages || []).find(stage => stage.name === "content");
      if (contentStage && Number(contentStage.length) >= 300) candidates.push(source);
    }
  }
  return candidates;
}
function mergeIntoSubscription(filePath, valid, expectedAdult) {
  const current = JSON.parse(fs.readFileSync(filePath, "utf8"));
  if (!Array.isArray(current)) throw new Error(path.basename(filePath) + " is not a JSON array");
  let nextOrder = current.reduce((max, source) => Math.max(max, Number(source.customOrder) || 0), 0) + 1;
  const added = [];
  const updated = [];
  for (const source of valid) {
    const keyUrl = normalizeUrl(source.bookSourceUrl);
    const keyName = source.bookSourceName.trim().toLowerCase();
    if (!keyUrl || !keyName) continue;
    const existingIndex = current.findIndex(existing =>
      normalizeUrl(existing.bookSourceUrl) === keyUrl &&
      String(existing.bookSourceName || "").trim().toLowerCase() === keyName &&
      ADULT_HINT.test([existing.bookSourceName, existing.bookSourceGroup, existing.bookSourceComment].join(" ")) === expectedAdult
    );
    if (existingIndex >= 0) {
      source.customOrder = Number(current[existingIndex].customOrder) || nextOrder++;
      current[existingIndex] = source;
      updated.push(source);
    } else {
      source.customOrder = nextOrder++;
      current.push(source);
      added.push(source);
    }
  }
  if (added.length || updated.length) {
    fs.writeFileSync(filePath, JSON.stringify(current, null, 2) + "\n", "utf8");
  }
  return {
    added: added.length,
    updated: updated.length,
    addedSources: added.map(source => ({ name: source.bookSourceName, url: source.bookSourceUrl })),
    updatedSources: updated.map(source => ({ name: source.bookSourceName, url: source.bookSourceUrl }))
  };
}
function aggregateFunctionalReports() {
  const reportFiles = walk(ARTIFACTS).filter(file => /live-functional-test-\d+-of-\d+\.json$/.test(file));
  const results = [];
  for (const file of reportFiles) {
    const report = JSON.parse(fs.readFileSync(file, "utf8"));
    if (Array.isArray(report.results)) results.push(...report.results);
  }
  const statusCounts = {};
  const providerCounts = {};
  const uniquePassed = new Map();
  let passedRecords = 0;
  for (const item of results) {
    statusCounts[item.status] = (statusCounts[item.status] || 0) + 1;
    const provider = item.provider || "unknown";
    if (!providerCounts[provider]) providerCounts[provider] = {};
    providerCounts[provider][item.status] = (providerCounts[provider][item.status] || 0) + 1;
    if (item.status !== "passed") continue;
    passedRecords++;
    const key = [item.category || "ordinary", item.host || "", item.name || ""].join("|").toLowerCase();
    const contentStage = (item.stages || []).find(stage => stage.name === "content");
    if (!uniquePassed.has(key)) {
      uniquePassed.set(key, {
        name: item.name || "",
        host: item.host || "",
        category: item.category || "ordinary",
        contentLength: contentStage ? Number(contentStage.length) || 0 : 0,
        providers: [provider]
      });
    } else if (!uniquePassed.get(key).providers.includes(provider)) {
      uniquePassed.get(key).providers.push(provider);
    }
  }
  const passedSources = Array.from(uniquePassed.values());
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    testedRecords: results.length,
    statusCounts,
    providerCounts,
    passedRecords,
    passedUniqueCount: passedSources.length,
    ordinaryPassedUnique: passedSources.filter(item => item.category === "ordinary").length,
    adultPassedUnique: passedSources.filter(item => item.category === "adult").length,
    passedUniqueSources: passedSources
  };
}

function main() {
  const functionalSummary = aggregateFunctionalReports();
  const ordinaryCandidates = collectCandidates(false);
  const ordinaryValid = ordinaryCandidates.filter(source => validateCandidate(source, false));
  const ordinary = mergeIntoSubscription(SUBSCRIPTION, ordinaryValid, false);
  const summary = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    source: "luanmuc/legado-book-sources (MIT License)",
    ordinary: {
      candidates: ordinaryCandidates.length,
      valid: ordinaryValid.length,
      ...ordinary
    },
    policy: "Only ordinary novel sources are merged. Adult sources are excluded from the repository subscription."
  };
  fs.mkdirSync(path.join(ROOT, "reports"), { recursive: true });
  fs.writeFileSync(path.join(ROOT, "reports", "verified-source-merge-summary.json"), JSON.stringify(summary, null, 2) + "\n");
  fs.writeFileSync(path.join(ROOT, "reports", "live-functional-test-summary.json"), JSON.stringify(functionalSummary, null, 2) + "\n");
  console.log(JSON.stringify({ functional: functionalSummary, merge: summary }, null, 2));
}
main();
