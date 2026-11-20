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
  if (!filePath.startsWith(root + path.sep) || !fs.existsSync(filePath)) {
    throw new Error("书源文件不存在或路径非法：" + item.file);
  }
  const source = JSON.parse(fs.readFileSync(filePath, "utf8"));

  for (const key of ["schemaVersion", "id", "name", "kind", "version", "baseUrl", "domains", "script", "enabled"]) {
    if (source[key] === undefined) throw new Error(item.file + " 缺少字段 " + key);
  }
  if (source.schemaVersion !== 1 || source.id !== item.id || source.kind !== item.kind ||
      source.enabled !== item.enabled || source.name !== item.name) {
    throw new Error(item.file + " 的版本、id、名称、kind 或 enabled 与索引不匹配");
  }
  if (!/^[a-z0-9][a-z0-9-]{2,63}$/.test(source.id)) {
    throw new Error(item.file + " id 格式错误");
  }
  if (!/^\\d+\\.\\d+\\.\\d+$/.test(source.version)) {
    throw new Error(item.file + " version 必须使用 x.y.z 格式");
  }

  const base = new URL(source.baseUrl);
  if (base.protocol !== "https:" || base.username || base.password) {
    throw new Error(item.file + " baseUrl 必须是无凭据的 HTTPS URL");
  }
  if (!Array.isArray(source.domains) || source.domains.length === 0 ||
      !source.domains.every(domain => typeof domain === "string" &&
        /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(domain))) {
    throw new Error(item.file + " domains 必须是有效主机名数组");
  }
  if (!source.domains.includes(base.hostname)) {
    throw new Error(item.file + " domains 必须包含 baseUrl 主机名");
  }

  const scriptPath = path.resolve(root, source.script);
  if (!scriptPath.startsWith(path.join(root, "scripts") + path.sep) || !fs.existsSync(scriptPath)) {
    throw new Error("解析器文件不存在或路径非法：" + source.script);
  }
  const module = { exports: {} };
  const context = vm.createContext({ module, exports: module.exports });
  const code = fs.readFileSync(scriptPath, "utf8");
  new vm.Script(code, { filename: source.script }).runInContext(context, { timeout: 1000 });
  const adapter = module.exports;
  for (const method of ["search", "getBookDetail", "getChapters", "getContent"]) {
    if (!adapter || typeof adapter[method] !== "function") {
      throw new Error(source.script + " 缺少解析器方法 " + method);
    }
  }
  console.log("OK", source.id, "-", source.name, "[" + source.kind + "]");
}
console.log("书源索引、元数据与解析器接口检查通过。");
