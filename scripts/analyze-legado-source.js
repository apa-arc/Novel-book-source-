#!/usr/bin/env node
"use strict";

// Read-only analyzer for Legado/阅读 source JSON.
// It parses data only: it never evaluates rule expressions or makes network requests.
const fs = require("node:fs");
const path = require("node:path");

function fail(message) {
  console.error("错误：" + message);
  process.exit(1);
}

const args = process.argv.slice(2);
const inputArg = args.find((arg) => !arg.startsWith("--"));
const jsonOutput = args.includes("--json");
if (!inputArg) {
  console.error("用法：node scripts/analyze-legado-source.js <书源JSON文件> [--json]");
  process.exit(2);
}

const inputPath = path.resolve(process.cwd(), inputArg);
if (!fs.existsSync(inputPath) || !fs.statSync(inputPath).isFile()) {
  fail("找不到文件：" + inputPath);
}

let parsed;
try {
  parsed = JSON.parse(fs.readFileSync(inputPath, "utf8"));
} catch (error) {
  fail("JSON 解析失败：" + error.message);
}

const sources = Array.isArray(parsed) ? parsed : [parsed];
if (sources.length === 0 || sources.some((item) => !item || typeof item !== "object" || Array.isArray(item))) {
  fail("顶层必须是书源对象，或由书源对象组成的数组");
}

const ruleKeys = ["ruleSearch", "ruleBookInfo", "ruleToc", "ruleContent", "ruleExplore"];
const scriptPattern = /@js:|<js>|\bjava\s*script\b|\b(function|return)\b|\$\{/i;

function containsScriptLikeValue(value) {
  if (typeof value === "string") return scriptPattern.test(value);
  if (Array.isArray(value)) return value.some(containsScriptLikeValue);
  if (value && typeof value === "object") return Object.values(value).some(containsScriptLikeValue);
  return false;
}

function analyze(source, index) {
  const rules = {};
  for (const key of ruleKeys) {
    const value = source[key];
    rules[key] = {
      present: value !== undefined && value !== null,
      fields: value && typeof value === "object" && !Array.isArray(value) ? Object.keys(value).length : 0,
      scriptLike: value !== undefined && containsScriptLikeValue(value)
    };
  }

  const hasLoginConfig = Boolean(source.loginUrl || source.loginUi || source.loginCheckJs);
  const hasHeader = Boolean(source.header && Object.keys(source.header).length);
  const hasCookieConfig = Boolean(source.enabledCookieJar || (source.header && Object.keys(source.header).some((key) => /cookie/i.test(key))));
  const hasHttpUrl = typeof source.bookSourceUrl === "string" && /^https?:\/\//i.test(source.bookSourceUrl);
  const ruleCount = Object.values(rules).filter((rule) => rule.present).length;
  const hasScriptRules = Object.values(rules).some((rule) => rule.scriptLike);
  const hasAdvancedConfig = hasLoginConfig || hasCookieConfig || hasScriptRules;

  let compatibility = "low";
  let reason = "缺少关键规则或来源地址，需人工检查";
  if (hasHttpUrl && ruleCount === ruleKeys.length && !hasAdvancedConfig) {
    compatibility = "candidate";
    reason = "核心规则字段齐全，未发现明显登录态或脚本依赖；仍需检查具体规则语法";
  } else if (hasHttpUrl && ruleCount >= 3 && !hasAdvancedConfig) {
    compatibility = "partial";
    reason = "存在部分核心规则，可进一步评估静态规则转换";
  } else if (hasAdvancedConfig) {
    compatibility = "manual";
    reason = "检测到登录、Cookie 或脚本类配置，禁止自动执行，需人工评估";
  }

  return {
    index: index + 1,
    name: typeof source.bookSourceName === "string" ? source.bookSourceName : "(未命名)",
    url: typeof source.bookSourceUrl === "string" ? source.bookSourceUrl : null,
    group: typeof source.bookSourceGroup === "string" ? source.bookSourceGroup : null,
    hasValidHttpUrl: hasHttpUrl,
    ruleCount,
    rules,
    hasLoginConfig,
    hasHeader,
    hasCookieConfig,
    hasScriptRules,
    compatibility,
    reason
  };
}

const report = {
  analyzerVersion: 1,
  inputFile: path.basename(inputPath),
  sourceCount: sources.length,
  compatibilityCounts: { candidate: 0, partial: 0, manual: 0, low: 0 },
  sources: sources.map(analyze)
};
for (const item of report.sources) report.compatibilityCounts[item.compatibility]++;

if (jsonOutput) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log("阅读书源只读分析报告");
  console.log("文件：" + report.inputFile);
  console.log("书源数量：" + report.sourceCount);
  console.log("初步分级：候选 " + report.compatibilityCounts.candidate +
    " / 部分兼容 " + report.compatibilityCounts.partial +
    " / 人工评估 " + report.compatibilityCounts.manual +
    " / 信息不足 " + report.compatibilityCounts.low);
  console.log("");
  for (const item of report.sources) {
    console.log("[" + item.compatibility.toUpperCase() + "] " + item.name);
    console.log("  网址：" + (item.url || "未提供"));
    console.log("  分组：" + (item.group || "未分组") + "；规则组：" + item.ruleCount + "/" + ruleKeys.length);
    console.log("  登录配置：" + (item.hasLoginConfig ? "有" : "无") +
      "；Cookie 配置：" + (item.hasCookieConfig ? "有" : "无") +
      "；脚本特征：" + (item.hasScriptRules ? "有" : "未检测到"));
    console.log("  结论：" + item.reason);
  }
  console.log("");
  console.log("注意：分级仅用于筛选，不代表规则已经可运行。分析器不会执行规则、读取网络或输出 Cookie 值。");
}
