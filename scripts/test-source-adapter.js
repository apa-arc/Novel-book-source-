"use strict";
const assert = require("node:assert/strict");
const { createAdapter, resolveAllowed } = require("../runtime/source-adapter");

function node(tag, attrs = {}, text = "", children = []) {
  const n = {
    nodeType: 1, tagName: tag.toUpperCase(), attributes: attrs, children, childNodes: [],
    textContent: text || children.map(x => x.textContent).join(""),
    getAttribute(name) { return Object.prototype.hasOwnProperty.call(attrs, name) ? attrs[name] : null; },
    querySelectorAll(query) {
      const found = [];
      const walk = parent => { for (const child of parent.children || []) { found.push(child); walk(child); } };
      walk(this);
      if (query === "*") return found;
      if (query.startsWith(".")) return found.filter(x => (x.attributes.class || "").split(/\s+/).includes(query.slice(1)));
      if (query.startsWith("#")) return found.filter(x => x.attributes.id === query.slice(1));
      if (/^[a-z][a-z0-9-]*$/i.test(query)) return found.filter(x => x.tagName.toLowerCase() === query.toLowerCase());
      throw new Error("unsupported-fixture-query");
    }
  };
  n.childNodes = text ? [{ nodeType: 3, nodeValue: text }] : children;
  return n;
}
const chain = (steps, output = "text") => ({ engine: "legado-chain", steps, output });
const root = node("main", {}, "", [
  node("article", { class: "book" }, "", [
    node("a", { class: "title", href: "/book/1" }, "测试小说"),
    node("span", { class: "author" }, "作者甲")
  ]),
  node("div", { class: "chapter" }, "", [node("a", { href: "/chapter/1" }, "第一章")]),
  node("div", { class: "chapter" }, "", [node("a", { href: "/chapter/2" }, "第二章")]),
  node("div", { class: "body" }, "这是正文内容")
]);
const selector = (kind, name, output = "text") => chain([{ kind, name, index: null }], output);
const config = {
  baseUrl: "https://example.test",
  domains: ["example.test"],
  search: {
    url: (keyword, page) => `https://example.test/search?q=${encodeURIComponent(keyword)}&page=${page}`,
    list: { engine: "css", query: ".book", output: "all" },
    fields: {
      title: selector("class", "title"),
      bookUrl: selector("class", "title", "href"),
      author: selector("class", "author")
    }
  },
  bookInfo: { fields: { title: selector("class", "title"), author: selector("class", "author") } },
  toc: {
    list: { engine: "css", query: ".chapter", output: "all" },
    fields: { title: chain([{ kind: "tag", name: "a", index: null }]), chapterUrl: { engine: "css", query: "*", output: "href" } }
  },
  content: { title: selector("class", "title"), body: selector("class", "body") }
};
const requests = [];
const http = { async get(url) { requests.push(url); return { url, document: root }; } };
(async () => {
  const adapter = createAdapter(config);
  assert.deepEqual(await adapter.search({ keyword: "测试", page: 2, http }), [
    { title: "测试小说", bookUrl: "https://example.test/book/1", author: "作者甲" }
  ]);
  assert.deepEqual(await adapter.getBookDetail({ bookUrl: "https://example.test/book/1", http }), {
    title: "测试小说", author: "作者甲"
  });
  const chapters = await adapter.getChapters({ bookUrl: "https://example.test/book/1", http });
  assert.equal(chapters.length, 2);
  assert.equal(chapters[0].chapterUrl, "https://example.test/chapter/1");
  assert.equal(chapters[1].index, 1);
  assert.deepEqual(await adapter.getContent({ chapterUrl: chapters[0].chapterUrl, http }), {
    content: "这是正文内容"
  });
  assert.throws(() => resolveAllowed("http://example.test/a", config.baseUrl, new Set(config.domains)));
  assert.throws(() => resolveAllowed("https://evil.test/a", config.baseUrl, new Set(config.domains)));
  assert.throws(() => resolveAllowed("https://user:pass@example.test/a", config.baseUrl, new Set(config.domains)));
  const badHttp = { async get(url) { return { url: "https://evil.test/redirect", document: root }; } };
  await assert.rejects(() => adapter.getBookDetail({ bookUrl: "https://example.test/book/1", http: badHttp }), /allowlist/);
  console.log("Source adapter runtime fixture tests passed.");
})().catch(error => { console.error(error); process.exitCode = 1; });
