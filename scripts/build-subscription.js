"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { validateSourceQuality } = require("../runtime/source-quality-gate");

const RAW_BASE = "https://raw.githubusercontent.com/apa-arc/Novel-book-source-/main/";

function buildSubscription(index, root, updatedAt = new Date().toISOString()) {
  if (!index || index.schemaVersion !== 1 || !Array.isArray(index.sources)) {
    throw new Error("index.json 格式错误");
  }
  const seen = new Set();
  const sources = [];
  for (const item of index.sources) {
    if (!item || typeof item.id !== "string" || seen.has(item.id)) {
      throw new Error("书源索引包含无效或重复 ID");
    }
    seen.add(item.id);
    if (item.enabled !== true) continue;

    if (typeof item.file !== "string" || !item.file.startsWith("sources/")) {
      throw new Error("启用书源元数据路径非法：" + item.id);
    }
    const metadataPath = path.resolve(root, item.file);
    if (!metadataPath.startsWith(path.join(root, "sources") + path.sep) || !fs.existsSync(metadataPath)) {
      throw new Error("启用书源元数据不存在或路径非法：" + item.id);
    }
    const meta = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
    validateSourceQuality(meta, root);
    if (meta.schemaVersion !== 1 || meta.id !== item.id || meta.enabled !== true ||
        meta.name !== item.name || meta.kind !== item.kind) {
      throw new Error("书源元数据与索引不一致：" + item.id);
    }
    if (typeof meta.version !== "string" || !/^\d+\.\d+\.\d+$/.test(meta.version)) {
      throw new Error("书源版本号无效：" + item.id);
    }
    if (typeof meta.baseUrl !== "string") throw new Error("书源 baseUrl 无效：" + item.id);
    const base = new URL(meta.baseUrl);
    if (base.protocol !== "https:" || base.username || base.password ||
        !Array.isArray(meta.domains) || !meta.domains.includes(base.hostname)) {
      throw new Error("书源地址或域名白名单无效：" + item.id);
    }

    if (typeof meta.script !== "string" || !meta.script.startsWith("scripts/")) {
      throw new Error("书源解析器路径非法：" + item.id);
    }
    const scriptPath = path.resolve(root, meta.script);
    if (!scriptPath.startsWith(path.join(root, "scripts") + path.sep) || !fs.existsSync(scriptPath)) {
      throw new Error("书源解析器不存在：" + item.id);
    }

    sources.push({
      id: meta.id,
      name: meta.name,
      kind: meta.kind,
      version: meta.version,
      description: meta.description || "",
      baseUrl: meta.baseUrl,
      domains: meta.domains,
      categories: Array.isArray(meta.categories) ? meta.categories : [],
      metadataUrl: RAW_BASE + item.file,
      scriptUrl: RAW_BASE + meta.script,
      ...(meta.appConfig ? { appConfig: meta.appConfig } : {})
    });
  }

  return {
    schemaVersion: 1,
    subscriptionId: "apa-arc-novel-book-source",
    name: "个人小说书源",
    description: "GitHub 托管的小说书源订阅清单",
    repository: "https://github.com/apa-arc/Novel-book-source-",
    updatedAt,
    sourceCount: sources.length,
    sources
  };
}

function main() {
  const root = path.resolve(__dirname, "..");
  const index = JSON.parse(fs.readFileSync(path.join(root, "index.json"), "utf8"));
  const output = buildSubscription(index, root);
  fs.writeFileSync(path.join(root, "subscription.json"), JSON.stringify(output, null, 2) + "\n");
  console.log("订阅清单已生成：", output.sourceCount, "个已启用书源");
}

module.exports = { buildSubscription };
if (require.main === module) main();
