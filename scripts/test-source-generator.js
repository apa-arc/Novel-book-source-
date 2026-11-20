"use strict";
const assert = require("node:assert/strict");
const vm = require("node:vm");
const { validateManifest, buildBatch } = require("./generate-source");

const valid = {
  licenseApproved: true,
  licenseEvidence: "自有规则并保留权属记录",
  licenseType: "self-owned",
  licenseEvidenceUrl: "https://example.com/license",
  metadata: {
    id: "demo-source", name: "演示书源", version: "1.0.0",
    baseUrl: "https://example.com", domains: ["example.com"]
  },
  selectors: {
    search: { urlTemplate: "https://example.com/?q={{keyword}}&p={{page}}" },
    bookInfo: {}, toc: {}, content: {}
  }
};

assert.equal(validateManifest(valid).meta.id, "demo-source");
assert.throws(() => validateManifest({ ...valid, licenseApproved: false }), /license-review-required/);
assert.throws(() => validateManifest({ ...valid, licenseType: "unknown" }), /license-type-required/);
assert.throws(() => validateManifest({ ...valid, licenseEvidenceUrl: "" }), /license-evidence-url-required/);
assert.throws(() => validateManifest({ ...valid, licenseEvidenceUrl: "http://example.com/license" }), /license-evidence-url-must-be-https/);
assert.throws(() => validateManifest({ ...valid, metadata: { ...valid.metadata, baseUrl: "http://example.com" } }), /base-url-must-be-https/);
assert.throws(() => validateManifest({ ...valid, metadata: { ...valid.metadata, domains: ["other.example"] } }), /invalid-domain-allowlist/);
assert.throws(() => validateManifest({ ...valid, selectors: { ...valid.selectors, search: { urlTemplate: "https://example.com/?p={{page}}" } } }), /search-url-template/);
assert.throws(() => validateManifest({ ...valid, selectors: { ...valid.selectors, content: { body: "password" } } }), /credential-like-field/);

const initialIndex = {
  schemaVersion: 1,
  updatedAt: "2026-11-20",
  sources: [{ id: "template-source", name: "模板", kind: "public-web", file: "sources/template.json", enabled: false }]
};
const batch = buildBatch(initialIndex, [valid, {
  ...valid,
  metadata: { ...valid.metadata, id: "second-demo", name: "第二个示例" }
}]);
assert.equal(batch.outputs.length, 2);
assert.equal(batch.nextIndex.sources.length, 3);
assert.equal(batch.nextIndex.sources[1].id, "demo-source");
assert.equal(batch.nextIndex.sources[1].enabled, false);
assert.ok(batch.outputs[0].scriptContent.includes(".replace("));
assert.ok(batch.outputs[0].scriptContent.includes("createAdapter"));
assert.doesNotThrow(() => new vm.Script(batch.outputs[0].scriptContent));
assert.ok(batch.outputs[0].sourceContent.endsWith("\n"));
assert.throws(() => buildBatch(initialIndex, [valid, valid]), /duplicate-id-in-batch/);
assert.throws(() => buildBatch(initialIndex, [valid, {
  ...valid, metadata: { ...valid.metadata, id: "template-source" }
}]), /source-id-already-indexed/);
assert.throws(() => buildBatch(initialIndex, []), /manifest-list-must-not-be-empty/);
console.log("Source generator batch and index tests passed.");
