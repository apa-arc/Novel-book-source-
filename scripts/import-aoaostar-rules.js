#!/usr/bin/env node
"use strict";

// Mirror and split AOAOSTAR Legado rule definitions without executing them.
// Secrets and personal authentication material are stripped; sources that depend
// on login/cookies are disabled and retained for review, never silently enabled.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const ROOT = path.resolve(__dirname, "..");
const INPUT = path.join(ROOT, "imports/aoaostar/raw/aoaostar-full.json");
const OUT = path.join(ROOT, "exports");
const ROOT_ORDINARY = path.join(ROOT, "subscription.json");
const ROOT_ADULT = path.join(ROOT, "adult-subscription.json");
const REQUIRED = ["ruleSearch", "ruleBookInfo", "ruleToc", "ruleContent"];
const ADULT = /🔞|成人|色情|情色|黄文|黃文|肉文|淫秽|淫穢|R18|18\+/i;
const NON_NOVEL = /漫画|動漫|动漫|有声|听书|古籍|国学|詩詞|诗词|词典|百科|维基|公版|杂志|RSS|电子书出版/i;
const SECRET_KEY = /^(cookie|set-cookie|authorization|proxy-authorization|x-api-key|api[-_]?key|access[-_]?token|token|password|passwd|secret)$/i;

function canonical(value) {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object") {
    return "{" + Object.keys(value).sort().map(k => JSON.stringify(k) + ":" + canonical(value[k])).join(",") + "}";
  }
  return JSON.stringify(value);
}
function hasCoreRules(source) {
  return REQUIRED.every(key => source[key] && typeof source[key] === "object" && !Array.isArray(source[key]) && Object.keys(source[key]).length);
}
function scrub(source) {
  const copy = structuredClone(source);
  let credentialDependent = Boolean(copy.loginUrl || copy.loginUi || copy.loginCheckJs || copy.enabledCookieJar);
  delete copy.loginUrl;
  delete copy.loginUi;
  delete copy.loginCheckJs;
  delete copy.enabledCookieJar;
  if (copy.header && typeof copy.header === "object") {
    for (const key of Object.keys(copy.header)) {
      if (SECRET_KEY.test(key)) {
        delete copy.header[key];
        credentialDependent = true;
      }
    }
    if (!Object.keys(copy.header).length) delete copy.header;
  }
  if (credentialDependent) copy.enabled = false;
  copy.bookSourceComment = [copy.bookSourceComment, "规则快照来源：AOAOSTAR/legado；由 apa-arc/Novel-book-source- 镜像整理。已移除登录态和敏感凭据；需登录的源默认禁用。"].filter(Boolean).join("\n");
  return { source: copy, credentialDependent };
}
function main() {
  if (!fs.existsSync(INPUT)) throw new Error("缺少上游快照：" + INPUT);
  const rawText = fs.readFileSync(INPUT, "utf8");
  const parsed = JSON.parse(rawText);
  const input = Array.isArray(parsed) ? parsed : [parsed];
  const ordinary = [], adult = [], review = [];
  const seen = new Set();
  const stats = { upstreamRecords: input.length, duplicateRecords: 0, ordinary: 0, adult: 0, excludedNonNovel: 0, incompleteRules: 0, credentialDisabled: 0 };
  for (const item of input) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const key = crypto.createHash("sha256").update(canonical(item)).digest("hex");
    if (seen.has(key)) { stats.duplicateRecords++; continue; }
    seen.add(key);
    const label = [item.bookSourceName, item.bookSourceGroup, item.bookSourceComment, item.bookSourceUrl].filter(Boolean).join(" ");
    if (NON_NOVEL.test(label)) { stats.excludedNonNovel++; continue; }
    if (!hasCoreRules(item)) { stats.incompleteRules++; continue; }
    const result = scrub(item);
    if (result.credentialDependent) stats.credentialDisabled++;
    if (ADULT.test(label)) { adult.push(result.source); stats.adult++; }
    else { ordinary.push(result.source); stats.ordinary++; }
  }
  fs.mkdirSync(OUT, { recursive: true });
  const write = (name, data) => fs.writeFileSync(path.join(OUT, name), JSON.stringify(data, null, 2) + "\n");
  write("legado-ordinary.json", ordinary);
  write("legado-adult.json", adult);
  // The stable public subscription URLs are native Legado JSON arrays.
  fs.writeFileSync(ROOT_ORDINARY, JSON.stringify(ordinary, null, 2) + "\n");
  fs.writeFileSync(ROOT_ADULT, JSON.stringify(adult, null, 2) + "\n");
  write("aoaostar-import-report.json", {
    schemaVersion: 1,
    sourceSha256: crypto.createHash("sha256").update(rawText).digest("hex"),
    upstream: "https://github.com/aoaostar/legado",
    upstreamFile: "sources/b778fe6b.json",
    upstreamLicenseNotice: "Upstream repository declares AGPL-3.0; individual source-rule provenance and redistribution permissions are not independently verified.",
    format: "Legado bookSource JSON array; original rule groups are retained and not executed by this script.",
    sanitization: "Login UI/checks, cookie jars and sensitive authentication header fields are removed. Sources requiring those credentials are disabled.",
    stats,
    outputs: {
      ordinary: "exports/legado-ordinary.json",
      adult: "exports/legado-adult.json"
    }
  });
  console.log(JSON.stringify(stats, null, 2));
}
main();
