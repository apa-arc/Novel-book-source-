"use strict";

const SUSPECT_PATTERNS = [
  ["replacement-character", /\uFFFD/gu],
  ["utf8-mojibake", /(?:Ã[\u0080-\u00FF]|Â[\u0080-\u00FF]|â(?:€|™|œ|€¦|€“|€”|€™)|ä¸[\u0080-\u00FF]|å[\u0080-\u00FF]|æ[\u0080-\u00FF]|ï¿½|ðŸ)/gu],
  ["common-garbled-text", /(?:锟斤拷|烫烫烫|屯屯屯)/gu],
  ["broken-html-entity", /(?:&amp;#(?:x[0-9a-f]+|[0-9]+);|&#(?:x[0-9a-f]+|[0-9]+)(?![0-9a-f;])|&(?:nbsp|amp|lt|gt|quot)(?!;))/giu],
  ["private-use-character", /[\uE000-\uF8FF\u{F0000}-\u{FFFFD}\u{100000}-\u{10FFFD}]/gu],
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
  const suspect = flags.some(item => !["very-short-content"].includes(item.rule));
  return {
    status: suspect ? "suspect" : flags.length ? "review" : "normal",
    length: content.length,
    flags
  };
}

// Remove only high-confidence promotional blocks. Avoid deleting ordinary story prose
// merely because it contains words such as "更新" or "点击".
const PROMO_BLOCK_PATTERNS = [
  /一日暴富[，,、\\s]*神通者最新最快更新[，,、\\s]*(?:点击直达|點擊直達)/giu,
  /本章未完.{0,80}(?:点击下方|點擊下方).{0,100}(?:免费看|免費看).{0,30}/giu,
  /本章被墙.{0,100}(?:点击下方|點擊下方).{0,80}(?:观看完整版|觀看完整版)/giu,
  /(?:京东|京東)\\s*(?:搜索|搜一搜)[：:\\s]*福利大(?:红包|紅包)\\d{0,20}[，,，\\s]*(?:领取|領取)[^。\\n]{0,40}?(?:双11|雙11|双十一|雙十一)(?:红包|紅包)。?/giu,
  /(?:双11|雙11|双十一|雙十一).{0,80}(?:红包|紅包|福利|优惠|優惠)/giu,
  /(?:搜索|搜尋)\\s*[：:].{0,100}(?:红包|紅包|福利|優惠|优惠)/giu,
  /(?:最新最快更新|最新更新).{0,80}(?:点击直达|點擊直達|点击进入|點擊進入)/giu
];

function cleanPromotionalContent(value) {
  let content = String(value == null ? "" : value);
  let removedBlocks = 0;
  for (const pattern of PROMO_BLOCK_PATTERNS) {
    pattern.lastIndex = 0;
    content = content.replace(pattern, () => {
      removedBlocks++;
      return "\\n";
    });
  }
  content = content
    .replace(/[ \\t]+\\n/gu, "\\n")
    .replace(/\\n[ \\t]+/gu, "\\n")
    .replace(/\\n{3,}/gu, "\\n\\n")
    .trim();
  return { content, removedBlocks };
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
    const suspect = flags.some(item => !["very-short-content"].includes(item.rule));
    results.push({ title, status: suspect ? "suspect" : flags.length ? "review" : "normal", length: quality.length, flags });
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

module.exports = { scanTextQuality, scanArticles, cleanPromotionalContent };
