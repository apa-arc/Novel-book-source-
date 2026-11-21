import fs from "node:fs";
import { parseSourceSubscription } from "../app/src/source-subscription.ts";
import { createSourceHttpClient } from "../app/src/source-runtime.ts";
import { searchNovelSource } from "../app/src/source-search.ts";

const raw = fs.readFileSync("config/health-check-subscription.json", "utf8");
const parsed = parseSourceSubscription(raw);
const ids = new Set(parsed.compatible.map((source) => source.remoteId));
const keywords = ["斗罗大陆", "斗破苍穹"];
const variants = [
  { name: "node-default", headers: { Accept: "text/html,application/json;q=0.9,*/*;q=0.5" } },
  {
    name: "iphone-safari",
    headers: {
      Accept: "text/html,application/json;q=0.9,*/*;q=0.5",
      "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
      "Accept-Language": "zh-CN,zh-Hans;q=0.9,en;q=0.8",
    },
  },
  {
    name: "desktop-chrome",
    headers: {
      Accept: "text/html,application/json;q=0.9,*/*;q=0.5",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    },
  },
];

function cleanSnippet(value: string): string {
  return value.replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 360);
}

async function probe(source: any, keyword: string, variant: typeof variants[number], redirectPolicy: "manual" | "follow") {
  const url = source.appConfig.searchUrl.replace(/\{keyword\}/g, encodeURIComponent(keyword)).replace(/\{page\}/g, "1");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: variant.headers,
      credentials: "omit",
      redirect: redirectPolicy,
      signal: controller.signal,
    });
    const body = await response.text();
    return {
      source: source.name,
      id: source.id,
      keyword,
      variant: variant.name,
      redirectPolicy,
      requestUrl: url,
      status: response.status,
      location: response.headers.get("location") || "",
      finalUrl: response.url,
      contentType: response.headers.get("content-type") || "",
      server: response.headers.get("server") || "",
      cfRay: response.headers.get("cf-ray") || "",
      bodyLength: body.length,
      snippet: cleanSnippet(body),
    };
  } catch (error) {
    const e = error as Error & { cause?: unknown };
    return {
      source: source.name,
      id: source.id,
      keyword,
      variant: variant.name,
      redirectPolicy,
      requestUrl: url,
      errorName: e.name,
      error: e.message,
      cause: e.cause instanceof Error ? e.cause.message : String(e.cause || ""),
    };
  } finally {
    clearTimeout(timeout);
  }
}

(async () => {
  const sources = parsed.compatible.filter((source) => ids.has(source.remoteId));
  const results = [];
  for (const source of sources) {
    const entry = JSON.parse(raw).sources.find((item: any) => item.id === source.remoteId);
    for (const keyword of keywords) {
      for (const variant of variants) for (const redirectPolicy of ["manual", "follow"] as const) results.push(await probe(entry, keyword, variant, redirectPolicy));
    }
  }
  const qianqian = parsed.compatible.find((source) => source.remoteId === "xqianqian-m");
  if (qianqian) {
    try {
      const response = await fetch("https://m.xqianqian.com/", {
        headers: { Accept: "text/html,application/json;q=0.9,*/*;q=0.5" },
        redirect: "follow",
      });
      const body = await response.text();
      const page = parseHtmlSearchResults(body, qianqian.remoteId, qianqian.name, "斗罗大陆", response.url, qianqian.htmlRules!.search!);
      results.push({
        source: "千千小说",
        id: "xqianqian-m",
        variant: "homepage-parser-control",
        status: response.status,
        finalUrl: response.url,
        resultCount: page.items.length,
        firstTitles: page.items.slice(0, 8).map((item) => item.title),
        note: "Control test: parses the redirected homepage using the configured search CSS rules, not a real search response.",
      });
    } catch (error) {
      results.push({ source: "千千小说", id: "xqianqian-m", variant: "homepage-parser-control", error: error instanceof Error ? error.message : String(error) });
    }
  }
  fs.mkdirSync("reports", { recursive: true });
  fs.writeFileSync("reports/app-runtime-network-diagnostics.json", JSON.stringify({
    generatedAt: new Date().toISOString(),
    environment: { runtime: process.version, platform: process.platform },
    note: "All 10 confirmed sources are tested through the exact AppleNovelApp search runtime and parser. Compares Node default with iPhone/desktop User-Agent plus follow-redirect variants. This remains a GitHub-hosted Node runner, not a physical iPhone measurement.",
    results,
  }, null, 2));
  for (const result of results) console.log(JSON.stringify(result));
})();