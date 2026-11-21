import fs from "node:fs";
import { parseSourceSubscription } from "../app/src/source-subscription.ts";
import { createSourceHttpClient } from "../app/src/source-runtime.ts";
import { searchNovelSource } from "../app/src/source-search.ts";
import { fetchNovelDetail, fetchNovelChapterList, fetchNovelChapterContent } from "../app/src/source-catalog.ts";
import type { NovelSource } from "../app/src/source.ts";

const keywords = ["斗罗大陆", "斗破苍穹"];
const raw = fs.readFileSync("subscription.json", "utf8");
const parsed = parseSourceSubscription(raw);

type Stage = { stage: string; status: "passed" | "failed"; detail?: string };
type TermResult = { keyword: string; status: "passed" | "failed"; stages: Stage[]; error?: string };
type Result = { id: string; name: string; status: string; terms: Record<string, TermResult> };

function errorText(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 260);
}
async function testTerm(source: NovelSource, keyword: string): Promise<TermResult> {
  const out: TermResult = { keyword, status: "failed", stages: [] };
  const client = createSourceHttpClient(source);
  try {
    const page = await searchNovelSource(source, keyword, client);
    const match = page.items.find(item => item.title.toLocaleLowerCase().includes(keyword.toLocaleLowerCase()));
    if (!match) throw new Error("搜索响应有 " + page.items.length + " 条结果，但没有书名包含关键词「" + keyword + "」的书目");
    out.stages.push({ stage: "搜索", status: "passed", detail: "结果 " + page.items.length + " 条；命中「" + match.title + "」" });
    const detail = await fetchNovelDetail(source, match, client);
    if (!detail.title) throw new Error("详情页没有书名");
    out.stages.push({ stage: "详情", status: "passed", detail: detail.title });
    const chapters = await fetchNovelChapterList(source, match, client);
    if (!chapters.length) throw new Error("目录为空");
    out.stages.push({ stage: "目录", status: "passed", detail: chapters.length + " 章；首章「" + chapters[0].title + "」" });
    const content = await fetchNovelChapterContent(source, chapters[0], client);
    if (!content.content || content.content.trim().length < 100) throw new Error("正文为空或少于 100 字");
    out.stages.push({ stage: "正文", status: "passed", detail: content.content.trim().length + " 字" });
    out.status = "passed";
  } catch (error) {
    out.error = errorText(error);
    out.stages.push({ stage: ["搜索", "详情", "目录", "正文"][out.stages.length] || "检测", status: "failed", detail: out.error });
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
  const sourceResults = await mapLimit(raw ? (JSON.parse(raw).sources as any[]) : [], 4, async entry => {
    const result: Result = { id: entry.id, name: entry.name, status: "failed", terms: {} };
    const compatible = compatibleById.get(entry.id);
    if (!compatible) {
      result.terms["订阅校验"] = { keyword: "订阅校验", status: "failed", stages: [{ stage: "导入校验", status: "failed", detail: parsed.unsupported.find(x => x.id === entry.id)?.reason || "App 不兼容" }] };
      return result;
    }
    const source = { ...compatible, id: entry.id, enabled: true, importedAt: Date.now() } as unknown as NovelSource;
    for (const keyword of keywords) result.terms[keyword] = await testTerm(source, keyword);
    const states = Object.values(result.terms).map(x => x.status);
    result.status = states.every(x => x === "passed") ? "passed-both" : states.some(x => x === "passed") ? "passed-one" : "failed";
    return result;
  });
  const counts = {
    total: sourceResults.length,
    appCompatible: parsed.compatible.length,
    appUnsupported: parsed.unsupported.length,
    passedBoth: sourceResults.filter(x => x.status === "passed-both").length,
    passedOne: sourceResults.filter(x => x.status === "passed-one").length,
    failed: sourceResults.filter(x => x.status === "failed").length
  };
  fs.mkdirSync("reports", { recursive: true });
  fs.writeFileSync("reports/app-runtime-live-test.json", JSON.stringify({ generatedAt: new Date().toISOString(), keywords, counts, results: sourceResults }, null, 2));
  for (const result of sourceResults) {
    const summary = Object.entries(result.terms).map(([key, value]) => key + ":" + value.status + (value.error ? " (" + value.error + ")" : "")).join(" | ");
    console.log(result.name + " [" + result.status + "] " + summary);
  }
  console.log("SUMMARY " + JSON.stringify(counts));
})();
