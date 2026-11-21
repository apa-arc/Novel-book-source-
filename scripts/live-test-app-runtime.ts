import fs from "node:fs";
import { parseSourceSubscription } from "../app/src/source-subscription.ts";
import { createSourceHttpClient } from "../app/src/source-runtime.ts";
import { searchNovelSource } from "../app/src/source-search.ts";
import { fetchNovelDetail, fetchNovelChapterList, fetchNovelChapterContent } from "../app/src/source-catalog.ts";
import type { NovelSource } from "../app/src/source.ts";

const keywords = ["斗罗大陆", "斗破苍穹"];
const healthSubscriptionPath = fs.existsSync("config/health-check-subscription.json") ? "config/health-check-subscription.json" : "subscription.json";
const raw = fs.readFileSync(healthSubscriptionPath, "utf8");
const subscription = JSON.parse(raw);
const parsed = parseSourceSubscription(raw);

type Stage = { stage: string; status: "passed" | "failed" | "skipped"; detail?: string };
type TermResult = {
  keyword: string;
  status: "readable" | "search-only" | "catalog-only" | "failed";
  resultCount?: number;
  selectedTitle?: string;
  stages: Stage[];
  error?: string;
};
type Result = { id: string; name: string; status: string; terms: Record<string, TermResult> };

function errorText(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 300);
}

/**
 * This scanner deliberately calls the same AppleNovelApp runtime functions as
 * the app. Search success means searchNovelSource resolved, exactly as the
 * app's search log does; it does NOT require an exact title/keyword match.
 * Reading follows the app's order: chapter list first, optional detail second,
 * then chapter content. Detail failure alone never blocks reading.
 */
async function testTerm(source: NovelSource, keyword: string): Promise<TermResult> {
  const out: TermResult = { keyword, status: "failed", stages: [] };
  const client = createSourceHttpClient(source);

  let page;
  try {
    page = await searchNovelSource(source, keyword, client);
    out.resultCount = page.items.length;
    out.stages.push({
      stage: "搜索",
      status: "passed",
      detail: "App 搜索请求及解析成功；返回 " + page.items.length + " 条结果"
    });
  } catch (error) {
    out.error = errorText(error);
    out.stages.push({ stage: "搜索", status: "failed", detail: out.error });
    out.stages.push({ stage: "目录", status: "skipped", detail: "搜索请求未成功或响应无法解析" });
    out.stages.push({ stage: "详情", status: "skipped", detail: "没有可用搜索结果" });
    out.stages.push({ stage: "正文", status: "skipped", detail: "没有可用搜索结果" });
    return out;
  }

  if (page.items.length === 0) {
    out.status = "search-only";
    out.stages.push({ stage: "目录", status: "skipped", detail: "搜索成功，但本次关键词没有返回书目" });
    out.stages.push({ stage: "详情", status: "skipped", detail: "没有搜索结果可供打开" });
    out.stages.push({ stage: "正文", status: "skipped", detail: "没有搜索结果可供打开" });
    return out;
  }

  // The app does not require the returned title to contain the search keyword.
  // It displays parsed results and opens a selected result. Use the first item
  // returned by the same parser, rather than imposing an extra matching rule.
  const summary = page.items[0];
  out.selectedTitle = summary.title;

  let chapters;
  try {
    chapters = await fetchNovelChapterList(source, summary, client);
    if (!chapters.length) throw new Error("App 目录解析结果为空");
    out.stages.push({
      stage: "目录",
      status: "passed",
      detail: "获取 " + chapters.length + " 章；首章「" + chapters[0].title + "」"
    });
  } catch (error) {
    const message = errorText(error);
    out.error = message;
    out.status = "search-only";
    out.stages.push({ stage: "目录", status: "failed", detail: message });
    out.stages.push({ stage: "详情", status: "skipped", detail: "App 阅读流程先加载目录；目录失败后不会继续详情请求" });
    out.stages.push({ stage: "正文", status: "skipped", detail: "目录不可用，无法取得章节链接" });
    return out;
  }

  // App treats book detail as optional: a valid catalogue is enough to read.
  try {
    const detail = await fetchNovelDetail(source, summary, client);
    out.stages.push({
      stage: "详情（可选）",
      status: detail.title ? "passed" : "failed",
      detail: detail.title ? "详情页读取成功：" + detail.title : "详情页没有识别到书名"
    });
  } catch (error) {
    out.stages.push({
      stage: "详情（可选）",
      status: "failed",
      detail: "详情请求失败，但按 App 逻辑不阻断阅读：" + errorText(error)
    });
  }

  try {
    const content = await fetchNovelChapterContent(source, chapters[0], client);
    if (!content.content || !content.content.trim()) throw new Error("App 返回的章节正文为空");
    out.stages.push({
      stage: "正文",
      status: "passed",
      detail: "首章正文读取成功（" + content.content.trim().length + " 字符）"
    });
    out.status = "readable";
  } catch (error) {
    const message = errorText(error);
    out.error = message;
    out.stages.push({ stage: "正文", status: "failed", detail: message });
    out.status = "catalog-only";
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
  const entries = Array.isArray(subscription.sources) ? subscription.sources : [];
  const sourceResults = await mapLimit(entries, 4, async (entry: any) => {
    const result: Result = { id: entry.id, name: entry.name, status: "failed", terms: {} };
    const compatible = compatibleById.get(entry.id);
    if (!compatible) {
      result.terms["订阅校验"] = {
        keyword: "订阅校验",
        status: "failed",
        stages: [{
          stage: "App 导入校验",
          status: "failed",
          detail: parsed.unsupported.find(item => item.id === entry.id)?.reason || "App 不兼容"
        }]
      };
      return result;
    }

    const source = { ...compatible, id: entry.id, enabled: true, importedAt: Date.now() } as unknown as NovelSource;
    for (const keyword of keywords) result.terms[keyword] = await testTerm(source, keyword);
    const states = Object.values(result.terms).map(item => item.status);
    result.status = states.every(state => state === "readable")
      ? "readable-both"
      : states.some(state => state === "readable")
        ? "readable-one"
        : states.some(state => state === "search-only" || state === "catalog-only")
          ? "search-or-catalog-only"
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
    failed: sourceResults.filter(result => result.status === "failed").length,
    searchRequestsPassed: allTerms.filter(term => term.stages.some(stage => stage.stage === "搜索" && stage.status === "passed")).length,
    chapterContentPassed: allTerms.filter(term => term.status === "readable").length
  };

  fs.mkdirSync("reports", { recursive: true });
  fs.writeFileSync(
    "reports/app-runtime-live-test.json",
    JSON.stringify({
      generatedAt: new Date().toISOString(),
      testStandard: "AppleNovelApp runtime: searchNovelSource -> fetchNovelChapterList -> optional fetchNovelDetail -> fetchNovelChapterContent",
      keywords,
      counts,
      results: sourceResults
    }, null, 2)
  );

  for (const result of sourceResults) {
    const summary = Object.entries(result.terms)
      .map(([keyword, term]) => keyword + ":" + term.status + (term.error ? " (" + term.error + ")" : ""))
      .join(" | ");
    console.log(result.name + " [" + result.status + "] " + summary);
  }
  console.log("SUMMARY " + JSON.stringify(counts));
})();
