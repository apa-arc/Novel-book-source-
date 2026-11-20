#!/usr/bin/env node
"use strict";

// Read-only, bounded live tests for simple Legado HTML/GET sources.
// No rule JavaScript, login, cookies, challenge bypass, or novel text is stored.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { parseHTML } = require("linkedom");
const { parseLegacyChain } = require("./convert-legado-rules");
const { executeSelector } = require("../runtime/selector-engine");
const { scanArticles } = require("../runtime/text-quality");

const ROOT = path.resolve(__dirname, "..");
const AOAOSTAR = path.join(ROOT, "imports/aoaostar/raw/aoaostar-full.json");
const SECONDARY_URL = "https://raw.githubusercontent.com/luanmuc/legado-book-sources/main/books.json";
const REPORT = path.join(ROOT, "reports/live-functional-test.json");
const KEYWORD = "斗破苍穹";
const TIMEOUT_MS = 12000;
const MAX_BODY = 4 * 1024 * 1024;
const MAX_TESTS = 50;
const CONCURRENCY = 4;
const NON_NOVEL = /漫画|動漫|动漫|有声|听书|古籍|国学|诗词|詞典|词典|百科|维基|公版|杂志|影视|短剧|网盘|音乐|播客/i;
const SCRIPT_OR_AUTH = /@js:|<js>|\bjavascript\b|\bfunction\b|\breturn\b|\$\{/i;

function asArray(value) { return Array.isArray(value) ? value : value ? [value] : []; }
function adultSource(s) { return /🔞|成人|色情|情色|R18|18\+/i.test([s.bookSourceName,s.bookSourceGroup,s.bookSourceComment,s.bookSourceUrl].join(" ")); }
function hash(s) { return crypto.createHash("sha256").update(s).digest("hex").slice(0, 16); }
function parseDoc(html) { return parseHTML(String(html)).document; }
function safeHeaders(source) {
  if (!source.header) return {};
  let value = source.header;
  if (typeof value === "string") { try { value = JSON.parse(value); } catch { throw new Error("unparseable-request-headers"); } }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid-request-headers");
  const allowed = new Set(["user-agent","referer","accept","accept-language"]);
  const out = {};
  for (const [key, val] of Object.entries(value)) {
    const lower = key.toLowerCase();
    if (!allowed.has(lower) || typeof val !== "string" || /cookie|authorization|token|password|secret/i.test(key + " " + val)) {
      throw new Error("credential-or-unsupported-header");
    }
    out[key] = val;
  }
  return out;
}
function isStaticRuleGroup(source) {
  const required = {
    ruleSearch: ["bookList","name","bookUrl"],
    ruleBookInfo: [],
    ruleToc: ["chapterList","chapterName","chapterUrl"],
    ruleContent: ["content"]
  };
  const selectorFields = {
    ruleSearch: ["bookList","name","author","bookUrl","coverUrl","intro","kind","lastChapter","wordCount"],
    ruleBookInfo: ["name","author","intro","coverUrl","tocUrl","kind","lastChapter","wordCount"],
    ruleToc: ["chapterList","chapterName","chapterUrl","isVolume","nextTocUrl","updateTime"],
    ruleContent: ["content","nextContentUrl"]
  };
  for (const [group, fields] of Object.entries(required)) {
    const rules = source[group];
    if (!rules || typeof rules !== "object" || Array.isArray(rules)) return false;
    for (const field of fields) if (typeof rules[field] !== "string" || !rules[field].trim()) return false;
  }
  if (source.ruleBookInfo.init || source.ruleContent.replaceRegex || source.ruleContent.webJs || source.ruleContent.sourceRegex) return false;
  if (!["name","author","intro","coverUrl","tocUrl","kind","lastChapter","wordCount"].some(key => typeof source.ruleBookInfo[key] === "string" && source.ruleBookInfo[key].trim())) return false;
  for (const [group, fields] of Object.entries(selectorFields)) {
    const rules = source[group] || {};
    for (const field of fields) {
      const rule = rules[field];
      if (!rule) continue;
      try { selector(rule); } catch { return false; }
    }
  }
  return true;
}
function selector(rule, outputOverride) {
  if (typeof rule !== "string" || !rule.trim() || SCRIPT_OR_AUTH.test(rule)) throw new Error("unsupported-rule-expression");
  const parsed = parseLegacyChain(rule);
  if (parsed.status !== "candidate" || !parsed.selector) throw new Error("unsupported-selector");
  return outputOverride ? { ...parsed.selector, output: outputOverride } : parsed.selector;
}
function first(root, rule) {
  const result = executeSelector(root, selector(rule));
  return Array.isArray(result) ? result.find(x => x != null && String(x).trim() !== "") : result;
}
function values(root, rule) {
  const result = executeSelector(root, selector(rule));
  return (Array.isArray(result) ? result : [result]).flat(Infinity).filter(x => x != null && String(x).trim() !== "");
}
function allNodes(root, rule) {
  const result = executeSelector(root, selector(rule, "all"));
  if (!Array.isArray(result)) throw new Error("list-rule-not-array");
  return result;
}
function registrableDomain(hostname) {
  const labels = String(hostname).toLowerCase().split(".");
  if (labels.length < 2) return String(hostname).toLowerCase();
  const two = labels.slice(-2).join(".");
  const multiLevel = new Set(["co.uk","com.cn","net.cn","org.cn","com.hk","com.tw","co.jp","com.au","net.au"]);
  return multiLevel.has(two) && labels.length >= 3 ? labels.slice(-3).join(".") : two;
}
function hostAllowed(candidate, baseHost) {
  return registrableDomain(candidate) === registrableDomain(baseHost);
}
function absolute(raw, base, host) {
  const u = new URL(String(raw || ""), base);
  if (u.protocol !== "https:" || u.username || u.password || !hostAllowed(u.hostname, host)) {
    throw new Error("url-outside-https-source-host:" + u.hostname.toLowerCase() + ":expected-" + host);
  }
  return u.href;
}
async function fetchHtml(rawUrl, host, requestHeaders = {}) {
  let url = absolute(rawUrl, "https://" + host + "/", host);
  for (let redirects = 0; redirects <= 4; redirects++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let response;
    try {
      response = await fetch(url, {
        redirect: "manual", signal: controller.signal,
        headers: { "user-agent": "NovelSourceFunctionalTest/1.0 (+metadata-only; no auth)", "accept": "text/html,application/xhtml+xml", ...requestHeaders }
      });
    } finally { clearTimeout(timer); }
    if ([301,302,303,307,308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) throw new Error("redirect-without-location");
      url = absolute(location, url, host);
      continue;
    }
    if (!response.ok) throw new Error("http-" + response.status);
    const type = response.headers.get("content-type") || "";
    if (type && !/html|xml|text/i.test(type)) throw new Error("unexpected-content-type");
    const body = await response.text();
    if (body.length > MAX_BODY) throw new Error("response-too-large");
    if (/验证码|captcha|访问验证|安全验证|人机验证|cloudflare|just a moment|access denied/i.test(body.slice(0, 60000))) {
      throw new Error("challenge-or-access-denied");
    }
    if (!/<(?:!doctype\s+html|html|body|div|table)\b/i.test(body)) throw new Error("not-html");
    return { url, document: parseDoc(body) };
  }
  throw new Error("too-many-redirects");
}
function simpleSearchUrl(source, keyword, page) {
  const raw = String(source.searchUrl || "").trim();
  if (!raw || raw.includes(",") || SCRIPT_OR_AUTH.test(raw) || /webView|cookie|header/i.test(raw)) {
    throw new Error("unsupported-search-url");
  }
  const replaced = raw
    .replace(/\{\{\s*key\s*\}\}/gi, encodeURIComponent(keyword))
    .replace(/\{\{\s*page\s*\}\}/gi, String(page))
    .replace(/\{\{\s*page\s*-\s*1\s*\}\}/gi, String(page - 1))
    .replace(/\{\{\s*page\s*\+\s*1\s*\}\}/gi, String(page + 1));
  const u = new URL(replaced, source.bookSourceUrl);
  const host = u.hostname.toLowerCase();
  const privateHost = host === "localhost" || host.endsWith(".local") || ["127.","10.","192.168.","172.16.","172.17.","172.18.","172.19.","172.20.","172.21.","172.22.","172.23.","172.24.","172.25.","172.26.","172.27.","172.28.","172.29.","172.30.","172.31."].some(prefix => host.startsWith(prefix));
  if (u.protocol !== "https:" || u.username || u.password || !host || privateHost) throw new Error("unsafe-search-url");
  return u.href;
  return u.href;
}
function extract(node, rules, baseUrl, host) {
  const out = {};
  const nonSelector = new Set(["bookList","chapterList","checkKeyWord","init","replaceRegex","webJs","sourceRegex","imageStyle"]);
  for (const [key, rule] of Object.entries(rules || {})) {
    if (nonSelector.has(key) || !rule || typeof rule !== "string") continue;
    const value = first(node, rule);
    if (value == null || value === "") continue;
    if (["bookUrl","tocUrl","chapterUrl"].includes(key)) out[key] = absolute(value, baseUrl, host);
    else out[key] = String(value).replace(/\s+/g, " ").trim();
  }
  return out;
}
function htmlToText(value) {
  const doc = parseDoc("<html><body><div id=\"root\">" + String(value || "") + "</div></body></html>");
  const root = doc.querySelector("#root");
  if (!root) return "";
  for (const el of Array.from(root.querySelectorAll("script,style,iframe,form,button"))) el.remove();
  return String(root.textContent || "").replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
}
async function testSource(source) {
  const host = new URL(source.bookSourceUrl).hostname.toLowerCase();
  const id = hash(String(source.bookSourceName) + "|" + String(source.bookSourceUrl));
  const result = { id, name: String(source.bookSourceName || "").slice(0, 100), host, category: adultSource(source) ? "adult" : "ordinary", status: "failed", stages: [] };
  let currentStage = "preflight";
  const stage = (name, detail) => { currentStage = name; result.stages.push({ name, status: "passed", ...detail }); };
  try {
    if (adultSource(source)) throw new Error("adult-functional-test-deferred");
    if (source.enabled === false) throw new Error("upstream-source-disabled");
    if (source.loginUrl || source.loginUi || source.loginCheckJs || source.enabledCookieJar) throw new Error("login-required");
    const headers = safeHeaders(source);
    if (!isStaticRuleGroup(source)) throw new Error("unsupported-or-incomplete-rule-groups");
    currentStage = "search";
    let chosen = null;
    let resultCount = 0;
    let keywordUsed = "";
    const terms = [...new Set([KEYWORD, source.ruleSearch.checkKeyWord, "凡人修仙传", "完美世界"].filter(x => typeof x === "string" && x.trim()))];
    for (const term of terms) {
      const searchUrl = simpleSearchUrl(source, term, 1);
      const searchHost = new URL(searchUrl).hostname.toLowerCase();
      const searchPage = await fetchHtml(searchUrl, searchHost, headers);
      const searchItems = allNodes(searchPage.document, source.ruleSearch.bookList);
      const books = [];
      for (const item of searchItems.slice(0, 80)) {
        const fields = extract(item, source.ruleSearch, searchPage.url, host);
        if (fields.name && fields.bookUrl) books.push(fields);
      }
      if (books.length) {
        chosen = books[0];
        resultCount = books.length;
        keywordUsed = term;
        break;
      }
    }
    if (!chosen) throw new Error("search-returned-no-books");
    stage("search", { resultCount, selectedTitle: chosen.name, keywordUsed });

    const detailPage = await fetchHtml(chosen.bookUrl, host, headers);
    const detail = extract(detailPage.document, source.ruleBookInfo, detailPage.url, host);
    const title = detail.name || chosen.name;
    if (!title) throw new Error("book-detail-title-empty");
    stage("bookDetail", { title });
    const tocUrl = detail.tocUrl || chosen.bookUrl;
    currentStage = "chapters";
    const tocPage = await fetchHtml(tocUrl, host, headers);
    const chapterNodes = allNodes(tocPage.document, source.ruleToc.chapterList);
    const chapters = [];
    for (const node of chapterNodes.slice(0, 200)) {
      const name = first(node, source.ruleToc.chapterName);
      const url = first(node, source.ruleToc.chapterUrl);
      if (!name || !url) continue;
      chapters.push({ title: String(name).trim(), url: absolute(url, tocPage.url, host) });
    }
    const unique = [...new Map(chapters.map(x => [x.url, x])).values()];
    if (unique.length < 2) throw new Error("chapter-list-empty-or-duplicate");
    stage("chapters", { chapterCount: unique.length });
    let sampled = null;
    let lastContentError = "no-chapter-content";
    currentStage = "content";
    for (const chapter of unique.slice(0, 5)) {
      try {
        const page = await fetchHtml(chapter.url, host, headers);
        const raw = values(page.document, source.ruleContent.content).join("\n");
        const content = htmlToText(raw);
        const quality = scanArticles([{ title: chapter.title, content }]);
        if (content.length < 100 || quality.summary.suspect > 0 || quality.summary.review > 0) {
          lastContentError = "chapter-text-quality-failed";
          continue;
        }
        sampled = { title: chapter.title, length: content.length, quality: quality.summary };
        break;
      } catch (error) { lastContentError = String(error.message || error).slice(0, 120); }
    }
    if (!sampled) throw new Error(lastContentError);
    stage("content", sampled);
    result.status = "passed";
  } catch (error) {
    result.failedStage = currentStage;
    result.error = String(error && error.message || error).slice(0, 180);
    if (error && error.cause) result.errorCause = String(error.cause.code || error.cause.message || error.cause).slice(0, 180);
  }
  return result;
}
async function main() {
  if (!fs.existsSync(AOAOSTAR)) throw new Error("missing-AOAOSTAR-snapshot");
  const aoaostar = asArray(JSON.parse(fs.readFileSync(AOAOSTAR, "utf8")));
  const response = await fetch(SECONDARY_URL, { signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error("secondary-upstream-http-" + response.status);
  const secondary = asArray(await response.json());
  const seen = new Set();
  const candidates = [];
  function add(source, provider) {
    if (!source || typeof source !== "object" || adultSource(source)) return;
    const label = [source.bookSourceName,source.bookSourceGroup,source.bookSourceComment].join(" ");
    if (NON_NOVEL.test(label) || source.enabled === false || source.bookSourceType && Number(source.bookSourceType) !== 0) return;
    let host;
    try { const u = new URL(source.bookSourceUrl); if (u.protocol !== "https:" || u.hostname.toLowerCase().endsWith(".jp")) return; host = u.hostname.toLowerCase(); } catch { return; }
    if (seen.has(host)) return;
    if (source.loginUrl || source.loginUi || source.loginCheckJs || source.enabledCookieJar) return;
    try { safeHeaders(source); } catch { return; }
    if (!isStaticRuleGroup(source)) return;
    if (!source.searchUrl || source.searchUrl.includes(",") || SCRIPT_OR_AUTH.test(source.searchUrl)) return;
    seen.add(host);
    candidates.push({ source, provider });
  }
  for (const source of aoaostar) add(source, "AOAOSTAR");
  for (const source of secondary) add(source, "luanmuc");
  const selected = candidates.slice(0, MAX_TESTS);
  const results = new Array(selected.length);
  let next = 0;
  async function worker() {
    while (true) {
      const index = next++;
      if (index >= selected.length) return;
      results[index] = await testSource(selected[index].source);
      results[index].provider = selected[index].provider;
      console.log("tested", index + 1, "/", selected.length, results[index].status, results[index].host, [results[index].failedStage, results[index].error, results[index].errorCause].filter(Boolean).join("/"));
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  const passed = results.filter(x => x.status === "passed");
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    test: "Real search -> book detail -> chapter list -> chapter content; HTTPS same-host only; no scripts, login, cookies, CAPTCHA bypass, or content retention",
    keyword: KEYWORD,
    counts: {
      candidatesDiscovered: candidates.length,
      tested: results.length,
      passed: passed.length,
      failed: results.length - passed.length,
      subscriptionChanges: 0
    },
    note: "This report is diagnostic only. A passing live test does not itself approve rule redistribution or automatically alter subscriptions.",
    results
  };
  fs.mkdirSync(path.dirname(REPORT), { recursive: true });
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report.counts, null, 2));
}
main().catch(error => { console.error(error); process.exit(1); });
