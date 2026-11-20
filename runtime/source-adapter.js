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
  return executeSelector(document, { ...selector, output: "all" });
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
      const url = resolveAllowed(chapterUrl, safe.baseUrl, safe.domains, true);
      const document = await load(url, http);
      const title = first(document, config.content?.title);
      const content = first(document, config.content?.body);
      if (typeof content !== "string" || !content.trim()) throw new Error("chapter-content-empty");
      return { ...(title ? { title: String(title).trim() } : {}), content: content.trim() };
    }
  };
}

module.exports = { createAdapter, resolveAllowed };
