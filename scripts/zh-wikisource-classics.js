"use strict";

const { resolveAllowed } = require("../runtime/source-adapter");

const BASE = "https://zh.wikisource.org/zh-hans/";
const DOMAINS = new Set(["zh.wikisource.org"]);

function checkedUrl(value, base = BASE, required = false) {
  return resolveAllowed(value, base, DOMAINS, required);
}

function text(node) {
  return String(node && (node.innerText || node.textContent) || "").replace(/\\s+/g, " ").trim();
}

function first(root, selector) {
  return root && typeof root.querySelector === "function" ? root.querySelector(selector) : null;
}

function all(root, selector) {
  return root && typeof root.querySelectorAll === "function"
    ? Array.from(root.querySelectorAll(selector))
    : [];
}

async function load(url, http) {
  if (!http || typeof http.get !== "function") throw new Error("host-http-get-required");
  const target = checkedUrl(url, BASE, true);
  const response = await http.get(target);
  if (!response || !response.document) throw new Error("host-response-document-required");
  if (response.url) checkedUrl(response.url, target, true);
  return response.document;
}

function createAdapter() {
  return {
    async search({ keyword, page = 1, http }) {
      if (!String(keyword || "").trim()) return [];
      const p = Math.max(1, Number(page) || 1);
      const url = "https://zh.wikisource.org/wiki/Special:Search?search=" +
        encodeURIComponent(String(keyword).trim()) + "&ns0=0&offset=" + ((p - 1) * 20);
      const document = await load(url, http);
      return all(document, ".mw-search-result").map(item => {
        const link = first(item, ".mw-search-result-heading a");
        if (!link) return null;
        const bookUrl = checkedUrl(link.href || link.getAttribute("href"));
        if (!bookUrl) return null;
        const snippet = first(item, ".searchresult");
        return {
          title: text(link),
          bookUrl,
          ...(snippet ? { intro: text(snippet) } : {})
        };
      }).filter(item => item && item.title && item.bookUrl);
    },

    async getBookDetail({ bookUrl, http }) {
      const document = await load(checkedUrl(bookUrl, BASE, true), http);
      const title = first(document, "#firstHeading");
      const paragraphs = all(document, "#mw-content-text .mw-parser-output > p");
      const intro = paragraphs.map(text).find(Boolean);
      return {
        title: text(title) || text(first(document, "h1")),
        ...(intro ? { intro } : {})
      };
    },

    async getChapters({ bookUrl, http }) {
      const document = await load(checkedUrl(bookUrl, BASE, true), http);
      const seen = new Set();
      const chapters = [];
      for (const link of all(document, "#mw-content-text .mw-parser-output a[href]")) {
        const href = link.href || link.getAttribute("href");
        if (!href) continue;
        let decoded = href;
        try { decoded = decodeURIComponent(href); } catch {}
        if (!/\\/第\\d{3}回(?:$|[?#])/.test(decoded)) continue;
        const chapterUrl = checkedUrl(href, bookUrl);
        const title = text(link);
        if (!chapterUrl || !title || seen.has(chapterUrl)) continue;
        seen.add(chapterUrl);
        chapters.push({ title, chapterUrl, index: chapters.length });
      }
      return chapters;
    },

    async getContent({ chapterUrl, http }) {
      const document = await load(checkedUrl(chapterUrl, BASE, true), http);
      const title = text(first(document, "#firstHeading"));
      const source = first(document, "#mw-content-text .mw-parser-output");
      if (!source) throw new Error("chapter-content-container-missing");
      const body = typeof source.cloneNode === "function" ? source.cloneNode(true) : source;
      if (typeof body.querySelectorAll === "function") {
        for (const node of all(body, ".mw-editsection, .noprint, .toc, .catlinks, .mw-indicators, .mw-jump-link, .navbox")) {
          if (node.parentNode) node.parentNode.removeChild(node);
        }
      }
      const content = String(body.innerText || body.textContent || "").trim();
      if (!content) throw new Error("chapter-content-empty");
      return { ...(title ? { title } : {}), content };
    }
  };
}

module.exports = createAdapter();
