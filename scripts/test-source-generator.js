"use strict";
const assert = require("node:assert/strict");
const { validateManifest } = require("./generate-source");

const valid = {
  licenseApproved: true,
  licenseEvidence: "自有规则或明确授权",
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
assert.throws(() => validateManifest({ ...valid, metadata: { ...valid.metadata, baseUrl: "http://example.com" } }), /base-url-must-be-https/);
assert.throws(() => validateManifest({ ...valid, metadata: { ...valid.metadata, domains: ["other.example"] } }), /invalid-domain-allowlist/);
assert.throws(() => validateManifest({ ...valid, selectors: { ...valid.selectors, search: { urlTemplate: "https://example.com/?p={{page}}" } } }), /search-url-template/);
assert.throws(() => validateManifest({ ...valid, selectors: { ...valid.selectors, content: { body: "password" } } }), /credential-like-field/);
console.log("Source generator manifest tests passed.");
