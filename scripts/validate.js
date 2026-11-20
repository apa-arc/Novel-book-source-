const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const index = JSON.parse(fs.readFileSync(path.join(root, "index.json"), "utf8"));

if (index.schemaVersion !== 1 || !Array.isArray(index.sources)) {
  throw new Error("index.json 格式错误：需要 schemaVersion=1 和 sources 数组");
}

const ids = new Set();
for (const item of index.sources) {
  if (!item.id || !item.file || typeof item.enabled !== "boolean" ||
      !["official", "public-web"].includes(item.kind)) {
    throw new Error("索引项缺少有效的 id、file、enabled 或 kind");
  }
  if (ids.has(item.id)) throw new Error("书源 id 重复：" + item.id);
  ids.add(item.id);

  const filePath = path.resolve(root, item.file);
  if (!filePath.startsWith(root + path.sep)) throw new Error("非法书源路径：" + item.file);
  const source = JSON.parse(fs.readFileSync(filePath, "utf8"));

  for (const key of ["schemaVersion", "id", "name", "kind", "version", "baseUrl", "domains", "script", "enabled"]) {
    if (source[key] === undefined) throw new Error(item.file + " 缺少字段 " + key);
  }
  if (source.schemaVersion !== 1 || source.id !== item.id || source.kind !== item.kind) {
    throw new Error(item.file + " 的 schemaVersion、id 或 kind 与索引不匹配");
  }
  const base = new URL(source.baseUrl);
  if (base.protocol !== "https:") throw new Error(item.file + " 必须使用 HTTPS");
  if (!Array.isArray(source.domains) || source.domains.length === 0) {
    throw new Error(item.file + " domains 必须是非空数组");
  }
  if (!source.domains.includes(base.hostname)) {
    throw new Error(item.file + " domains 必须包含 baseUrl 主机名");
  }

  const scriptPath = path.resolve(root, source.script);
  if (!scriptPath.startsWith(path.join(root, "scripts") + path.sep)) {
    throw new Error("解析器必须位于 scripts/：" + source.script);
  }
  new vm.Script(fs.readFileSync(scriptPath, "utf8"), { filename: source.script });
  console.log("OK", source.id, "-", source.name, "[" + source.kind + "]");
}
console.log("书源索引与脚本语法检查通过。");
