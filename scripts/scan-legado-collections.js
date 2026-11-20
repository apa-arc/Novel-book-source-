#!/usr/bin/env node
"use strict";

// Fetch and inspect public Legado collections without executing any source rules.
// Only a sanitized report is produced; raw rules, headers, cookies and credentials
// are never written into this repository.
const fs = require("node:fs");
const path = require("node:path");

const catalogPath = path.join(__dirname, "..", "imports", "aoaostar", "catalog.json");
const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
const ruleKeys = ["ruleSearch", "ruleBookInfo", "ruleToc", "ruleContent", "ruleExplore"];
const scriptPattern = /@js:|<js>|\bjava\s*script\b|\b(function|return)\b|\$\{/i;
const MAX_BYTES = 50 * 1024 * 1024;

function containsScriptLikeValue(value) {
  if (typeof value === "string") return scriptPattern.test(value);
  if (Array.isArray(value)) return value.some(containsScriptLikeValue);
  if (value && typeof value === "object") return Object.values(value).some(containsScriptLikeValue);
  return false;
}

function analyze(source, index, collection) {
  const rules = ruleKeys.map((key) => source[key]).filter((value) => value !== undefined && value !== null);
  const hasScript = rules.some(containsScriptLikeValue);
  const hasLogin = Boolean(source.loginUrl || source.loginUi || source.loginCheckJs);
  const hasCookie = Boolean(source.enabledCookieJar ||
    Object.keys(source.header || {}).some((key) => /cookie/i.test(key)));
  const hasHttpUrl = typeof source.bookSourceUrl === "string" && /^https:\/\//i.test(source.bookSourceUrl);
  const advanced = hasScript || hasLogin || hasCookie;
  let level = "low";
  if (advanced) level = "manual";
  else if (hasHttpUrl && rules.length === ruleKeys.length) level = "candidate";
  else if (hasHttpUrl && rules.length >= 3) level = "partial";

  return {
    collectionId: collection.id,
    collectionName: collection.name,
    index: index + 1,
    name: typeof source.bookSourceName === "string" ? source.bookSourceName : "(未命名)",
    baseUrl: hasHttpUrl ? new URL(source.bookSourceUrl).origin : null,
    group: typeof source.bookSourceGroup === "string" ? source.bookSourceGroup : null,
    ruleCount: rules.length,
    hasScript,
    hasLogin,
    hasCookie,
    level
  };
}

async function fetchCollection(collection) {
  const url = new URL(collection.url);
  if (url.protocol !== "https:" || url.hostname !== "raw.githubusercontent.com" ||
      url.pathname.split("/").slice(1, 3).join("/") !== "aoaostar/legado") {
    throw new Error("来源地址不在允许的 GitHub 仓库范围内");
  }

  const response = await fetch(url, { signal: AbortSignal.timeout(45000) });
  if (!response.ok) throw new Error("HTTP " + response.status);
  const declaredLength = Number(response.headers.get("content-length") || 0);
  if (declaredLength > MAX_BYTES) throw new Error("文件超过 50 MB 安全上限");
  const text = await response.text();
  if (Buffer.byteLength(text, "utf8") > MAX_BYTES) throw new Error("文件超过 50 MB 安全上限");

  const parsed = JSON.parse(text);
  const sources = Array.isArray(parsed) ? parsed : [parsed];
  if (!sources.length || sources.some((item) => !item || typeof item !== "object" || Array.isArray(item))) {
    throw new Error("JSON 顶层不是书源对象数组");
  }
  return sources.map((source, index) => analyze(source, index, collection));
}

async function main() {
  const report = {
    generatedAt: new Date().toISOString(),
    provider: catalog.provider,
    upstreamRepository: catalog.upstreamRepository,
    policy: "只读扫描；不执行规则；不保存原始规则、Cookie、请求头或凭据",
    totals: { collections: catalog.collections.length, scannedCollections: 0, sources: 0,
      candidate: 0, partial: 0, manual: 0, low: 0, failedCollections: 0 },
    failures: [],
    sources: []
  };

  for (const collection of catalog.collections) {
    try {
      const items = await fetchCollection(collection);
      report.totals.scannedCollections++;
      report.totals.sources += items.length;
      for (const item of items) report.totals[item.level]++;
      report.sources.push(...items);
      console.log("已扫描：" + collection.name + "（" + items.length + " 条）");
    } catch (error) {
      report.totals.failedCollections++;
      report.failures.push({ id: collection.id, name: collection.name, error: error.message });
      console.error("扫描失败：" + collection.name + "：" + error.message);
    }
  }

  const outputArg = process.argv.find((arg) => arg.startsWith("--output="));
  if (outputArg) {
    const outputPath = path.resolve(process.cwd(), outputArg.slice("--output=".length));
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(report, null, 2) + "\n", "utf8");
    console.log("报告已写入：" + outputPath);
  } else if (process.argv.includes("--json")) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log("\n扫描汇总");
    console.log(JSON.stringify(report.totals, null, 2));
    if (report.failures.length) process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("扫描程序异常：" + error.message);
  process.exitCode = 1;
});
