"use strict";

const { scanArticles } = require("./text-quality");

function safeError(error) {
  return String(error && error.message || error || "unknown-error").slice(0, 240);
}

function validateHttpUrl(value, allowedHosts) {
  let url;
  try { url = new URL(value); } catch { throw new Error("invalid-result-url"); }
  if (url.protocol !== "https:" || url.username || url.password || !allowedHosts.has(url.hostname.toLowerCase())) {
    throw new Error("result-url-outside-source-allowlist");
  }
  return url.href;
}

async function runSourceTests({ adapter, http, profile, source, sampleChapters = 3 }) {
  const stages = [];
  const articles = [];
  const hosts = new Set((source && source.domains || []).map(x => String(x).toLowerCase()));
  const record = (name, fn) => stages.push({ name, ...fn });
  const run = async (name, operation) => {
    try { const detail = await operation(); record(name, { status: "passed", detail }); return detail; }
    catch (error) { record(name, { status: "failed", error: safeError(error) }); throw error; }
  };
  const report = { schemaVersion: 1, sourceId: source && source.id || "unknown", sourceVersion: source && source.version || "unknown", testedAt: new Date().toISOString(), mode: "host-injected", stages, summary: null, articleQuality: null };
  try {
    if (!adapter || !profile || !http || typeof http.get !== "function" || hosts.size === 0) throw new Error("tester-input-incomplete");
    for (const method of ["search", "getBookDetail", "getChapters", "getContent"]) if (typeof adapter[method] !== "function") throw new Error("adapter-method-missing:" + method);
    const results = await run("search", async () => {
      const items = await adapter.search({ keyword: profile.keyword, page: 1, http });
      if (!Array.isArray(items) || items.length === 0) throw new Error("search-returned-no-results");
      for (const item of items) { if (!item || typeof item.title !== "string" || !item.title.trim()) throw new Error("search-result-title-missing"); validateHttpUrl(item.bookUrl, hosts); }
      const chosen = profile.expectedTitlePattern ? items.find(item => new RegExp(profile.expectedTitlePattern, "i").test(item.title)) : items[0];
      if (!chosen) throw new Error("expected-search-result-not-found");
      return { resultCount: items.length, selectedTitle: chosen.title, selectedBookUrl: chosen.bookUrl };
    });
    const bookUrl = profile.bookUrl ? validateHttpUrl(profile.bookUrl, hosts) : results.selectedBookUrl;
    await run("bookDetail", async () => {
      const item = await adapter.getBookDetail({ bookUrl, http });
      if (!item || typeof item.title !== "string" || !item.title.trim()) throw new Error("book-detail-title-missing");
      return { titlePresent: true, introPresent: typeof item.intro === "string" && !!item.intro.trim() };
    });
    const chapters = await run("chapters", async () => {
      const items = await adapter.getChapters({ bookUrl, http });
      if (!Array.isArray(items) || items.length === 0) throw new Error("chapter-list-empty");
      const seen = new Set();
      for (const [index, item] of items.entries()) {
        if (!item || typeof item.title !== "string" || !item.title.trim()) throw new Error("chapter-title-missing");
        const url = validateHttpUrl(item.chapterUrl, hosts);
        if (seen.has(url)) throw new Error("duplicate-chapter-url");
        seen.add(url);
        if (item.index !== undefined && item.index !== index) throw new Error("chapter-index-not-sequential");
      }
      return { chapterCount: items.length, duplicateUrls: 0 };
    });
    const sample = (await adapter.getChapters({ bookUrl, http })).slice(0, Math.max(1, Math.min(10, Number(sampleChapters) || 3)));
    for (const chapter of sample) {
      await run("content:" + articles.length, async () => {
        const content = await adapter.getContent({ chapterUrl: validateHttpUrl(chapter.chapterUrl, hosts), http });
        if (!content || typeof content.content !== "string" || !content.content.trim()) throw new Error("chapter-content-empty");
        articles.push({ title: chapter.title, content: content.content });
        return { title: chapter.title, contentLength: content.content.length };
      });
    }
    report.articleQuality = scanArticles(articles).summary;
    const failed = stages.filter(item => item.status === "failed").length;
    report.summary = { passedStages: stages.length - failed, failedStages: failed, sampledChapters: articles.length, qualityPassed: report.articleQuality.suspect === 0 && report.articleQuality.review === 0 && report.articleQuality.duplicates === 0 };
    if (!report.summary.qualityPassed) throw new Error("chapter-text-quality-check-failed");
    report.status = "passed";
  } catch (error) {
    report.status = "failed";
    report.error = safeError(error);
    const failed = stages.filter(item => item.status === "failed").length;
    report.summary = { passedStages: stages.length - failed, failedStages: failed, sampledChapters: articles.length, qualityPassed: report.articleQuality ? report.articleQuality.suspect === 0 && report.articleQuality.review === 0 && report.articleQuality.duplicates === 0 : false };
  }
  return report;
}

module.exports = { runSourceTests };