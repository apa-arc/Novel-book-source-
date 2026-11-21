"use strict";

const { createAdapter } = require("../runtime/source-adapter");
const css = (query, output = "text") => ({ engine: "css", query, output });

module.exports = createAdapter({
  baseUrl: "https://www.kuaishu5.com/",
  domains: ["www.kuaishu5.com"],
  search: {
    url: (keyword) => "https://www.kuaishu5.com/search/?searchkey=" + encodeURIComponent(keyword),
    list: css(".item", "all"),
    fields: {
      title: css("h3 a"),
      bookUrl: css("h3 a", "href"),
      author: css("p:nth-of-type(2) a")
    }
  },
  bookInfo: {
    fields: {
      title: css("h1")
    }
  },
  toc: {
    list: css("#content_1 a", "all"),
    fields: {
      title: { engine: "self", output: "text" },
      chapterUrl: { engine: "self", output: "href" }
    }
  },
  content: {
    title: css("h1"),
    body: css("#booktxt")
  }
});
