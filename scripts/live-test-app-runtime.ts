import fs from "node:fs";
import { parseSourceSubscription } from "../app/src/source-subscription.ts";
import { createSourceHttpClient } from "../app/src/source-runtime.ts";
import { searchNovelSource } from "../app/src/source-search.ts";
import { fetchNovelDetail, fetchNovelChapterList, fetchNovelChapterContent } from "../app/src/source-catalog.ts";
import type { NovelSource } from "../app/src/source.ts";
import { classifyAppSearchError } from "./app-runtime-classification.ts";

const keywords = ["斗罗", "斗破"];
const healthSubscriptionPath = fs.existsSync("config/health-check-subscription.json") ? "config/health-check-subscription.json" : "subscription.json";
const raw = fs.readFileSync(healthSubscriptionPath, "utf8");
const subscription = JSON.parse(raw);
const parsed = parseSourceSubscription(raw);

type Stage = { stage: string; status: "passed" | "failed" | "inconclusive" | "skipped"; detail?: string };
type TermResult = {
  keyword: string;
  status: "readable" | "search-only" | "catalog-only" | "search-inconclusive" | "failed";
  searchStatus: "passed" | "failed" | "inconclusive";
  readingStatus: "readable" | "catalog-failed" | "content-failed" | "not-tested";
  resultCount?: number;
  selectedTitle?: string;
  stages: Stage[];
  error?: string;
  attempts?: number;
  matchingResultCount?: number;
  relevanceStatus?: "matched" | "zero-results" | "no-title-match";
};
type Result = { id: string; name: string; status: string; terms: Record<string, TermResult> };

function errorText(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 300);
}

/**
 * The app counts a search as successful when searchNovelSource resolves,
 * including an empty result array. Reading failures are recorded separately.
 * Node-only network blocks are inconclusive, not proof that an iPhone source is broken.
 */
