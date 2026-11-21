"use strict";
const assert = require("node:assert/strict");
const { scanTextQuality, scanArticles, cleanPromotionalContent } = require("../runtime/text-quality");

const clean = "第一回 宴桃園豪傑三結義，斬黃巾英雄首立功。這是一段正常的繁體中文古典小說正文。".repeat(4);
assert.equal(scanTextQuality(clean).status, "normal");
assert.equal(scanTextQuality("這段文字含有替換符號 �，應標記疑似亂碼。").status, "suspect");
assert.ok(scanTextQuality("锟斤拷").flags.some(flag => flag.rule === "common-garbled-text"));
assert.ok(scanTextQuality("Ã¤Â¸Â­Ã¦â€“â€¡").flags.some(flag => flag.rule === "utf8-mojibake"));
assert.ok(scanTextQuality("&#x4E2D;".repeat(20)).status === "normal");
assert.ok(scanTextQuality("&#x4E2D".repeat(20)).flags.some(flag => flag.rule === "broken-html-entity"));
assert.ok(scanTextQuality("&amp;#x4E2D;").flags.some(flag => flag.rule === "broken-html-entity"));
assert.ok(scanTextQuality("\uE000").flags.some(flag => flag.rule === "private-use-character"));
assert.ok(scanTextQuality("\u0001").flags.some(flag => flag.rule === "control-character"));
assert.ok(scanTextQuality("正常文字\u3000繁體字與异体字".repeat(10)).status === "normal");
assert.ok(scanTextQuality("").flags.some(flag => flag.rule === "empty-content"));
assert.equal(scanTextQuality("短").status, "review");

const promoSample = "第一章\n主角推门走进院子，屋内灯火通明。\n本章未完，点击下方红色链接，免费看神通者完整章节内容\n神通者最新最快更新，点击直达\n京東搜索：福利大紅包962，領取至高26888元雙11紅包。\n主角抬头看向窗外。";
const cleanedPromo = cleanPromotionalContent(promoSample);
assert.equal(cleanedPromo.removedBlocks, 3);
assert.ok(cleanedPromo.content.includes("主角推门走进院子"));
assert.ok(cleanedPromo.content.includes("主角抬头看向窗外"));
assert.ok(!cleanedPromo.content.includes("京東搜索"));
assert.ok(!cleanedPromo.content.includes("点击直达"));
const concatenatedPromo = cleanPromotionalContent("正文前段。本章未完，点击下方红色链接，免费看神通者完整章节内容神通者最新最快更新，点击直达京東搜索：福利大红包962，领取至高26888元双11红包。正文后段。");
assert.ok(concatenatedPromo.content.startsWith("正文前段。"));
assert.ok(concatenatedPromo.content.endsWith("正文后段。"));
assert.ok(!concatenatedPromo.content.includes("福利大红包"));
assert.ok(concatenatedPromo.removedBlocks >= 3);
const ordinaryClickProse = "他点击桌上的按钮，随后最新消息传来。";
assert.equal(cleanPromotionalContent(ordinaryClickProse).content, ordinaryClickProse);

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
