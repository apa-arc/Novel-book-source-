"use strict";
const assert = require("node:assert/strict");
const adapter = require("./zh-wikisource-classics");

function node({ text = "", href = "", children = [] } = {}) {
  const n = {
    textContent: text, innerText: text, href, children, parentNode: null,
    getAttribute(name) { return name === "href" ? href : null; },
    querySelector(selector) { return query(this, selector)[0] || null; },
    querySelectorAll(selector) { return query(this, selector); },
    cloneNode() { return this; }
  };
  for (const child of children) child.parentNode = n;
  return n;
}
function query(root, selector) {
  const selectors = {
    ".mw-search-result": "searchResult",
    ".mw-search-result-heading a": "searchLink",
    ".searchresult": "snippet",
    "#firstHeading": "heading",
    "#mw-content-text .mw-parser-output > p": "paragraph",
    "#mw-content-text .mw-parser-output a[href]": "chapterLink",
    "#mw-content-text .mw-parser-output": "body"
  };
  return (root.children || []).filter(x => x.testRole === selectors[selector]);
}
function doc(roleNodes) {
  const root = node({ children: roleNodes });
  root.querySelector = selector => query(root, selector)[0] || null;
  root.querySelectorAll = selector => query(root, selector);
  return root;
}
function tagged(role, value) {
  const n = node(value);
  n.testRole = role;
  return n;
}

(async () => {
  const responses = [];
  const http = { async get(url) {
    responses.push(url);
    if (url.includes("Special:Search")) {
      const link = tagged("searchLink", { text: "三国演义", href: "https://zh.wikisource.org/zh-hans/三國志演義" });
      const result = tagged("searchResult", { children: [link, tagged("snippet", { text: "明代章回小说" })] });
      return { document: doc([result]), url };
    }
    if (decodeURIComponent(url).includes("/三國志演義")) {
      const heading = tagged("heading", { text: "三国演义" });
      const p = tagged("paragraph", { text: "作者：罗贯中" });
      const ch1 = tagged("chapterLink", { text: "第一回", href: "https://zh.wikisource.org/zh-hans/三國演義/第001回" });
      return { document: doc([heading, p, ch1]), url };
    }
    const heading = tagged("heading", { text: "三国演义/第001回" });
    const body = tagged("body", { text: "正文内容测试" });
    return { document: doc([heading, body]), url };
  } };
  const found = await adapter.search({ keyword: "三国演义", page: 1, http });
  assert.equal(found.length, 1);
  assert.equal(found[0].title, "三国演义");
  const detail = await adapter.getBookDetail({ bookUrl: found[0].bookUrl, http });
  assert.equal(detail.title, "三国演义");
  const chapters = await adapter.getChapters({ bookUrl: found[0].bookUrl, http });
  assert.equal(chapters.length, 1);
  assert.match(chapters[0].chapterUrl, /第001回/);
  const content = await adapter.getContent({ chapterUrl: chapters[0].chapterUrl, http });
  assert.equal(content.content, "正文内容测试");
  await assert.rejects(() => adapter.getContent({
    chapterUrl: "https://example.com/evil", http
  }), /outside-allowlist/);
  console.log("Chinese Wikisource adapter fixture tests passed.");
})().catch(error => { console.error(error); process.exitCode = 1; });
