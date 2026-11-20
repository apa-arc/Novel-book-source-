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

module.exports = { scanTextQuality };