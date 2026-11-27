"use strict";

function normalizeAlias(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLocaleLowerCase("zh-CN")
    .replace(/[\\s\\p{P}\\p{S}]+/gu, "");
}

// Exact-only matching avoids silently resolving a promotional keyword to the wrong book.
function resolveAlias(keyword, registry) {
  const normalized = normalizeAlias(keyword);
  if (!normalized || !registry || registry.schemaVersion !== 1 || !Array.isArray(registry.records)) return null;
  const matches = registry.records.filter(record =>
    record && typeof record.title === "string" && record.title.trim() &&
    (Array.isArray(record.aliases) ? record.aliases : []).some(alias => normalizeAlias(alias) === normalized)
  );
  if (matches.length > 1) return { status: "ambiguous", matches };
  if (matches.length === 0) return null;
  const record = matches[0];
  return {
    status: "resolved",
    alias: String(keyword).trim(),
    title: record.title,
    author: typeof record.author === "string" ? record.author : "",
    recordId: record.id || "",
    platform: record.platform || (record.evidence && record.evidence.platform) || null,
    verification: record.verification || "unverified",
    searchKeyword: record.title
  };
}

module.exports = { normalizeAlias, resolveAlias };
