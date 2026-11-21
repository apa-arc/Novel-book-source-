import assert from "node:assert/strict";
import { classifyAppSearchError } from "./app-runtime-classification.ts";

assert.equal(classifyAppSearchError("书源服务器返回 HTTP 403。"), "inconclusive");
assert.equal(classifyAppSearchError("书源服务器返回 HTTP 429。"), "inconclusive");
assert.equal(classifyAppSearchError("书源请求被重定向，已阻止。"), "inconclusive");
assert.equal(classifyAppSearchError("书源网络请求失败，请检查网络或站点状态。"), "inconclusive");
assert.equal(classifyAppSearchError("书源请求超时（12 秒）。"), "inconclusive");
assert.equal(classifyAppSearchError("该书源返回的不是 JSON。"), "failed");
assert.equal(classifyAppSearchError("没有在 JSON 响应中找到小说列表数组。"), "failed");

console.log("PASS: environment-dependent network errors are never reported as confirmed source failures.");
