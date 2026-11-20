const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const indexPath = path.join(root, "index.json");
const outputPath = path.join(root, "subscription.json");
const index = JSON.parse(fs.readFileSync(indexPath, "utf8"));

if (index.schemaVersion !== 1 || !Array.isArray(index.sources)) {
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

  const metadataPath = path.resolve(root, item.file || "");
  if (!metadataPath.startsWith(path.join(root, "sources") + path.sep) || !fs.existsSync(metadataPath)) {
    throw new Error("启用书源元数据不存在或路径非法：" + item.id);
  }
  const meta = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
  if (meta.id !== item.id || meta.enabled !== true || meta.name !== item.name) {
    throw new Error("书源元数据与索引不一致：" + item.id);
  }
  if (typeof meta.script !== "string" || !meta.script.startsWith("scripts/")) {
    throw new Error("书源解析器路径非法：" + item.id);
  }
  const scriptPath = path.resolve(root, meta.script);
  if (!scriptPath.startsWith(path.join(root, "scripts") + path.sep) || !fs.existsSync(scriptPath)) {
    throw new Error("书源解析器不存在：" + item.id);
  }

  const base = new URL(meta.baseUrl);
  if (base.protocol !== "https:" || !Array.isArray(meta.domains) || !meta.domains.includes(base.hostname)) {
    throw new Error("书源地址或域名白名单无效：" + item.id);
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
    metadataUrl: "https://raw.githubusercontent.com/apa-arc/Novel-book-source-/main/" + item.file,
    scriptUrl: "https://raw.githubusercontent.com/apa-arc/Novel-book-source-/main/" + meta.script
  });
}

const output = {
  schemaVersion: 1,
  subscriptionId: "apa-arc-novel-book-source",
  name: "个人小说书源",
  description: "GitHub 托管的小说书源订阅清单",
  repository: "https://github.com/apa-arc/Novel-book-source-",
  updatedAt: new Date().toISOString(),
  sourceCount: sources.length,
  sources
};

fs.writeFileSync(outputPath, JSON.stringify(output, null, 2) + "\n");
console.log("订阅清单已生成：", sources.length, "个已启用书源");
