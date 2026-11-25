"use strict";

const { createAdapter } = require("../runtime/source-adapter");
const css = (query, output = "text") => ({ engine: "css", query, output });

module.exports = createAdapter({
  baseUrl: "https://www.biquges123.com/",
  domains: ["www.biquges123.com", "cdn.biquge7.top"],
  search: {
    url: (keyword, page) => "https://www.biquges123.com/search?keyword=" + encodeURIComponent(keyword) + "&page=" + page,
    list: css(".hot_4_item", "all"),
    fields: {
      title: css(".hot_name"),
      bookUrl: css("a", "href"),
      author: css(".author"),
      description: css(".hot_des"),
      coverUrl: css("img", "src")
    }
  },
  bookInfo: {
    fields: {
      title: css("h1.info_title"),
      author: css(".info_ct > div:nth-child(2)"),
      description: css(".des"),
      coverUrl: css("img", "src")
    }
  },
  toc: {
    list: css(".list li", "all"),
    fields: {
      title: css("a", "text"),
      chapterUrl: css("a", "href")
    }
  },
  content: {
    title: css("h1"),
    body: css("article.article")
  }
});
