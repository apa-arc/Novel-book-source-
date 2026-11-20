"use strict";

const SUSPECT_PATTERNS = [
  ["replacement-character", /\uFFFD/gu],
  ["utf8-mojibake", /(?:Ã[\u0080-\u00FF]|Â[\u0080-\u00FF]|â(?:€|™|œ|€¦|€“|€”|€™)|ä¸[\u0080-\u00FF]|å[\u0080-\u00FF]|æ[\u0080-\u00FF]|ï¿½|ðŸ)/gu],
  ["common-garbled-text", /(?:锟斤拷|烫烫烫|屯屯屯)/gu],
  ["control-character", /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/gu]
];

function scanTextQuality(value) {
  const content = String(value == null ? "" : value);
  const flags = [];
  for (const [name, pattern] of SUSPECT_PATTERNS) {
    pattern.lastIndex = 0;
    const matches = content.match(pattern);
    if (matches && matches.length) flags.push({ rule: name, count: matches.length });
  }
  if (!content.trim()) flags.push({ rule: "empty-content", count: 1 });
  else if (content.trim().length < 80) flags.push({ rule: "very-short-content", count: 1 });
  return {
    status: flags.some(item => item.rule !== "very-short-content") ? "suspect" : flags.length ? "review" : "normal",
    length: content.length,
    flags
  };
}

function normalizeForDuplicateCheck(value) {
  return String(value == null ? "" : value)
    .replace(/\s+/gu, "")
    .replace(/[“”‘’「」『』《》〈〉]/gu, "")
    .trim();
}

function scanArticles(articles) {
  const seen = new Map();
  const results = [];
  for (const article of Array.isArray(articles) ? articles : []) {
    const title = String(article && article.title || "Untitled");
    const content = String(article && article.content || "");
    const quality = scanTextQuality(content);
    const normalized = normalizeForDuplicateCheck(content);
    const flags = quality.flags.slice();
    if (normalized.length >= 80) {
      if (seen.has(normalized)) flags.push({ rule: "duplicate-content", count: 1, duplicateOf: seen.get(normalized) });
      else seen.set(normalized, title);
    }
    results.push({ title, status: flags.some(item => item.rule !== "very-short-content") ? "suspect" : flags.length ? "review" : "normal", length: quality.length, flags });
  }
  const summary = {
    scanned: results.length,
    normal: results.filter(item => item.status === "normal").length,
    suspect: results.filter(item => item.status === "suspect").length,
    review: results.filter(item => item.status === "review").length,
    duplicates: results.filter(item => item.flags.some(flag => flag.rule === "duplicate-content")).length
  };
  return { summary, results };
}

module.exports = { scanTextQuality, scanArticles };