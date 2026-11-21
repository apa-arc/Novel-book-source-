import fs from "node:fs";
import { parseSourceSubscription } from "../app/src/source-subscription.ts";
import { createSourceHttpClient } from "../app/src/source-runtime.ts";
import { searchNovelSource } from "../app/src/source-search.ts";
import type { NovelSource } from "../app/src/source.ts";

const raw = fs.readFileSync("config/health-check-subscription.json", "utf8");
const parsed = parseSourceSubscription(raw);
const manifest = JSON.parse(raw);
const keywords = ["斗罗大陆", "斗破苍穹"];
const modes = [
  {
    name: "node-default",
    fetchImpl: fetch,
  },
  {
    name: "iphone-ua-follow",
    fetchImpl: ((input: RequestInfo | URL, init: RequestInit = {}) => fetch(input, {
      ...init,
      headers: {
        ...(init.headers as Record<string, string> || {}),
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
        "Accept-Language": "zh-CN,zh-Hans;q=0.9,en;q=0.8",
      },
      redirect: "follow",
    })) as typeof fetch,
  },
  {
    name: "iphone-ua-error-redirect",
    fetchImpl: ((input: RequestInfo | URL, init: RequestInit = {}) => fetch(input, {
      ...init,
      headers: {
        ...(init.headers as Record<string, string> || {}),
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
        "Accept-Language": "zh-CN,zh-Hans;q=0.9,en;q=0.8",
      },
      redirect: "error",
    })) as typeof fetch,
  },
];

async function runOne(source: NovelSource, keyword: string, mode: typeof modes[number]) {
  try {
    const client = createSourceHttpClient(source, mode.fetchImpl);
    const page = await searchNovelSource(source, keyword, client);
    return {
      id: source.id,
      name: source.name,
      keyword,
      mode: mode.name,
      outcome: "parsed",
      resultCount: page.items.length,
      firstTitles: page.items.slice(0, 5).map((item) => item.title),
    };
  } catch (error) {
    return {
      id: source.id,
      name: source.name,
      keyword,
      mode: mode.name,
      outcome: "failed",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const output: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      output[index] = await fn(items[index]);
      await new Promise((resolve) => setTimeout(resolve, 1200));
    }
  }));
  return output;
}

(async () => {
  const entries = manifest.sources as any[];
  const sources = parsed.compatible.map((item) => {
    const entry = entries.find((candidate) => candidate.id === item.remoteId);
    return { ...item, id: item.remoteId, enabled: true, importedAt: Date.now() } as unknown as NovelSource;
  });
  const jobs = sources.flatMap((source) => keywords.flatMap((keyword) => modes.map((mode) => ({ source, keyword, mode }))));
  const results = await mapLimit(jobs, 1, ({ source, keyword, mode }) => runOne(source, keyword, mode));
  fs.mkdirSync("reports", { recursive: true });
  fs.writeFileSync("reports/app-runtime-network-diagnostics.json", JSON.stringify({
    generatedAt: new Date().toISOString(),
    environment: { runtime: process.version, platform: process.platform },
    baseline: "Node 22 fetch, same App search parser and request wrapper",
    variants: modes.map((mode) => mode.name),
    note: "All ten user-confirmed sources are tested. UA and redirect variants only approximate the iPhone request; they do not reproduce iOS NSURLSession/TLS/IP behavior.",
    results,
  }, null, 2));
  for (const result of results) console.log(JSON.stringify(result));
  const summary = modes.map((mode) => ({
    mode: mode.name,
    parsed: results.filter((result) => result.mode === mode.name && result.outcome === "parsed").length,
    failed: results.filter((result) => result.mode === mode.name && result.outcome === "failed").length,
    returnedBooks: results.filter((result) => result.mode === mode.name).reduce((sum, result) => sum + (result.resultCount || 0), 0),
  }));
  console.log("DIAGNOSTIC_SUMMARY " + JSON.stringify(summary));
})();
