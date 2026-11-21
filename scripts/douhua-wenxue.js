"use strict";

const { createAdapter } = require("../runtime/source-adapter");
const css = (query, output = "text") => ({ engine: "css", query, output });

module.exports = createAdapter({
  baseUrl: "https://www.douhuawenxue.com/",
  domains: ["www.douhuawenxue.com"],
  search: {
    url: (keyword) => "https://www.douhuawenxue.com/search?kd=" + encodeURIComponent(keyword),
    list: css(".book-base", "all"),
    fields: {
      title: css("h3 a"),
      bookUrl: css("h3 a", "href"),
      author: css(".book_author")
    }
  },
  bookInfo: {
    fields: {
      title: css("h1")
    }
  },
  toc: {
    list: css(".list-inline-3 .list_item", "all"),
    fields: {
      title: css("a"),
      chapterUrl: css("a", "href")
    }
  },
  content: {
    title: css("h1"),
    body: css("#J_chapterContent")
  }
});
