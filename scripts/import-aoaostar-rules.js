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
const TICKMAO_VERIFIED = path.join(ROOT, "imports/third-party/tickmao/verified-safe.json");
const REQUIRED = ["ruleSearch", "ruleBookInfo", "ruleToc", "ruleContent"];
const ADULT = /🔞|成人|色情|情色|黄文|黃文|肉文|淫秽|淫穢|R18|18\+/i;
const NON_NOVEL = /漫画|動漫|动漫|有声|听书|古籍|国学|詩詞|诗词|词典|百科|维基|公版|杂志|RSS|电子书出版|电影|電影|影视|影視|视频|視頻|播放器|直播|短剧|短視頻|短视频|音乐|音樂|播客|电台|電台/i;
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
function sourceUrlKey(value) {
  const raw = String(value || "").trim();
  try {
    const url = new URL(raw);
    return url.hostname.toLowerCase() + url.pathname.replace(/\/+$/, "") + url.search;
  } catch {
    return raw.replace(/#.*$/, "").replace(/\/+$/, "").toLowerCase();
  }
}
function isSafeThirdPartySource(source) {
  if (!source || typeof source !== "object" || Array.isArray(source)) return false;
  if (source.enabled !== true || source.bookSourceType !== 0 || !hasCoreRules(source)) return false;
  const label = [source.bookSourceName, source.bookSourceGroup, source.bookSourceComment, source.bookSourceUrl].filter(Boolean).join(" ");
  if (ADULT.test(label) || NON_NOVEL.test(label)) return false;
  if (source.loginUrl || source.loginUi || source.loginCheckJs || source.enabledCookieJar) return false;
  if (source.header) {
    const rawHeader = typeof source.header === "string" ? source.header : JSON.stringify(source.header);
    if (/@js:|<js>|cookie|authorization|proxy-authorization|token|password|passwd|secret|api[-_]?key/i.test(rawHeader)) return false;
    if (typeof source.header === "string" && !/^\s*\{[\s\S]*\}\s*$/.test(source.header)) return false;
  }
  let url;
  try { url = new URL(source.bookSourceUrl); } catch { return false; }
  if (!["http:", "https:"].includes(url.protocol) || !url.hostname || url.username || url.password || url.hostname === "localhost" || url.hostname.endsWith(".local")) return false;
  if (/^\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?$/.test(url.hostname)) return false;
  return true;
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
  let thirdPartyAdded = 0;
  let thirdPartyDuplicates = 0;
  let thirdPartyRejected = 0;
  let thirdPartyRecords = 0;
  if (fs.existsSync(TICKMAO_VERIFIED)) {
    const thirdPartyParsed = JSON.parse(fs.readFileSync(TICKMAO_VERIFIED, "utf8"));
    const thirdParty = Array.isArray(thirdPartyParsed) ? thirdPartyParsed : [thirdPartyParsed];
    thirdPartyRecords = thirdParty.length;
    const existingUrls = new Set(ordinary.map(item => sourceUrlKey(item.bookSourceUrl)));
    for (const item of thirdParty) {
      if (!isSafeThirdPartySource(item)) { thirdPartyRejected++; continue; }
      const key = sourceUrlKey(item.bookSourceUrl);
      if (existingUrls.has(key)) { thirdPartyDuplicates++; continue; }
      ordinary.push(item);
      existingUrls.add(key);
      thirdPartyAdded++;
    }
  }
  stats.ordinary = ordinary.length;
  stats.thirdPartyVerifiedSourceRecords = thirdPartyRecords;
  stats.thirdPartyVerifiedAdded = thirdPartyAdded;
  stats.thirdPartyVerifiedDuplicates = thirdPartyDuplicates;
  stats.thirdPartyVerifiedRejected = thirdPartyRejected;
  fs.mkdirSync(OUT, { recursive: true });
  const write = (name, data) => fs.writeFileSync(path.join(OUT, name), JSON.stringify(data, null, 2) + "\n");
  write("legado-ordinary.json", ordinary);
  // Export only to the isolated Legado archive. Never overwrite the AppleNovelApp
  // native subscription or publish adult-source subscriptions from this importer.
  write("aoaostar-import-report.json", {
    schemaVersion: 1,
    sourceSha256: crypto.createHash("sha256").update(rawText).digest("hex"),
    upstream: "https://github.com/aoaostar/legado",
    upstreamFile: "sources/b778fe6b.json",
    upstreamLicenseNotice: "Upstream repository declares AGPL-3.0; individual source-rule provenance and redistribution permissions are not independently verified.",
    format: "Legado bookSource JSON array; original rule groups are retained and not executed by this script.",
    thirdParty: {
      upstream: "https://github.com/tickmao/Novel",
      upstreamCommit: "7c2c4abd7f17d0124e30dbd9e01ea2e18d1349de",
      license: "MIT; upstream README/CREDITS restrict this collection to non-commercial learning and sharing; original source copyrights remain with their authors.",
      validation: "Current published healthy Legado set; engine commit 3cb7acb2a2892e71184c1dd12c8e8d7b5a60fbb7; validator legado-reading-v6:3cb7acb2a289; runtime fingerprint 5b6e2a468ed2b001d8b2cab608f6ca75af9ed467bdeaa9674860db1fd4422e92.",
      manifest: "imports/third-party/tickmao/validation-manifest.json",
      input: "imports/third-party/tickmao/verified-safe.json",
      records: thirdPartyRecords,
      added: thirdPartyAdded,
      duplicates: thirdPartyDuplicates,
      rejected: thirdPartyRejected
    },
    sanitization: "Login UI/checks, cookie jars and sensitive authentication header fields are removed. Sources requiring those credentials are disabled.",
    stats,
    outputs: {
      ordinary: "exports/legado-ordinary.json",
    }
  });
  console.log(JSON.stringify(stats, null, 2));
}
main();
