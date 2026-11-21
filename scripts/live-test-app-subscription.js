#!/usr/bin/env node
"use strict";
const fs = require("node:fs");
const { parseHTML } = require("linkedom");

const terms = ["斗罗大陆", "斗破苍穹"];
const input = JSON.parse(fs.readFileSync("subscription.json", "utf8"));
const sources = input.sources || [];
const results = [];

function hostAllowed(url, domains) {
  const u = new URL(url);
  return u.protocol === "https:" && domains.some(d => u.hostname === d || u.hostname.endsWith("." + d));
}
function resolveSafe(raw, base, domains) {
  if (!raw) return "";
  try {
    const u = new URL(raw, base);
    return hostAllowed(u.href, domains) ? u.href : "";
  } catch { return ""; }
}
async function get(url, domains) {
  if (!hostAllowed(url, domains)) throw new Error("URL超出domains白名单: " + url);
  const response = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(18000),
    headers: { "user-agent": "Mozilla/5.0 (compatible; NovelSourceCheck/1.0)", "accept": "text/html,application/xhtml+xml,*/*" }
  });
  const finalUrl = response.url || url;
  if (!hostAllowed(finalUrl, domains)) throw new Error("重定向超出domains白名单: " + finalUrl);
  const body = await response.text();
  if (!response.ok) throw new Error("HTTP " + response.status + " " + finalUrl);
  if (/验证码|访问过于频繁|安全验证|人机验证|cloudflare/i.test(body.slice(0, 5000))) throw new Error("站点返回验证/反爬页面");
  return { url: finalUrl, body };
}
function doc(html) { return parseHTML(html).document; }
function nodes(document, selector) {
  if (!selector) return [];
  return [...document.querySelectorAll(selector)];
}
function text(node, selector, attr) {
  if (!node) return "";
  const el = selector === ":self" ? node : node.querySelector(selector);
  if (!el) return "";
  return attr ? String(el.getAttribute(attr) || "").trim() : String(el.textContent || "").replace(/\s+/g, " ").trim();
}
function template(raw, values) {
  return String(raw || "").replace(/\{(keyword|page|bookUrl|chapterUrl)\}/g, (_, k) => values[k] || "");
}
function stage(result, name, status, extra={}) { result.stages.push({ stage:name, status, ...extra }); }
async function testSource(source) {
  const cfg = source.appConfig || {};
  const rules = cfg.htmlRules || {};
  const domains = source.domains || [];
  const result = { id:source.id, name:source.name, host:new URL(source.baseUrl).hostname, terms:{}, stages:[], status:"failed" };
  if (!cfg.searchUrl || !rules.search || !rules.detail || !rules.chapters || !rules.content) {
    result.error = "缺少App静态HTML规则"; return result;
  }
  let anyComplete = false;
  for (const keyword of terms) {
    const tr = { keyword, status:"failed", stages:[] };
    result.terms[keyword] = tr;
    try {
      const searchUrl = template(cfg.searchUrl, { keyword:encodeURIComponent(keyword), page:"1" });
      const search = await get(searchUrl, domains);
      const sd = doc(search.body);
      const searchItems = nodes(sd, rules.search.itemSelector);
      const books = searchItems.map(n => {
        const titleEl = rules.search.titleSelector === ":self" ? n : n.querySelector(rules.search.titleSelector || "a");
        const urlEl = rules.search.urlSelector === ":self" ? n : n.querySelector(rules.search.urlSelector || "a");
        const title = rules.search.titleAttribute ? String(titleEl?.getAttribute(rules.search.titleAttribute) || "").trim() : String(titleEl?.textContent || "").replace(/\s+/g, " ").trim();
        const href = rules.search.urlAttribute ? String(urlEl?.getAttribute(rules.search.urlAttribute) || "") : String(urlEl?.getAttribute("href") || "");
        return { title, href:resolveSafe(href, search.url, domains) };
      }).filter(x => x.title && x.href);
      if (!books.length) throw new Error("搜索无结果（HTTP 200，选择器未提取到书名/链接）");
      stage(tr,"搜索","passed",{http:200,count:books.length,selected:books[0].title});
      const book = books[0];
      const detailUrl = book.href;
      const detailPage = await get(detailUrl, domains);
      const dd = doc(detailPage.body);
      const detailTitle = text(dd, rules.detail.titleSelector, rules.detail.titleAttribute) || book.title;
      if (!detailTitle) throw new Error("详情页未提取到书名");
      stage(tr,"详情","passed",{http:200,title:detailTitle});
      const bookPath = new URL(book.href).pathname.replace(/^\//,"");
      let tocUrl = template(cfg.chapterListUrl || cfg.bookUrl || "", { bookUrl:bookPath, keyword:encodeURIComponent(keyword), page:"1" });
      if (!tocUrl || tocUrl === cfg.bookUrl) tocUrl = book.href;
      tocUrl = resolveSafe(tocUrl, detailPage.url, domains);
      if (!tocUrl) throw new Error("目录URL无效或超出白名单");
      const tocPage = await get(tocUrl, domains);
      const td = doc(tocPage.body);
      const chapterItems = nodes(td, rules.chapters.itemSelector);
      const chapters = chapterItems.map(n => {
        const title = text(n, rules.chapters.titleSelector);
        const hrefEl = rules.chapters.urlSelector === ":self" ? n : n.querySelector(rules.chapters.urlSelector || "a");
        const href = hrefEl?.getAttribute?.("href") || "";
        return { title, url:resolveSafe(href, tocPage.url, domains) };
      }).filter(c => c.title && c.url);
      if (!chapters.length) throw new Error("目录未提取到有效章节（选择器/链接规则不匹配）");
      stage(tr,"目录","passed",{http:200,count:chapters.length,first:chapters[0].title});
      const chapter = chapters[0];
      const chapterPage = await get(chapter.url, domains);
      const cd = doc(chapterPage.body);
      const contentNode = cd.querySelector(rules.content.contentSelector);
      const content = String(contentNode?.textContent || "").replace(/\s+/g," ").trim();
      if (content.length < 100) throw new Error("正文为空或过短（" + content.length + "字）");
      stage(tr,"正文","passed",{http:200,length:content.length,chapter:chapter.title});
      tr.status = "passed";
      anyComplete = true;
    } catch (e) {
      tr.error = String(e.message || e).slice(0,300);
      tr.status = "failed";
      if (tr.stages.length < 4) stage(tr,["搜索","详情","目录","正文"][tr.stages.length],"failed",{error:tr.error});
    }
  }
  result.status = Object.values(result.terms).every(x=>x.status==="passed") ? "passed-both" : anyComplete ? "passed-one" : "failed";
  return result;
}
(async()=>{
  for (const s of sources) {
    try { results.push(await testSource(s)); }
    catch(e) { results.push({id:s.id,name:s.name,status:"failed",error:String(e.message||e)}); }
    console.log(results.length + "/" + sources.length + " " + s.name + " " + results[results.length-1].status);
  }
  const counts = { total:results.length, passedBoth:results.filter(x=>x.status==="passed-both").length, passedOne:results.filter(x=>x.status==="passed-one").length, failed:results.filter(x=>x.status==="failed").length };
  fs.mkdirSync("reports",{recursive:true});
  fs.writeFileSync("reports/app-subscription-live-test.json",JSON.stringify({generatedAt:new Date().toISOString(),keywords:terms,counts,results},null,2));
  console.log("SUMMARY " + JSON.stringify(counts));
})();
