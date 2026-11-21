"use strict";

const { createAdapter } = require("../runtime/source-adapter");

const jsonField = name => ({ engine: "json", path: [{ kind: "property", name }] });
const cssAttr = (query, attr="content") => ({ engine: "css", query, output: "attr:" + attr });
const cssText = query => ({ engine: "css", query, output: "text" });
const cssAll = query => ({ engine: "css", query, output: "all" });

module.exports = createAdapter({
  baseUrl: "https://www.wucuoxs.com/",
  domains: ["www.wucuoxs.com"],
  search: {
    url: (keyword, page) => "https://www.wucuoxs.com/api/search?q=" + encodeURIComponent(keyword),
    list: { engine: "json", path: [
      { kind: "recursiveProperty", name: "search" },
      { kind: "wildcard" }
    ] },
    fields: {
      title: jsonField("book_name"),
      author: jsonField("author"),
      bookUrl: jsonField("book_list_url"),
      coverUrl: jsonField("cover"),
      intro: jsonField("intro")
    }
  },
  bookInfo: {
    fields: {
      title: cssAttr('meta[property="og:novel:book_name"]'),
      author: cssAttr('meta[property="og:novel:author"]'),
      intro: cssAttr('meta[property="og:description"]'),
      coverUrl: cssAttr('meta[property="og:image"]')
    }
  },
  toc: {
    list: cssAll("#at td a"),
    fields: {
      title: { engine: "self", output: "text" },
      chapterUrl: { engine: "self", output: "href" }
    }
  },
  content: {
    title: cssText("h1"),
    body: cssText("#htmlContent")
  }
});
