"use strict";

const { executeSelector } = require("./selector-engine");

function assertConfig(config) {
  if (!config || typeof config !== "object") throw new Error("invalid-source-config");
  const base = new URL(config.baseUrl);
  if (base.protocol !== "https:" || base.username || base.password) throw new Error("source-base-url-must-be-https");
  if (!Array.isArray(config.domains) || !config.domains.includes(base.hostname)) throw new Error("source-domain-allowlist-invalid");
  return { baseUrl: base.href, domains: new Set(config.domains.map(x => String(x).toLowerCase())) };
}

function resolveAllowed(value, baseUrl, domains, required = false) {
  if (value == null || value === "") {
    if (required) throw new Error("required-url-missing");
    return undefined;
  }
  const url = new URL(String(value), baseUrl);
  if (url.protocol !== "https:" || url.username || url.password || !domains.has(url.hostname.toLowerCase())) {
    throw new Error("source-url-outside-allowlist");
  }
  return url.href;
}

function first(document, selector) {
  if (!selector) return undefined;
  const values = executeSelector(document, selector);
  return Array.isArray(values) ? values[0] : values;
}

function all(document, selector) {
  if (!selector) return [];
  const selected = executeSelector(document, { ...selector, output: "all" });
  if (Array.isArray(selected)) return selected;
  if (!selected || typeof selected !== "object") return [];
  const recordKeys = ["name","title","bookName","book_name","novelName","chapterName","chapter_name","bookUrl","chapterUrl"];
  if (typeof selected.querySelectorAll === "function" || recordKeys.some(key => Object.prototype.hasOwnProperty.call(selected,key))) return [selected];
  return Object.values(selected);
}

function value(node, selector) {
  if (!selector) return undefined;
  const result = executeSelector(node, selector);
  return Array.isArray(result) ? result[0] : result;
}

function createAdapter(config) {
  const safe = assertConfig(config);
  const allow = value => resolveAllowed(value, safe.baseUrl, safe.domains);
  async function load(url, http) {
    if (!http || typeof http.get !== "function") throw new Error("host-http-get-required");
    const target = resolveAllowed(url, safe.baseUrl, safe.domains, true);
    const response = await http.get(target);
    if (!response || !response.document) throw new Error("host-response-document-required");
    if (response.url) resolveAllowed(response.url, target, safe.domains, true);
    return response.document;
  }
  function extract(node, fields) {
    const out = {};
    for (const [key, selector] of Object.entries(fields || {})) {
      const raw = value(node, selector);
      if (raw == null || raw === "") continue;
      if (["bookUrl", "coverUrl", "chapterUrl"].includes(key)) {
        const url = allow(raw);
        if (url) out[key] = url;
      } else out[key] = String(raw).trim();
    }
    return out;
  }
  return {
    async search({ keyword, page = 1, http }) {
      if (typeof keyword !== "string" || !keyword.trim()) return [];
      const url = typeof config.search?.url === "function"
        ? config.search.url(keyword.trim(), Math.max(1, Number(page) || 1))
        : null;
      const document = await load(url, http);
      return all(document, config.search.list).map(node => extract(node, config.search.fields))
        .filter(item => item.title && item.bookUrl);
    },
    async getBookDetail({ bookUrl, http }) {
      const url = resolveAllowed(bookUrl, safe.baseUrl, safe.domains, true);
      const document = await load(url, http);
      return extract(document, config.bookInfo?.fields);
    },
    async getChapters({ bookUrl, http }) {
      const url = resolveAllowed(bookUrl, safe.baseUrl, safe.domains, true);
      const document = await load(url, http);
      return all(document, config.toc?.list).map((node, index) => ({
        ...extract(node, config.toc.fields),
        index
      })).filter(item => item.title && item.chapterUrl);
    },
    async getContent({ chapterUrl, http }) {
      let currentUrl = resolveAllowed(chapterUrl, safe.baseUrl, safe.domains, true);
      const visited = new Set();
      const parts = [];
      let title;
      for (let page = 0; page < 12; page++) {
        if (visited.has(currentUrl)) throw new Error("chapter-page-cycle");
        visited.add(currentUrl);
        const document = await load(currentUrl, http);
        if (!title) title = first(document, config.content?.title);
        const body = first(document, config.content?.body);
        if (typeof body !== "string" || !body.trim()) {
          if (parts.length === 0) throw new Error("chapter-content-empty");
          break;
        }
        parts.push(body.trim());
        const next = first(document, config.content?.nextPage);
        if (typeof next !== "string" || !next.trim()) break;
        const nextUrl = resolveAllowed(next, currentUrl, safe.domains);
        const currentPath = new URL(currentUrl).pathname;
        const nextPath = new URL(nextUrl).pathname;
        const currentMatch = currentPath.match(/^(.*\/read\/\d+\/\d+)(?:_(\d+))?\.html$/);
        const nextMatch = nextPath.match(/^(.*\/read\/\d+\/\d+)(?:_(\d+))?\.html$/);
        if (!currentMatch || !nextMatch || currentMatch[1] !== nextMatch[1]) break;
        const currentPage = Number(currentMatch[2] || 1);
        const nextPage = Number(nextMatch[2] || 1);
        if (nextPage <= currentPage) break;
        currentUrl = nextUrl;
      }
      return { ...(title ? { title: String(title).trim() } : {}), content: parts.join("\n\n") };
    }
  };
}

module.exports = { createAdapter, resolveAllowed };
