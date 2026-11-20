#!/usr/bin/env node
"use strict";

// Generate a repository-native adapter only from an explicitly reviewed manifest.
// This tool never downloads third-party source definitions or copies upstream scripts.
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const ID_RE = /^[a-z0-9][a-z0-9-]{2,63}$/;
const HOST_RE = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;

function fail(message) { throw new Error(message); }
function validateManifest(m) {
  if (!m || typeof m !== "object" || Array.isArray(m)) fail("manifest-must-be-object");
  if (m.licenseApproved !== true || typeof m.licenseEvidence !== "string" || !m.licenseEvidence.trim()) {
    fail("license-review-required: set licenseApproved=true and provide licenseEvidence");
  }
  const meta = m.metadata || {};
  if (!ID_RE.test(meta.id || "")) fail("invalid-source-id");
  if (typeof meta.name !== "string" || !meta.name.trim() || meta.name.length > 80) fail("invalid-source-name");
  if (!/^\d+\.\d+\.\d+$/.test(meta.version || "")) fail("invalid-source-version");
  const base = new URL(meta.baseUrl);
  if (base.protocol !== "https:" || base.username || base.password) fail("base-url-must-be-https");
  if (!Array.isArray(meta.domains) || !meta.domains.includes(base.hostname) ||
      !meta.domains.every(x => typeof x === "string" && HOST_RE.test(x))) fail("invalid-domain-allowlist");
  const selectors = m.selectors;
  for (const group of ["search", "bookInfo", "toc", "content"]) {
    if (!selectors || !selectors[group] || typeof selectors[group] !== "object") fail("missing-selector-group:" + group);
  }
  if (typeof selectors.search.urlTemplate !== "string" || !selectors.search.urlTemplate.includes("{{keyword}}")) {
    fail("search-url-template-must-contain-{{keyword}}");
  }
  for (const group of ["search", "bookInfo", "toc", "content"]) {
    const json = JSON.stringify(selectors[group]);
    if (json.length > 100000) fail("selector-config-too-large");
    if (/\b(?:cookie|authorization|token|password)\b/i.test(json)) fail("credential-like-field-rejected");
  }
  return { meta, selectors };
}

function main() {
  const input = process.argv[2];
  if (!input) fail("usage: node scripts/generate-source.js <approved-manifest.json>");
  const manifestPath = path.resolve(process.cwd(), input);
  const parsed = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const { meta, selectors } = validateManifest(parsed);
  const id = meta.id;
  const sourcePath = path.join(root, "sources", id + ".json");
  const scriptPath = path.join(root, "scripts", id + ".js");
  if (fs.existsSync(sourcePath) || fs.existsSync(scriptPath)) fail("source-id-already-exists");

  const source = {
    schemaVersion: 1,
    id,
    name: meta.name,
    kind: meta.kind === "official" ? "official" : "public-web",
    version: meta.version,
    description: meta.description || "由已审查的声明式书源配置生成。",
    baseUrl: new URL(meta.baseUrl).origin,
    domains: meta.domains,
    script: "scripts/" + id + ".js",
    enabled: false,
    categories: Array.isArray(meta.categories) ? meta.categories : [],
    licenseNote: "许可审查依据：" + parsed.licenseEvidence.trim()
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

  fs.writeFileSync(sourcePath, JSON.stringify(source, null, 2) + "\n", { flag: "wx" });
  fs.writeFileSync(scriptPath, script, { flag: "wx" });
  console.log(JSON.stringify({ id, source: path.relative(root, sourcePath), script: path.relative(root, scriptPath), enabled: false }, null, 2));
}

module.exports = { validateManifest };
if (require.main === module) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