async function testTerm(source: NovelSource, keyword: string): Promise<TermResult> {
  const out: TermResult = {
    keyword,
    status: "failed",
    searchStatus: "failed",
    readingStatus: "not-tested",
    stages: [],
  };
  const client = createSourceHttpClient(source);

  let page;
  let lastError = "";
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      page = await searchNovelSource(source, keyword, client);
      out.attempts = attempt;
      break;
    } catch (error) {
      lastError = errorText(error);
      out.attempts = attempt;
      const classification = classifyAppSearchError(lastError);
      const isForbiddenOrRedirect = /HTTP\s*403\b|redirect|重定向/i.test(lastError);
      const retryLimit = isForbiddenOrRedirect ? 2 : maxAttempts;
      if (attempt < retryLimit) {
        // Avoid hammering deterministic access blocks; give rate limits and transient
        // transport failures a longer recovery window before the next attempt.
        const delayMs = /HTTP\s*429\b/i.test(lastError)
          ? 8000 * attempt
          : /HTTP\s*5\d\d\b|timed?\s*out|timeout|超时|ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|fetch failed|网络请求失败/i.test(lastError)
            ? 4000 * attempt
            : isForbiddenOrRedirect
              ? 5000
              : 2500 * attempt;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }
      out.error = lastError;
      out.searchStatus = classification;
    }
  }
  if (!page) {
    out.status = out.searchStatus === "inconclusive" ? "search-inconclusive" : "failed";
    out.stages.push({
      stage: "搜索",
      status: out.searchStatus === "inconclusive" ? "inconclusive" : "failed",
      detail: "连续 " + maxAttempts + " 次请求仍未成功：" + lastError,
    });
    out.stages.push({ stage: "目录", status: "skipped", detail: "搜索请求未成功或响应无法解析" });
    out.stages.push({ stage: "详情", status: "skipped", detail: "没有可用搜索结果" });
    out.stages.push({ stage: "正文", status: "skipped", detail: "没有可用搜索结果" });
    return out;
  }
  out.searchStatus = "passed";
  out.resultCount = page.items.length;
  out.matchingResultCount = page.items.filter((item) =>
    item.title.toLocaleLowerCase().includes(keyword.toLocaleLowerCase())
  ).length;
  out.stages.push({
    stage: "搜索",
    status: "passed",
    detail: "App 搜索请求及解析成功；返回 " + page.items.length + " 条结果；标题匹配关键词 " + out.matchingResultCount + " 条；尝试 " + out.attempts + " 次",
  });

  if (page.items.length === 0) {
    out.relevanceStatus = "zero-results";
    out.status = "search-only";
    out.readingStatus = "not-tested";
    out.stages.push({
      stage: "目录",
      status: "skipped",
      detail: "搜索请求及解析成功，但本次关键词返回 0 条；按 App 搜索日志仍计为成功",
    });
    out.stages.push({ stage: "详情", status: "skipped", detail: "没有搜索结果可供打开" });
    out.stages.push({ stage: "正文", status: "skipped", detail: "没有搜索结果可供打开" });
    return out;
  }

  const summary = page.items.find((item) => item.title.toLocaleLowerCase().includes(keyword.toLocaleLowerCase()));
  if (!summary) {
    out.relevanceStatus = "no-title-match";
    out.status = "search-only";
    out.readingStatus = "not-tested";
    out.stages.push({
      stage: "目录",
      status: "skipped",
      detail: "搜索请求成功但没有标题匹配关键词的结果；不使用无关首条结果冒充阅读测试",
    });
    out.stages.push({ stage: "详情", status: "skipped", detail: "没有相关搜索结果可供打开" });
    out.stages.push({ stage: "正文", status: "skipped", detail: "没有相关搜索结果可供打开" });
    return out;
  }
  out.relevanceStatus = "matched";
  out.selectedTitle = summary.title;

  let chapters;
  let catalogError = "";
  const catalogMaxAttempts = 3;
  for (let attempt = 1; attempt <= catalogMaxAttempts; attempt++) {
    try {
      chapters = await fetchNovelChapterList(source, summary, client);
      if (!chapters.length) throw new Error("App 目录解析结果为空");
      out.stages.push({
        stage: "目录",
        status: "passed",
        detail: "获取 " + chapters.length + " 章；首章「" + chapters[0].title + "」；尝试 " + attempt + " 次",
      });
      break;
    } catch (error) {
      catalogError = errorText(error);
      const transient = /HTTP\\s*5\\d\\d\\b|HTTP\\s*429\\b|timed?\\s*out|timeout|超时|ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|fetch failed|网络请求失败/i.test(catalogError);
      if (!transient || attempt === catalogMaxAttempts) break;
      await new Promise((resolve) => setTimeout(resolve, attempt === 1 ? 4000 : 8000));
    }
  }
  if (!chapters || !chapters.length) {
    out.error = catalogError;
    out.status = "search-only";
    out.readingStatus = "catalog-failed";
    out.stages.push({ stage: "目录", status: "failed", detail: "目录最多重试 " + catalogMaxAttempts + " 次后仍失败：" + catalogError });
    out.stages.push({ stage: "详情", status: "skipped", detail: "App 阅读流程先加载目录；目录失败后不会继续详情请求" });
    out.stages.push({ stage: "正文", status: "skipped", detail: "目录不可用，无法取得章节链接" });
    return out;
  }

  try {
    const detail = await fetchNovelDetail(source, summary, client);
    out.stages.push({
      stage: "详情（可选）",
      status: detail.title ? "passed" : "failed",
      detail: detail.title ? "详情页读取成功：" + detail.title : "详情页没有识别到书名",
    });
  } catch (error) {
    out.stages.push({
      stage: "详情（可选）",
      status: "failed",
      detail: "详情请求失败，但按 App 逻辑不阻断阅读：" + errorText(error),
    });
  }

  try {
    const content = await fetchNovelChapterContent(source, chapters[0], client);
    if (!content.content || !content.content.trim()) throw new Error("App 返回的章节正文为空");
    out.stages.push({
      stage: "正文",
      status: "passed",
      detail: "首章正文读取成功（" + content.content.trim().length + " 字符）",
    });
    out.status = "readable";
    out.readingStatus = "readable";
  } catch (error) {
    const message = errorText(error);
    out.error = message;
    out.stages.push({ stage: "正文", status: "failed", detail: message });
    out.status = "catalog-only";
    out.readingStatus = "content-failed";
  }

  return out;
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const output: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      output[index] = await fn(items[index]);
      await new Promise((resolve) => setTimeout(resolve, 1200));
    }
  });
  await Promise.all(workers);
  return output;
}

