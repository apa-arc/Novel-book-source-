#!/usr/bin/env node
"use strict";
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const ARTIFACTS = path.join(ROOT, "artifacts");
const SUBSCRIPTION = path.join(ROOT, "subscription.json");
const ADULT_HINT = /成人|情色|色情|R18|18\+/i;

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
function validateCandidate(source) {
  if (!source || typeof source !== "object" || Array.isArray(source)) return false;
  if (source.enabled !== true || source.bookSourceType !== 0) return false;
  if (ADULT_HINT.test([source.bookSourceName, source.bookSourceGroup, source.bookSourceComment].join(" "))) return false;
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
          (typeof config.body === "string" && /(?:token|auth|password|secret|cookie|authorization)\\s*["']?\\s*[:=]/i.test(config.body))) return false;
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
function main() {
  const candidates = [];
  for (const file of walk(ARTIFACTS).filter(file => /live-functional-test-passed-sources-\d+-of-\d+\.json$/.test(file))) {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    const match = path.basename(file).match(/passed-sources-(\d+)-of-(\d+)\.json$/);
    if (!Array.isArray(parsed) || !match) continue;
    const reportPath = path.join(path.dirname(file), `live-functional-test-${match[1]}-of-${match[2]}.json`);
    if (!fs.existsSync(reportPath)) continue;
    const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
    for (const source of parsed) {
      const host = (() => { try { return new URL(source.bookSourceUrl).hostname.toLowerCase(); } catch { return ""; } })();
      const result = (report.results || []).find(item =>
        item.provider === "luanmuc-candidate" && item.status === "passed" &&
        item.name === source.bookSourceName && item.host === host
      );
      const contentStage = result && (result.stages || []).find(stage => stage.name === "content");
      // A 150-character stub is not enough evidence for a usable novel chapter.
      if (contentStage && Number(contentStage.length) >= 300) candidates.push(source);
    }
  }
  const valid = candidates.filter(validateCandidate);
  if (!valid.length) {
    console.log(JSON.stringify({ candidates: candidates.length, valid: 0, added: 0, note: "No new MIT-attributed ordinary sources passed all four live stages." }));
    return;
  }
  const current = JSON.parse(fs.readFileSync(SUBSCRIPTION, "utf8"));
  if (!Array.isArray(current)) throw new Error("ordinary subscription is not a JSON array");
  const seen = new Set(current.map(source => normalizeUrl(source.bookSourceUrl) + "|" + String(source.bookSourceName || "").trim().toLowerCase()));
  let nextOrder = current.reduce((max, source) => Math.max(max, Number(source.customOrder) || 0), 0) + 1;
  const added = [];
  for (const source of valid) {
    const key = normalizeUrl(source.bookSourceUrl) + "|" + source.bookSourceName.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    source.customOrder = nextOrder++;
    added.push(source);
  }
  if (added.length) {
    fs.writeFileSync(SUBSCRIPTION, JSON.stringify(current.concat(added), null, 2) + "\n", "utf8");
  }
  const summary = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    source: "luanmuc/legado-book-sources (MIT License)",
    candidates: candidates.length,
    valid: valid.length,
    added: added.length,
    addedSources: added.map(source => ({ name: source.bookSourceName, url: source.bookSourceUrl }))
  };
  fs.mkdirSync(path.join(ROOT, "reports"), { recursive: true });
  fs.writeFileSync(path.join(ROOT, "reports", "verified-source-merge-summary.json"), JSON.stringify(summary, null, 2) + "\n");
  console.log(JSON.stringify(summary, null, 2));
}
main();
