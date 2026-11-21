import fs from "node:fs";
import { parseSourceSubscription } from "../app/src/source-subscription.ts";
import { createSourceHttpClient } from "../app/src/source-runtime.ts";
import { searchNovelSource } from "../app/src/source-search.ts";
import { fetchNovelDetail, fetchNovelChapterList, fetchNovelChapterContent } from "../app/src/source-catalog.ts";
import type { NovelSource } from "../app/src/source.ts";
import { classifyAppSearchError } from "./app-runtime-classification.ts";

const defaultKeywords = ["斗罗", "斗破"];
const keywordsBySource: Record<string, string[]> = { "52shuku-net": ["斗罗", "斗破"], "bsxiaoshuo-com": ["念念不忘遥相望", "傲娇甜妻：萌宝请助攻"] };
const raw = fs.readFileSync("development/candidate-subscription.json", "utf8");
const parsed = parseSourceSubscription(raw);

type Stage = { stage: string; status: "passed" | "failed" | "inconclusive" | "skipped"; detail?: string };
type TermResult = {
  keyword: string;
  searchStatus: "passed" | "failed" | "inconclusive";
  readingStatus: "readable" | "detail-failed" | "catalog-failed" | "content-failed" | "not-tested";
  status: "passed" | "search-only" | "search-inconclusive" | "failed";
  resultCount?: number;
  selectedTitle?: string;
  stages: Stage[];
  error?: string;
};
type Result = { id: string; name: string; status: string; terms: Record<string, TermResult> };

function errorText(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 260);
}

async function testTerm(source: NovelSource, keyword: string): Promise<TermResult> {
  const out: TermResult = { keyword, searchStatus: "failed", readingStatus: "not-tested", status: "failed", stages: [] };
  const client = createSourceHttpClient(source);
  let page;
  try {
    page = await searchNovelSource(source, keyword, client);
    out.searchStatus = "passed";
    out.resultCount = page.items.length;
    out.stages.push({ stage: "搜索", status: "passed", detail: "App 搜索请求及解析成功；结果 " + page.items.length + " 条" });
  } catch (error) {
    out.error = errorText(error);
    out.searchStatus = classifyAppSearchError(out.error);
    out.status = out.searchStatus === "inconclusive" ? "search-inconclusive" : "failed";
    out.stages.push({ stage: "搜索", status: out.searchStatus === "inconclusive" ? "inconclusive" : "failed", detail: out.error });
    out.stages.push({ stage: "详情", status: "skipped", detail: "搜索未成功，无可用书目" });
    out.stages.push({ stage: "目录", status: "skipped", detail: "搜索未成功，无可用书目" });
    out.stages.push({ stage: "正文", status: "skipped", detail: "搜索未成功，无可用书目" });
    return out;
  }

  // A resolved App search is a search pass even when no rows are returned.
  // Reading checks are independent and must never downgrade searchStatus.
  if (page.items.length === 0) {
    out.status = "search-only";
    out.stages.push({ stage: "详情", status: "skipped", detail: "搜索成功但0结果；阅读阶段不测试" });
    out.stages.push({ stage: "目录", status: "skipped", detail: "没有可用书目" });
    out.stages.push({ stage: "正文", status: "skipped", detail: "没有可用章节" });
    return out;
  }

  const match = page.items.find(item => item.title.toLocaleLowerCase().includes(keyword.toLocaleLowerCase())) || page.items[0];
  out.selectedTitle = match.title;
  out.status = "search-only";
  try {
    const detail = await fetchNovelDetail(source, match, client);
    if (!detail.title) throw new Error("详情页没有书名");
    out.stages.push({ stage: "详情", status: "passed", detail: detail.title });
  } catch (error) {
    out.readingStatus = "detail-failed";
    out.error = errorText(error);
    out.stages.push({ stage: "详情", status: "failed", detail: out.error });
  }

  let chapters;
  try {
    chapters = await fetchNovelChapterList(source, match, client);
    if (!chapters.length) throw new Error("目录为空");
    out.stages.push({ stage: "目录", status: "passed", detail: chapters.length + " 章；首章「" + chapters[0].title + "」" });
  } catch (error) {
    out.readingStatus = "catalog-failed";
    out.error = errorText(error);
    out.stages.push({ stage: "目录", status: "failed", detail: out.error });
    out.stages.push({ stage: "正文", status: "skipped", detail: "目录不可用，无法取得章节链接" });
    return out;
  }

  try {
    const first = await fetchNovelChapterContent(source, chapters[0], client);
    if (!first.content || first.content.trim().length < 100) throw new Error("首章正文为空或少于100字");
    const lastChapter = chapters[chapters.length - 1];
    if (lastChapter && lastChapter.url !== chapters[0].url) {
      const last = await fetchNovelChapterContent(source, lastChapter, client);
      if (!last.content || last.content.trim().length < 100) throw new Error("末章正文不可读或少于100字");
    }
    out.readingStatus = "readable";
    out.status = "passed";
    out.stages.push({ stage: "正文", status: "passed", detail: "首章及末章正文均通过100字检查" });
  } catch (error) {
    out.readingStatus = "content-failed";
    out.error = errorText(error);
    out.stages.push({ stage: "正文", status: "failed", detail: out.error });
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
    }
  });
  await Promise.all(workers);
  return output;
}

