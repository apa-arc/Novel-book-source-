"use strict";

const { createAdapter } = require("../runtime/source-adapter");
const css = (query, output = "text") => ({ engine: "css", query, output });

module.exports = createAdapter({
  baseUrl: "https://www.xqianqian.com/",
  domains: ["www.xqianqian.com"],
  search: {
    url: (keyword) => "https://www.xqianqian.com/search/?searchkey=" + encodeURIComponent(keyword),
    list: css(".category-div", "all"),
    fields: {
      title: css(".commend-title h3"),
      bookUrl: css(":scope > a", "href"),
      author: css(".commend-title span"),
      coverUrl: css("img", "attr:data-original")
    }
  },
  bookInfo: {
    fields: {
      title: css("h1"),
      description: css(".intro"),
      coverUrl: css("meta[property='og:image']", "attr:content")
    }
  },
  toc: {
    list: css("#list dd", "all"),
    fields: {
      title: css("a"),
      chapterUrl: css("a", "href")
    }
  },
  content: {
    title: css("h1"),
    body: css("#content")
  }
});
