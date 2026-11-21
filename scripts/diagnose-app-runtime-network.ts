import fs from "node:fs";
import { parseSourceSubscription } from "../app/src/source-subscription.ts";

const raw = fs.readFileSync("config/health-check-subscription.json", "utf8");
const parsed = parseSourceSubscription(raw);
const ids = new Set(["xqianqian-m", "iyueba-net"]);
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

async function probe(source: any, keyword: string, variant: typeof variants[number]) {
  const url = source.appConfig.searchUrl.replace(/\{keyword\}/g, encodeURIComponent(keyword)).replace(/\{page\}/g, "1");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: variant.headers,
      credentials: "omit",
      redirect: "error",
      signal: controller.signal,
    });
    const body = await response.text();
    return {
      source: source.name,
      id: source.id,
      keyword,
      variant: variant.name,
      requestUrl: url,
      status: response.status,
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
      for (const variant of variants) results.push(await probe(entry, keyword, variant));
    }
  }
  fs.mkdirSync("reports", { recursive: true });
  fs.writeFileSync("reports/app-runtime-network-diagnostics.json", JSON.stringify({
    generatedAt: new Date().toISOString(),
    environment: { runtime: process.version, platform: process.platform },
    note: "Same search URLs as the App subscription; compares Node default, iPhone Safari UA, and desktop Chrome UA. This is a GitHub-hosted runner diagnostic, not an iPhone measurement.",
    results,
  }, null, 2));
  for (const result of results) console.log(JSON.stringify(result));
})();