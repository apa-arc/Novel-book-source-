"use strict";

const API = "https://appi.kuwo.cn/novels/api/book";
const ALLOWED = new Set(["appi.kuwo.cn", "openbookcover.yuewen.com"]);

function checkedUrl(value) {
  const url = new URL(value);
  if (url.protocol !== "https:" || !ALLOWED.has(url.hostname.toLowerCase()) || url.username || url.password) {
    throw new Error("kuwo-url-outside-allowlist");
  }
  return url.href;
}

async function getJson(http, url) {
  const target = checkedUrl(url);
  if (!http || typeof http.get !== "function") throw new Error("host-http-get-required");
  const response = await http.get(target);
  if (!response || !response.document || response.document.code !== 200) {
    throw new Error("kuwo-api-invalid-response");
  }
  if (response.url) checkedUrl(response.url);
  return response.document.data;
}

function bookIdFromUrl(value) {
  const match = new URL(value).pathname.match(/^\/novels\/api\/book\/(\d+)$/);
  if (!match) throw new Error("kuwo-book-url-invalid");
  return match[1];
}

function chapterFromUrl(value) {
  const match = new URL(value).pathname.match(/^\/novels\/api\/book\/(\d+)\/chapters\/(\d+)$/);
  if (!match) throw new Error("kuwo-chapter-url-invalid");
  return { bookId: match[1], chapterId: match[2] };
}

function cover(value) {
  if (typeof value !== "string" || !value.trim()) return "";
  return checkedUrl(value.trim());
}

module.exports = {
  async search({ keyword, page = 1, http }) {
    const key = String(keyword || "").trim();
    if (!key) return [];
    const data = await getJson(http, API + "/search?keyword=" + encodeURIComponent(key) + "&pi=" + Math.max(1, Number(page) || 1) + "&ps=30");
    if (!Array.isArray(data)) return [];
    return data.filter(row => row && row.book_id && row.title).map(row => ({
      title: String(row.title),
      author: String(row.author_name || ""),
      description: String(row.intro || ""),
      coverUrl: cover(row.cover_url),
      bookUrl: checkedUrl(API + "/" + encodeURIComponent(String(row.book_id)))
    }));
  },

  async getBookDetail({ bookUrl, http }) {
    const id = bookIdFromUrl(checkedUrl(bookUrl));
    const data = await getJson(http, API + "/" + id);
    if (!data || String(data.book_id) !== id || !data.title) throw new Error("kuwo-book-detail-invalid");
    return {
      title: String(data.title),
      author: String(data.author_name || ""),
      description: String(data.intro || ""),
      coverUrl: cover(data.cover_url),
      status: String(data.status) === "50" ? "完结" : "连载",
      latestChapter: String(data.new_chapter_name || "")
    };
  },

  async getChapters({ bookUrl, http }) {
    const id = bookIdFromUrl(checkedUrl(bookUrl));
    const data = await getJson(http, API + "/" + id + "/chapters?paging=0");
    if (!Array.isArray(data)) return [];
    return data.filter(row => row && row.chapter_id && row.chapter_title).map(row => ({
      title: String(row.chapter_title),
      chapterUrl: checkedUrl(API + "/" + id + "/chapters/" + encodeURIComponent(String(row.chapter_id))),
      index: Number(row.chapter_index) || 0
    }));
  },

  async getContent({ chapterUrl, http }) {
    const ids = chapterFromUrl(checkedUrl(chapterUrl));
    const data = await getJson(http, API + "/" + ids.bookId + "/chapters/" + ids.chapterId);
    if (!data || String(data.book_id) !== ids.bookId || String(data.chapter_id) !== ids.chapterId || typeof data.content !== "string") {
      throw new Error("kuwo-chapter-content-invalid");
    }
    return { title: String(data.chapter_name || ""), content: data.content };
  }
};
