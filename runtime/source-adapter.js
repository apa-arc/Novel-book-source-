"use strict";

const { executeSelector } = require("./selector-engine");
const { cleanPromotionalContent } = require("./text-quality");

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

function first(document, selector, context) {
  if (!selector) return undefined;
  const values = executeSelector(document, selector, context);
  return Array.isArray(values) ? values.filter(value => value != null && String(value).trim()).map(String).join("\n") : values;
}

function all(document, selector, context) {
  if (!selector) return [];
  const selected = executeSelector(document, { ...selector, output: "all" }, context);
  if (Array.isArray(selected)) return selected;
  if (!selected || typeof selected !== "object") return [];
  const recordKeys = ["name","title","bookName","book_name","novelName","chapterName","chapter_name","bookUrl","chapterUrl"];
  if (typeof selected.querySelectorAll === "function" || recordKeys.some(key => Object.prototype.hasOwnProperty.call(selected,key))) return [selected];
  return Object.values(selected);
}

function value(node, selector, context) {
  if (!selector) return undefined;
  const result = executeSelector(node, selector, context);
  return Array.isArray(result) ? result.filter(value => value != null && String(value).trim()).map(String).join("\n") : result;
}

function isPlaceholderCover(value) {
  const url = String(value || "").trim().toLowerCase().split(/[?#]/, 1)[0];
  if (!url) return true;
  return /(?:^|[\\/_-])(?:loading|placeholder|lazy|default(?:img|image|cover)?|book[-_]?default|cover[-_]?default|no[-_]?cover|nocover|no[-_]?pic|nopic|no[-_]?image|noimg|none)(?:[._/-]|$)/i.test(url);
}

function firstImageUrl(value, isSrcset = false) {
  let url = String(value || "").trim();
  if (isSrcset) url = url.split(",")[0].trim().split(/\s+/)[0];
  return url;
}

function fallbackCover(node, context) {
  const attributes = ["data-src", "data-original", "data-original-src", "data-lazy-src", "data-lazy", "data-ks-lazyload", "data-url", "data-echo", "data-srcset", "srcset", "src"];
  let placeholder = "";
  for (const attribute of attributes) {
    const raw = value(node, { engine: "css", query: "img", output: "attr:" + attribute }, context);
    const candidate = firstImageUrl(raw, attribute === "srcset" || attribute === "data-srcset");
    if (!candidate) continue;
    if (isPlaceholderCover(candidate)) {
      if (!placeholder) placeholder = candidate;
      continue;
    }
    return candidate;
  }
  return "";
}

function createAdapter(config) {
  const safe = assertConfig(config);
  const allow = value => resolveAllowed(value, safe.baseUrl, safe.domains);
  const bookVariables = new Map();
  const chapterVariables = new Map();
  async function load(url, http) {
    if (!http || typeof http.get !== "function") throw new Error("host-http-get-required");
    const target = resolveAllowed(url, safe.baseUrl, safe.domains, true);
    const response = await http.get(target);
    if (!response || !response.document) throw new Error("host-response-document-required");
    if (response.url) resolveAllowed(response.url, target, safe.domains, true);
    return response.document;
  }
  function extract(node, fields, context = { variables: {} }) {
    const out = {};
    for (const [key, selector] of Object.entries(fields || {})) {
      let raw = value(node, selector, context);
      if (key === "coverUrl" && isPlaceholderCover(raw)) raw = fallbackCover(node, context);
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
      const listContext = { variables: {} };
      const nodes = all(document, config.search.list, listContext);
      return nodes.map(node => {
        const context = { variables: { ...listContext.variables } };
        const item = extract(node, config.search.fields, context);
        if (item.bookUrl) bookVariables.set(item.bookUrl, { ...context.variables });
        return item;
      }).filter(item => item.title && item.bookUrl);
    },
    async getBookDetail({ bookUrl, http }) {
      const url = resolveAllowed(bookUrl, safe.baseUrl, safe.domains, true);
      const document = await load(url, http);
      const context = { variables: { ...(bookVariables.get(url) || {}) } };
      const detail = extract(document, config.bookInfo?.fields, context);
      bookVariables.set(url, { ...context.variables });
      return detail;
    },
    async getChapters({ bookUrl, http }) {
      const url = resolveAllowed(bookUrl, safe.baseUrl, safe.domains, true);
      const document = await load(url, http);
      const bookContext = { variables: { ...(bookVariables.get(url) || {}) } };
      const nodes = all(document, config.toc?.list, bookContext);
      bookVariables.set(url, { ...bookContext.variables });
      return nodes.map((node, index) => {
        const context = { variables: { ...bookContext.variables } };
        const item = { ...extract(node, config.toc.fields, context), index };
        if (item.chapterUrl) chapterVariables.set(item.chapterUrl, { ...context.variables });
        return item;
      }).filter(item => item.title && item.chapterUrl);
    },
    async getContent({ chapterUrl, http }) {
      let currentUrl = resolveAllowed(chapterUrl, safe.baseUrl, safe.domains, true);
      const visited = new Set();
      const parts = [];
      let title;
      const context = { variables: { ...(chapterVariables.get(currentUrl) || {}) } };
      for (let page = 0; page < 12; page++) {
        if (visited.has(currentUrl)) throw new Error("chapter-page-cycle");
        visited.add(currentUrl);
        const document = await load(currentUrl, http);
        if (!title) title = first(document, config.content?.title, context);
        const body = first(document, config.content?.body, context);
        if (typeof body !== "string" || !body.trim()) {
          if (parts.length === 0) throw new Error("chapter-content-empty");
          break;
        }
        const cleaned = cleanPromotionalContent(body);
        if (cleaned.content) parts.push(cleaned.content);
        const next = first(document, config.content?.nextPage, context);
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