(async () => {
  const compatibleById = new Map(parsed.compatible.map(item => [item.remoteId, item]));
  const entries = JSON.parse(raw).sources as any[];
  const sourceResults = await mapLimit(entries, 2, async entry => {
    const result: Result = { id: entry.id, name: entry.name, status: "failed", terms: {} };
    const compatible = compatibleById.get(entry.id);
    if (!compatible) {
      result.terms["订阅校验"] = {
        keyword: "订阅校验", searchStatus: "failed", readingStatus: "not-tested", status: "failed",
        stages: [{ stage: "导入校验", status: "failed", detail: parsed.unsupported.find(x => x.id === entry.id)?.reason || "App 不兼容" }]
      };
      return result;
    }
    const source = { ...compatible, id: entry.id, enabled: true, importedAt: Date.now() } as unknown as NovelSource;
    const keywords = keywordsBySource[entry.id] || defaultKeywords;
    for (const keyword of keywords) result.terms[keyword] = await testTerm(source, keyword);
    const terms = Object.values(result.terms);
    const passedRequests = terms.filter(x => x.searchStatus === "passed").length;
    const positive = terms.some(x => (x.resultCount || 0) > 0);
    const readable = terms.every(x => x.readingStatus === "readable");
    result.status = terms.some(x => x.searchStatus === "inconclusive") ? "environment-inconclusive"
      : terms.some(x => x.searchStatus === "failed") ? "search-failed"
      : passedRequests === terms.length && positive && readable ? "passed"
      : passedRequests === terms.length && positive ? "search-qualified-reading-needs-repair"
      : passedRequests === terms.length ? "search-passed-zero-results" : "not-qualified";
    return result;
  });

  const allTerms = sourceResults.flatMap(x => Object.values(x.terms));
  const counts = {
    total: sourceResults.length,
    appCompatible: parsed.compatible.length,
    appUnsupported: parsed.unsupported.length,
    searchRequestsPassed: allTerms.filter(x => x.searchStatus === "passed").length,
    searchRequestsFailed: allTerms.filter(x => x.searchStatus === "failed").length,
    searchRequestsInconclusive: allTerms.filter(x => x.searchStatus === "inconclusive").length,
    fullyPassed: sourceResults.filter(x => x.status === "passed").length,
    searchQualifiedReadingNeedsRepair: sourceResults.filter(x => x.status === "search-qualified-reading-needs-repair").length,
    environmentInconclusive: sourceResults.filter(x => x.status === "environment-inconclusive").length,
    zeroResultOnly: sourceResults.filter(x => x.status === "search-passed-zero-results").length
  };
  fs.mkdirSync("reports", { recursive: true });
  fs.writeFileSync("reports/app-candidate-live-test.json", JSON.stringify({
    generatedAt: new Date().toISOString(), defaultKeywords, keywordsBySource,
    policy: "Search request/parse success is independent from reading stages; environment errors are inconclusive; zero results are not search failures.",
    counts, results: sourceResults
  }, null, 2));
  for (const result of sourceResults) {
    const summary = Object.entries(result.terms).map(([key, value]) => key + ":search=" + value.searchStatus + ",read=" + value.readingStatus + (value.error ? " (" + value.error + ")" : "")).join(" | ");
    console.log(result.name + " [" + result.status + "] " + summary);
  }
  console.log("SUMMARY " + JSON.stringify(counts));
})();
