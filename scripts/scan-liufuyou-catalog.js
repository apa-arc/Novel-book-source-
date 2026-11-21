#!/usr/bin/env node
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const ROOT = path.resolve(__dirname, "..");
const UPSTREAM = [
  { name: "YCK 书单 1067", url: "https://raw.githubusercontent.com/liufuyou/read/main/sources/yck-novel.json" },
  { name: "Yiove 星辰整理", url: "https://raw.githubusercontent.com/liufuyou/read/main/sources/yiove-novel.json" },
  { name: "Daiaji LegadoSource", url: "https://raw.githubusercontent.com/daiaji/LegadoSource/main/%E4%B9%A6%E6%BA%90.json" }
];
const ADULT = /🔞|成人|色情|情色|R18|18\+|18禁|PO18|肉文|淫秽|色情小说/i;
const NON_NOVEL = /漫画|動漫|动漫|有声|听书|古籍|国学|诗词|詞典|词典|百科|维基|公版|杂志|影视|短剧|网盘|音乐|播客|英文|English|日语|Japanese|原版小说/i;
const SECRET = /cookie|authorization|access[_-]?token|password|secret|login/i;

async function fetchJson(item) {
  const url = new URL(item.url);
  const repo = url.pathname.split("/").slice(1, 3).join("/");
  if (url.protocol !== "https:" || url.hostname !== "raw.githubusercontent.com" ||
      !new Set(["liufuyou/read", "daiaji/LegadoSource"]).has(repo)) {
    throw new Error("upstream-url-rejected");
  }
  const response = await fetch(url, { signal: AbortSignal.timeout(60000), headers: { "user-agent": "NovelSourceMetadataScanner/1.0" } });
  if (!response.ok) throw new Error(item.name + ": HTTP " + response.status);
  const body = await response.text();
  if (Buffer.byteLength(body, "utf8") > 20 * 1024 * 1024) throw new Error(item.name + ": response-too-large");
  const parsed = JSON.parse(body);
  if (!Array.isArray(parsed)) throw new Error(item.name + ": expected-source-array");
  return parsed;
}
function normalizeBase(value) {
  try {
    const url = new URL(String(value || "").trim());
    url.hash = "";
    url.search = "";
    if (url.protocol !== "https:" || url.username || url.password ||
        !url.hostname.includes(".") || /^\d{1,3}(\.\d{1,3}){3}$/.test(url.hostname)) return null;
    return url.origin + "/";
  } catch { return null; }
}
function stableId(name, baseUrl) {
  return crypto.createHash("sha256").update(name + "|" + baseUrl).digest("hex").slice(0, 16);
}
function simpleGetSearch(source) {
  const raw = String(source.searchUrl || "").trim();
  if (!raw || SECRET.test(raw) || /@js:|<js>|webView/i.test(raw) || /,\s*\{[\s\S]*?method\s*['"]?\s*:\s*['"]POST/i.test(raw)) return false;
  if (/^https?:\/\//i.test(raw)) {
    try { const u = new URL(raw.replace(/\{\{\s*key\s*\}\}/g, "x").replace(/\{\{\s*page\s*\}\}/g, "1")); return u.protocol === "https:"; }
    catch { return false; }
  }
  return raw.startsWith("/") || raw.startsWith("?");
}
async function main() {
  const stats = { upstreamRecords: 0, nonText: 0, nonNovel: 0, adult: 0, cookieOrSecret: 0, nonGetOrScript: 0, nonHttps: 0, duplicateHost: 0, accepted: 0 };
  const byHost = new Map();
  for (const item of UPSTREAM) {
    const records = await fetchJson(item);
    stats.upstreamRecords += records.length;
    for (const source of records) {
      if (!source || typeof source !== "object" || Array.isArray(source)) continue;
      if (Number(source.bookSourceType ?? 0) !== 0) { stats.nonText++; continue; }
      const name = String(source.bookSourceName || "").trim();
      const group = String(source.bookSourceGroup || "");
      const comment = String(source.bookSourceComment || "");
      if (ADULT.test([name, group, comment].join(" "))) { stats.adult++; continue; }
      if (NON_NOVEL.test([name, group, comment].join(" "))) { stats.nonNovel++; continue; }
      if (source.enabledCookieJar === true || SECRET.test(JSON.stringify({ header: source.header, searchUrl: source.searchUrl, comment }))) { stats.cookieOrSecret++; continue; }
      if (!simpleGetSearch(source)) { stats.nonGetOrScript++; continue; }
      const baseUrl = normalizeBase(source.bookSourceUrl);
      if (!baseUrl) { stats.nonHttps++; continue; }
      const host = new URL(baseUrl).hostname.toLowerCase();
      const candidate = { id: stableId(name, baseUrl), name, baseUrl, group: group.slice(0, 80), upstream: item.name, redistributionStatus: "not-assessed", runtimeStatus: "not-converted" };
      if (byHost.has(host)) { stats.duplicateHost++; continue; }
      byHost.set(host, candidate);
    }
  }
  const sources = [...byHost.values()].sort((a, b) => a.name.localeCompare(b.name, "zh-Hans"));
  stats.accepted = sources.length;
  const output = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    provider: "liufuyou/read metadata-only discovery",
    upstream: UPSTREAM.map(x => x.url),
    licenseNote: "Only candidate names, HTTPS base URLs and group labels are retained. No upstream rules or source code are copied. The Liufuyou collection notes that source-rule rights belong to original organizers; Daiaji repository is AGPL-3.0. Source-level redistribution and site-use permissions remain unassessed.",
    filterStats: stats,
    sourceCount: sources.length,
    sources
  };
  const out = path.join(ROOT, "imports/third-party/liufuyou/candidate-catalog.json");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(output, null, 2) + "\n");
  console.log(JSON.stringify({ ...stats, output: "imports/third-party/liufuyou/candidate-catalog.json" }, null, 2));
}
main().catch(error => { console.error(error); process.exit(1); });
