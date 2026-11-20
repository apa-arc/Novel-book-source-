"use strict";
const assert = require("node:assert/strict");
const { scanTextQuality, scanArticles } = require("../runtime/text-quality");

const clean = "第一回 宴桃園豪傑三結義，斬黃巾英雄首立功。這是一段正常的繁體中文古典小說正文。".repeat(4);
assert.equal(scanTextQuality(clean).status, "normal");
assert.equal(scanTextQuality("這段文字含有替換符號 �，應標記疑似亂碼。").status, "suspect");
assert.ok(scanTextQuality("锟斤拷").flags.some(flag => flag.rule === "common-garbled-text"));
assert.ok(scanTextQuality("Ã¤Â¸Â­Ã¦â€“â€¡").flags.some(flag => flag.rule === "utf8-mojibake"));
assert.ok(scanTextQuality("&#x4E2D;").status === "normal");
assert.ok(scanTextQuality("&amp;#x4E2D;").flags.some(flag => flag.rule === "broken-html-entity"));
assert.ok(scanTextQuality("\uE000").flags.some(flag => flag.rule === "private-use-character"));
assert.ok(scanTextQuality("\u0001").flags.some(flag => flag.rule === "control-character"));
assert.ok(scanTextQuality("正常文字\u3000繁體字與异体字").status === "normal");
assert.ok(scanTextQuality("").flags.some(flag => flag.rule === "empty-content"));
assert.equal(scanTextQuality("短").status, "review");

const batch = scanArticles([
  { title: "第一回", content: clean },
  { title: "第二回", content: clean },
  { title: "第三回", content: "�" },
  { title: "第四回", content: "" }
]);
assert.equal(batch.summary.scanned, 4);
assert.equal(batch.summary.duplicates, 1);
assert.equal(batch.results[1].flags[0].rule, "duplicate-content");
assert.equal(batch.results[1].flags[0].duplicateOf, "第一回");
assert.equal(batch.summary.suspect, 3);
assert.equal(batch.summary.review, 0);
console.log("Text quality scanner tests passed.");
