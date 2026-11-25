"use strict";
const { createAdapter } = require("../runtime/source-adapter");
const css = (query, output = "text") => ({ engine: "css", query, output });
module.exports = createAdapter({
  baseUrl: "https://www.bqg.info/", domains: ["www.bqg.info"],
  search: {
    url: keyword => "https://www.bqg.info/search/?searchkey=" + encodeURIComponent(keyword),
    list: css("div.book-coverlist", "all"),
    fields: {
      title: css("h4 a"),
      bookUrl: css("h4 a", "href"),
      intro: css("div.caption p"),
      coverUrl: {
        engine: "replace",
        input: css("a.thumbnail", "attr:style"),
        pattern: "url\\(([^)]+)\\)",
        replacement: "$1",
        replaceFirst: true
      }
    }
  },
  bookInfo: { fields: { title: css("h1"), intro: css("#bookIntro") } },
  toc: {
    list: css("dl#newlist > dd", "all"),
    fields: { title: css("a"), chapterUrl: css("a", "href") }
  },
  content: { title: css("h1.readTitle"), body: css("#booktxt") }
});