(async () => {
  const compatibleById = new Map(parsed.compatible.map(item => [item.remoteId, item]));
  const entries = Array.isArray(subscription.sources) ? subscription.sources : [];
  // Run sources sequentially with a short cooldown to reduce cross-source rate limits and timeouts.
  const sourceResults = await mapLimit(entries, 1, async (entry: any) => {
    const result: Result = { id: entry.id, name: entry.name, status: "failed", terms: {} };
    const compatible = compatibleById.get(entry.id);
    if (!compatible) {
      result.terms["订阅校验"] = {
        keyword: "订阅校验",
        status: "failed",
        searchStatus: "failed",
        readingStatus: "not-tested",
        stages: [{
          stage: "App 导入校验",
          status: "failed",
          detail: parsed.unsupported.find(item => item.id === entry.id)?.reason || "App 不兼容",
        }],
      };
      return result;
    }

    const source = { ...compatible, id: entry.id, enabled: true, importedAt: Date.now() } as unknown as NovelSource;
    for (const keyword of keywords) result.terms[keyword] = await testTerm(source, keyword);

    const terms = Object.values(result.terms);
    const states = terms.map(item => item.status);
    result.status = states.every(state => state === "readable")
      ? "readable-both"
      : states.some(state => state === "readable")
        ? "readable-one"
        : terms.every(item => item.searchStatus === "inconclusive")
          ? "environment-inconclusive"
          : terms.some(item => item.searchStatus === "passed")
            ? "search-or-catalog-only"
            : terms.some(item => item.searchStatus === "inconclusive")
              ? "partly-inconclusive"
              : "failed";
    return result;
  });

  const allTerms = sourceResults.flatMap(result => Object.values(result.terms));
  const counts = {
    total: sourceResults.length,
    appCompatible: parsed.compatible.length,
    appUnsupported: parsed.unsupported.length,
    readableBoth: sourceResults.filter(result => result.status === "readable-both").length,
    readableOne: sourceResults.filter(result => result.status === "readable-one").length,
    searchOrCatalogOnly: sourceResults.filter(result => result.status === "search-or-catalog-only").length,
    environmentInconclusive: sourceResults.filter(result => result.status === "environment-inconclusive" || result.status === "partly-inconclusive").length,
    failed: sourceResults.filter(result => result.status === "failed").length,
    searchPassed: allTerms.filter(term => term.searchStatus === "passed").length,
    searchFailed: allTerms.filter(term => term.searchStatus === "failed").length,
    searchInconclusive: allTerms.filter(term => term.searchStatus === "inconclusive").length,
    searchRequestsPassed: allTerms.filter(term => term.searchStatus === "passed").length,
    searchZeroResults: allTerms.filter(term => term.searchStatus === "passed" && term.resultCount === 0).length,
    searchHasResultsButNoTitleMatch: allTerms.filter(term => term.searchStatus === "passed" && (term.resultCount || 0) > 0 && (term.matchingResultCount || 0) === 0).length,
    readingSkippedForNoTitleMatch: allTerms.filter(term => term.relevanceStatus === "no-title-match" && term.readingStatus === "not-tested").length,
    searchRetriesUsed: allTerms.filter(term => (term.attempts || 0) > 1).length,
    chapterContentPassed: allTerms.filter(term => term.readingStatus === "readable").length,
  };

  fs.mkdirSync("reports", { recursive: true });
  fs.writeFileSync("reports/app-runtime-live-test.json", JSON.stringify({
    generatedAt: new Date().toISOString(),
    testStandard: "AppleNovelApp search semantics + separately reported reading stages; each search retries up to 3 times; transient Node network errors are environment-inconclusive; title relevance is separate from request success; reading tests only use title-matching results; sources run sequentially with 1.2s cooldown",
    keywords,
    counts,
    results: sourceResults,
  }, null, 2));

  for (const result of sourceResults) {
    const summary = Object.entries(result.terms)
      .map(([keyword, term]) => keyword + ":search=" + term.searchStatus + ",read=" + term.readingStatus + (term.error ? " (" + term.error + ")" : ""))
      .join(" | ");
    console.log(result.name + " [" + result.status + "] " + summary);
  }
  console.log("SUMMARY " + JSON.stringify(counts));
})();
