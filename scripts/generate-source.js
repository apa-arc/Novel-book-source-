#!/usr/bin/env node
"use strict";

// Batch-generate repository-native adapters from explicitly reviewed local manifests.
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const ID_RE = /^[a-z0-9][a-z0-9-]{2,63}$/;
const HOST_RE = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;

function fail(message) { throw new Error(message); }

function validateAppConfig(value, base, domains) {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("app-config-must-be-object");
  const endpoints = ["searchUrl", "bookUrl", "chapterListUrl", "chapterUrl"];
  const output = {};
  for (const key of endpoints) {
    if (typeof value[key] !== "string" || !value[key].trim() || value[key].length > 2000) {
      fail("app-config-missing-or-invalid:" + key);
    }
    let endpoint;
    try { endpoint = new URL(value[key], base); } catch { fail("app-config-invalid-url:" + key); }
    if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password ||
        !domains.includes(endpoint.hostname.toLowerCase())) {
      fail("app-config-url-outside-https-domain-allowlist:" + key);
    }
    output[key] = value[key];
  }

  if (value.htmlRules !== undefined) {
    const rules = value.htmlRules;
    if (!rules || typeof rules !== "object" || Array.isArray(rules)) fail("app-html-rules-must-be-object");
    const groups = {
      search: { required: ["itemSelector", "titleSelector", "urlSelector"], allowed: ["itemSelector", "titleSelector", "urlSelector", "authorSelector", "descriptionSelector", "urlAttribute", "coverSelector", "coverAttribute"] },
      detail: { required: [], allowed: ["titleSelector", "authorSelector", "descriptionSelector"] },
      chapters: { required: ["itemSelector", "titleSelector", "urlSelector"], allowed: ["itemSelector", "titleSelector", "urlSelector", "urlAttribute"] },
      content: { required: ["contentSelector"], allowed: ["contentSelector", "titleSelector"] },
    };
    const normalized = {};
    for (const [group, spec] of Object.entries(groups)) {
      if (rules[group] === undefined) continue;
      const raw = rules[group];
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) fail("app-html-rules-invalid-group:" + group);
      const item = {};
      for (const key of Object.keys(raw)) {
        if (!spec.allowed.includes(key)) fail("app-html-rules-unknown-field:" + group + "." + key);
      }
      for (const key of spec.allowed) {
        if (raw[key] === undefined) continue;
        if (typeof raw[key] !== "string" || !raw[key].trim() || raw[key].length > 300) {
          fail("app-html-rules-invalid-selector:" + group + "." + key);
        }
        item[key] = raw[key].trim();
      }
      for (const key of spec.required) if (!item[key]) fail("app-html-rules-missing-selector:" + group + "." + key);
      normalized[group] = item;
    }
    if (!Object.keys(normalized).length) fail("app-html-rules-empty");
    output.htmlRules = normalized;
  }
  return output;
}

function validateManifest(m) {
  if (!m || typeof m !== "object" || Array.isArray(m)) fail("manifest-must-be-object");
  if (m.licenseApproved !== true || typeof m.licenseEvidence !== "string" || !m.licenseEvidence.trim()) {
    fail("license-review-required");
  }
  const allowedLicenseTypes = new Set(["self-owned", "written-permission", "open-license", "public-domain"]);
  if (!allowedLicenseTypes.has(m.licenseType)) fail("license-type-required");
  let evidenceUrl;
  try { evidenceUrl = new URL(m.licenseEvidenceUrl); } catch { fail("license-evidence-url-required"); }
  if (evidenceUrl.protocol !== "https:" || evidenceUrl.username || evidenceUrl.password) fail("license-evidence-url-must-be-https");
  const meta = m.metadata || {};
  if (!ID_RE.test(meta.id || "")) fail("invalid-source-id");
  if (typeof meta.name !== "string" || !meta.name.trim() || meta.name.length > 80) fail("invalid-source-name");
  if (!/^\d+\.\d+\.\d+$/.test(meta.version || "")) fail("invalid-source-version");
  let base;
  try { base = new URL(meta.baseUrl); } catch { fail("invalid-base-url"); }
  if (base.protocol !== "https:" || base.username || base.password) fail("base-url-must-be-https");
  if (!Array.isArray(meta.domains) || !meta.domains.length ||
      !meta.domains.every(x => typeof x === "string" && HOST_RE.test(x)) ||
      !meta.domains.some(x => x.toLowerCase() === base.hostname.toLowerCase())) fail("invalid-domain-allowlist");
  const selectors = m.selectors;
  for (const group of ["search", "bookInfo", "toc", "content"]) {
    if (!selectors || !selectors[group] || typeof selectors[group] !== "object" || Array.isArray(selectors[group])) {
      fail("missing-selector-group:" + group);
    }
    const json = JSON.stringify(selectors[group]);
    if (json.length > 100000) fail("selector-config-too-large");
    if (/\b(?:cookie|authorization|token|password)\b/i.test(json)) fail("credential-like-field-rejected");
  }
  if (typeof selectors.search.urlTemplate !== "string" ||
      !selectors.search.urlTemplate.includes("{{keyword}}")) fail("search-url-template-must-contain-keyword");
  const domains = meta.domains.map(x => x.toLowerCase());
  const appConfig = validateAppConfig(meta.appConfig, base, domains);
  return { meta, selectors, base, appConfig };
}

