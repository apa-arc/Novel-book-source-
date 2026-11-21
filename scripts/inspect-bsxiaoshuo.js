#!/usr/bin/env node
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { parseHTML } = require("linkedom");

const ROOT = path.resolve(__dirname, "..");
const BASE = "https://www.bsxiaoshuo.com/";
const BOOK = "https://www.bsxiaoshuo.com/mulu/2098.html";
const CHAPTER = "https://www.bsxiaoshuo.com/html/373855.html";
const headers = { "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36", "accept": "text/html,application/xhtml+xml" };

async function get(url) {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(20000), redirect: "follow" });
  return { status: response.status, url: response.url, html: await response.text() };
}
function nodeSummary(node) {
  return {
    tag: node.tagName?.toLowerCase() || "",
    id: node.id || "",
    className: String(node.className?.baseVal || node.className || "").slice(0, 120),
    textLength: (node.textContent || "").trim().length,
    text: (node.textContent || "").trim().replace(/\s+/g, " ").slice(0, 160)
  };
}
(async () => {
  const home = await get(BASE);
  const homeDoc = parseHTML(home.html).document;
  const forms = [...homeDoc.querySelectorAll("form")].map(form => ({
    action: form.getAttribute("action") || "",
    method: (form.getAttribute("method") || "GET").toUpperCase(),
    id: form.id || "",
    className: String(form.className || ""),
    inputs: [...form.querySelectorAll("input,button,select")].map(el => ({
      tag: el.tagName.toLowerCase(),
      type: el.getAttribute("type") || "",
      name: el.getAttribute("name") || "",
      value: el.getAttribute("value") || "",
      placeholder: el.getAttribute("placeholder") || ""
    }))
  }));
  const book = await get(BOOK);
  const bookDoc = parseHTML(book.html).document;
  const chapter = await get(CHAPTER);
  const chapterDoc = parseHTML(chapter.html).document;
  const searchForms = forms.filter(f => /search|找书|keyword|key|book/i.test(JSON.stringify(f)));
  const bookLinks = [...bookDoc.querySelectorAll('a[href]')].map(a => ({
    text: (a.textContent || "").trim().replace(/\s+/g, " ").slice(0, 100),
    href: a.getAttribute("href") || ""
  })).filter(a => /\/html\//i.test(a.href));
  const contentCandidates = [...chapterDoc.querySelectorAll("div,article,section,p")].map(nodeSummary)
    .filter(x => x.textLength >= 300)
    .sort((a,b) => b.textLength-a.textLength).slice(0,20);
  const report = {
    generatedAt: new Date().toISOString(),
    homepage: { status: home.status, finalUrl: home.url, title: homeDoc.querySelector("title")?.textContent || "", forms, searchForms },
    bookPage: { status: book.status, finalUrl: book.url, title: bookDoc.querySelector("title")?.textContent || "", headings: [...bookDoc.querySelectorAll("h1,h2,h3")].map(nodeSummary), chapterLinks: bookLinks.slice(0,30) },
    chapterPage: { status: chapter.status, finalUrl: chapter.url, title: chapterDoc.querySelector("title")?.textContent || "", headings: [...chapterDoc.querySelectorAll("h1,h2,h3")].map(nodeSummary), contentCandidates }
  };
  const out = path.join(ROOT, "reports", "bsxiaoshuo-inspection.json");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ homepageStatus: home.status, forms: forms.length, searchForms: searchForms.length, bookStatus: book.status, chapterStatus: chapter.status, contentCandidates: contentCandidates.length, output: out }, null, 2));
})().catch(error => { console.error(error); process.exit(1); });
