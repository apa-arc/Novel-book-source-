"use strict";

const { scanTextQuality } = require("../runtime/text-quality");
const API = "https://zh.wikisource.org/w/api.php";
const HEADERS = { "user-agent": "PersonalNovelSources-SmokeTest/1.0 (GitHub Actions; source compatibility check)", "accept": "application/json" };

async function api(params) {
  const url = new URL(API);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = await fetch(url, { headers: HEADERS, redirect: "follow", signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error("HTTP " + response.status + " for " + url.pathname);
  const data = await response.json();
  if (data.error) throw new Error("MediaWiki API error: " + data.error.code);
  return data;
}
function assert(condition, message) { if (!condition) throw new Error(message); }

async function scanChapterPages() {
  console.log("[5/5] Scanning chapter source text for possible garbling...");
  const parsed = await api({ action: "parse", format: "json", page: "三國演義", prop: "links" });
  const links = parsed.parse && parsed.parse.links || [];
  const titles = [...new Set(links.map(link => link.title).filter(title => /第\d{3}回/.test(title)))];
  assert(titles.length > 0, "No numbered chapter links found; page title=" + (parsed.parse && parsed.parse.title) + "; links=" + links.length + "; samples=" + links.slice(0, 40).map(link => link.title || link["*"] || JSON.stringify(link)).join(" | "));
  const report = [];
  for (let offset = 0; offset < titles.length; offset += 50) {
    const batch = titles.slice(offset, offset + 50);
    const result = await api({ action: "query", format: "json", formatversion: "2", titles: batch.join("|"), prop: "revisions", rvprop: "content", rvslots: "main" });
    for (const page of result.query && result.query.pages || []) {
      const raw = page.revisions && page.revisions[0] && page.revisions[0].slots && page.revisions[0].slots.main && page.revisions[0].slots.main.content || "";
      const quality = scanTextQuality(raw);
      if (quality.status !== "normal") report.push({ title: page.title, status: quality.status, flags: quality.flags });
    }
  }
  const suspect = report.filter(item => item.status === "suspect");
  const review = report.filter(item => item.status === "review");
  console.log("  Scanned chapter pages: " + titles.length);
  console.log("  Suspected garbled pages: " + suspect.length);
  console.log("  Pages requiring manual review: " + review.length);
  for (const item of report.slice(0, 30)) console.log("  " + item.status.toUpperCase() + ": " + item.title + " [" + item.flags.map(flag => flag.rule + ":" + flag.count).join(", ") + "]");
  if (report.length > 30) console.log("  ... " + (report.length - 30) + " additional flagged pages omitted");
  return { scanned: titles.length, suspect: suspect.length, review: review.length };
}

async function main() {
  console.log("[1/5] Checking MediaWiki search API...");
  const search = await api({ action: "query", format: "json", list: "search", srsearch: "三國志演義", srnamespace: "0", srlimit: "20" });
  const hits = search.query && search.query.search || [];
  assert(hits.length > 0, "Search returned no main-namespace results");
  const matched = hits.find(item => /三國志演義|三国演义/.test(item.title));
  assert(matched, "Search did not return the expected work-related result");
  console.log("  OK: " + matched.title);

  console.log("[2/5] Checking work page HTML...");
  const work = await api({ action: "parse", format: "json", page: "三國演義", prop: "displaytitle|text|sections" });
  const workHtml = work.parse && work.parse.text && work.parse.text["*"] || "";
  assert(workHtml.length > 1000, "Work page HTML is missing or unexpectedly short");
  assert(/mw-parser-output/.test(workHtml), "Work page lacks MediaWiki parser output");
  console.log("  OK: " + (work.parse.title || "work page") + ", HTML " + workHtml.length + " chars");

  console.log("[3/5] Discovering the actual first-chapter page title...");
  const chapterSearch = await api({ action: "query", format: "json", list: "search", srsearch: "宴桃園豪傑三結義", srnamespace: "0", srlimit: "20" });
  const chapterHits = chapterSearch.query && chapterSearch.query.search || [];
  const chapterMatch = chapterHits.find(item => /第001回|第一回/.test(item.title));
  assert(chapterMatch, "Search could not discover the first-chapter page; results: " + chapterHits.map(item => item.title).join(" | "));
  console.log("  OK: " + chapterMatch.title);

  console.log("[4/5] Checking first chapter content...");
  const chapter = await api({ action: "parse", format: "json", page: chapterMatch.title, prop: "displaytitle|text" });
  const chapterHtml = chapter.parse && chapter.parse.text && chapter.parse.text["*"] || "";
  assert(chapterHtml.length > 1000, "Chapter HTML is missing or unexpectedly short");
  assert(/mw-parser-output/.test(chapterHtml), "Chapter lacks MediaWiki parser output");
  assert(/宴桃園豪傑三結義|第一回|第001回/.test(chapterHtml), "Chapter content marker was not found");
  console.log("  OK: " + (chapter.parse.title || chapterMatch.title) + ", HTML " + chapterHtml.length + " chars");

  const quality = await scanChapterPages();
  console.log("PASS: live Wikisource checks completed; scanned " + quality.scanned + " chapter pages.");
}
main().catch(error => { console.error("FAIL: " + error.message); process.exitCode = 1; });