function renderFiles(manifest) {
  const { meta, selectors, base, appConfig } = validateManifest(manifest);
  const id = meta.id;
  const source = {
    schemaVersion: 1, id, name: meta.name,
    kind: meta.kind === "official" ? "official" : "public-web",
    version: meta.version,
    description: meta.description || "由已审查的声明式书源配置生成。",
    baseUrl: base.origin,
    domains: meta.domains.map(x => x.toLowerCase()),
    script: "scripts/" + id + ".js",
    enabled: false,
    categories: Array.isArray(meta.categories) ? meta.categories : [],
    licenseType: manifest.licenseType,
    licenseEvidenceUrl: new URL(manifest.licenseEvidenceUrl).href,
    licenseNote: "许可审查依据：" + manifest.licenseEvidence.trim(),
    ...(appConfig ? { appConfig } : {})
  };
  const config = { baseUrl: source.baseUrl, domains: source.domains, ...selectors };
  const script = [
    '"use strict";',
    'const { createAdapter } = require("../runtime/source-adapter");',
    "const config = " + JSON.stringify(config, null, 2) + ";",
    "const searchTemplate = config.search.urlTemplate;",
    "delete config.search.urlTemplate;",
    "config.search.url = (keyword, page) => searchTemplate",
    '  .replace(/\\{\\{keyword\\}\\}/g, encodeURIComponent(keyword))',
    '  .replace(/\\{\\{page\\}\\}/g, encodeURIComponent(String(page)));',
    "module.exports = createAdapter(config);",
    ""
  ].join("\n");
  return {
    id,
    sourcePath: "sources/" + id + ".json",
    scriptPath: "scripts/" + id + ".js",
    sourceContent: JSON.stringify(source, null, 2) + "\n",
    scriptContent: script,
    indexEntry: { id, name: source.name, kind: source.kind, file: "sources/" + id + ".json", enabled: false }
  };
}

function buildBatch(index, manifests) {
  if (!index || index.schemaVersion !== 1 || !Array.isArray(index.sources)) fail("invalid-existing-index");
  if (!Array.isArray(manifests) || manifests.length === 0) fail("manifest-list-must-not-be-empty");
  const existing = new Set(index.sources.map(x => x.id));
  const batchIds = new Set();
  const outputs = manifests.map(renderFiles);
  for (const output of outputs) {
    if (existing.has(output.id)) fail("source-id-already-indexed:" + output.id);
    if (batchIds.has(output.id)) fail("duplicate-id-in-batch:" + output.id);
    batchIds.add(output.id);
  }
  const nextIndex = {
    ...index,
    updatedAt: new Date().toISOString().slice(0, 10),
    sources: [...index.sources, ...outputs.map(x => x.indexEntry)]
  };
  return { outputs, nextIndex };
}

function main() {
  const input = process.argv[2];
  if (!input) fail("usage: npm run generate-source -- <manifest.json|manifest-directory>");
  const inputPath = path.resolve(process.cwd(), input);
  const files = fs.statSync(inputPath).isDirectory()
    ? fs.readdirSync(inputPath).filter(x => x.endsWith(".json")).sort().map(x => path.join(inputPath, x))
    : [inputPath];
  const manifests = files.flatMap(file => {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    return Array.isArray(parsed) ? parsed : Array.isArray(parsed.sources) ? parsed.sources : [parsed];
  });
  const indexPath = path.join(root, "index.json");
  const index = JSON.parse(fs.readFileSync(indexPath, "utf8"));
  const { outputs, nextIndex } = buildBatch(index, manifests);
  const planned = outputs.flatMap(x => [x.sourcePath, x.scriptPath]);
  for (const relative of planned) {
    if (fs.existsSync(path.join(root, relative))) fail("output-file-already-exists:" + relative);
  }
  const created = [];
  const tempIndex = indexPath + ".tmp";
  try {
    for (const output of outputs) {
      const sourcePath = path.join(root, output.sourcePath);
      const scriptPath = path.join(root, output.scriptPath);
      fs.writeFileSync(sourcePath, output.sourceContent, { flag: "wx" }); created.push(sourcePath);
      fs.writeFileSync(scriptPath, output.scriptContent, { flag: "wx" }); created.push(scriptPath);
    }
    fs.writeFileSync(tempIndex, JSON.stringify(nextIndex, null, 2) + "\n", { flag: "wx" });
    fs.renameSync(tempIndex, indexPath);
  } catch (error) {
    for (const file of created) { try { fs.unlinkSync(file); } catch {} }
    try { fs.unlinkSync(tempIndex); } catch {}
    throw error;
  }
  console.log(JSON.stringify({ generated: outputs.length, ids: outputs.map(x => x.id), index: "index.json", enabled: false }, null, 2));
}

module.exports = { validateManifest, renderFiles, buildBatch };
if (require.main === module) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
