"use strict";

const { createAdapter } = require("../runtime/source-adapter");
const css = (query, output = "text") => ({ engine: "css", query, output });

module.exports = createAdapter({
  baseUrl: "https://m.111bz.cc/",
  domains: ["www.111bz.cc", "m.111bz.cc"],
  search: {
    url: (keyword, page) => "https://www.111bz.cc/modules/article/search.php?searchkey=" +
      encodeURIComponent(keyword) + "&searchtype=articlename&page=" + encodeURIComponent(String(page)),
    list: css("tbody#nr tr", "all"),
    fields: {
      title: css("td.odd a"),
      bookUrl: css("td.odd a", "href"),
      author: css("td.even")
    }
  },
  bookInfo: {
    fields: {
      title: css("h1"),
      author: css("#info p"),
      intro: css("#intro"),
      coverUrl: css("#fmimg img", "src")
    }
  },
  toc: {
    list: css("a[href$='.html']", "all"),
    fields: {
      title: { engine: "self", output: "text" },
      chapterUrl: { engine: "self", output: "href" }
    }
  },
  content: {
    title: css("h1"),
    body: css("#content")
  }
});
