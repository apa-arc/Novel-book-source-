export type AppSearchErrorClass = "failed" | "inconclusive";

/**
 * GitHub-hosted Node fetch cannot prove an iOS React Native source is broken.
 * These errors are commonly dependent on runner IP, redirects, cookies, or
 * rate limits, so they must be reported as environment-inconclusive.
 */
export function classifyAppSearchError(message: string): AppSearchErrorClass {
  if (/HTTP\s*(?:403|429)\b|redirect|network request failed|fetch failed|timed?\s*out|timeout|ENOTFOUND|ECONNRESET|ECONNREFUSED|EAI_AGAIN/i.test(message)) {
    return "inconclusive";
  }
  return "failed";
}
