"use strict";

const { createAdapter } = require("../runtime/source-adapter");
const css = (query, output = "text") => ({ engine: "css", query, output });

module.exports = createAdapter({
  baseUrl: "https://m.xqianqian.com/",
  domains: ["m.xqianqian.com"],
  search: {
    url: (keyword) => "https://m.xqianqian.com/s.php?q=" + encodeURIComponent(keyword),
    list: css(".bookbox", "all"),
    fields: {
      title: css(".bookname a"),
      bookUrl: css(".bookname a", "href"),
      author: css(".author")
    }
  },
  bookInfo: {
    fields: {
      title: css(".name"),
      description: css(".book_about dd")
    }
  },
  toc: {
    list: css(".book_last dl dd", "all"),
    fields: {
      title: css("a"),
      chapterUrl: css("a", "href")
    }
  },
  content: {
    title: css("h1"),
    body: css("#chaptercontent")
  }
});
