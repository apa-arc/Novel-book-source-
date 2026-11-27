"use strict";
const assert = require("node:assert/strict");
const { normalizeAlias, resolveAlias } = require("../runtime/alias-resolver");
const registry = { schemaVersion: 1, records: [
  { id:"a", aliases:["五月轮回"], title:"斗罗：武魂菩提树，唐三魔王护", author:"浮生一日闲啊", evidence:{platform:"QQ阅读"} },
  { id:"b", aliases:["极致蓝银"], title:"斗罗：魂环全选蓝银草，极致生命", author:"忍冬", evidence:{platform:"书旗小说"} },
  { id:"c", aliases:["无平台别名"], title:"测试作品", author:"测试作者" }
] };
assert.equal(normalizeAlias(" 极致 蓝银！"), "极致蓝银");
assert.equal(resolveAlias("极致蓝银", registry).title, "斗罗：魂环全选蓝银草，极致生命");
assert.equal(resolveAlias("极致蓝银", registry).author, "忍冬");
assert.equal(resolveAlias("极致蓝银", registry).searchKeyword, "斗罗：魂环全选蓝银草，极致生命");
assert.equal(resolveAlias("无平台别名", registry).status, "resolved");
assert.equal(resolveAlias("极致蓝", registry), null, "no fuzzy alias guessing");
assert.equal(resolveAlias("", registry), null);
const ambiguous = { schemaVersion:1, records:[
  { aliases:["同名"], title:"作品一", author:"甲" },
  { aliases:["同名"], title:"作品二", author:"乙" }
] };
assert.equal(resolveAlias("同名", ambiguous).status, "ambiguous");
console.log("Alias resolver tests passed.");
