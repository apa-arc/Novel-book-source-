"use strict";

const API = "https://zh.wikisource.org/w/api.php";
const HEADERS = {
  "user-agent": "PersonalNovelSources-SmokeTest/1.0 (GitHub Actions; source compatibility check)",
  "accept": "application/json"
};

async function api(params) {
  const url = new URL(API);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = await fetch(url, { headers: HEADERS, redirect: "follow", signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error("HTTP " + response.status + " for " + url.pathname);
  const data = await response.json();
  if (data.error) throw new Error("MediaWiki API error: " + data.error.code);
  return data;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  console.log("[1/3] Checking MediaWiki search API...");
  const search = await api({
    action: "query",
    format: "json",
    list: "search",
    srsearch: "三國志演義",
    srnamespace: "0",
    srlimit: "10"
  });
  const hits = search.query && search.query.search || [];
  assert(hits.length > 0, "Search returned no main-namespace results");
  const matched = hits.find(item => /三國志演義|三国演义/.test(item.title));
  assert(matched, "Search did not return the expected Romance of the Three Kingdoms work");
  console.log("  OK: " + matched.title);

  console.log("[2/3] Checking work page and chapter directory...");
  const work = await api({
    action: "parse",
    format: "json",
    page: "三國志演義",
    prop: "displaytitle|text|sections"
  });
  const workHtml = work.parse && work.parse.text && work.parse.text["*"] || "";
  assert(workHtml.length > 1000, "Work page HTML is missing or unexpectedly short");
  assert(/mw-parser-output/.test(workHtml), "Work page lacks MediaWiki parser output");
  assert(/第001回|第一回/.test(workHtml), "Work page does not expose the first chapter link");
  console.log("  OK: " + (work.parse.title || "work page") + ", HTML " + workHtml.length + " chars");

  console.log("[3/3] Checking first chapter content...");
  const chapter = await api({
    action: "parse",
    format: "json",
    page: "三國志演義/第001回",
    prop: "displaytitle|text"
  });
  const chapterHtml = chapter.parse && chapter.parse.text && chapter.parse.text["*"] || "";
  assert(chapterHtml.length > 1000, "Chapter HTML is missing or unexpectedly short");
  assert(/mw-parser-output/.test(chapterHtml), "Chapter lacks MediaWiki parser output");
  assert(/第一回|第001回|宴桃園豪傑三結義/.test(chapterHtml), "Chapter content marker was not found");
  console.log("  OK: " + (chapter.parse.title || "chapter page") + ", HTML " + chapterHtml.length + " chars");

  console.log("PASS: live Wikisource API, work page, and chapter page are reachable.");
}

main().catch(error => {
  console.error("FAIL: " + error.message);
  process.exitCode = 1;
});
