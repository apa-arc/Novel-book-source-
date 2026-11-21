"use strict";

const { createAdapter } = require("../runtime/source-adapter");
const css = (query, output = "text") => ({ engine: "css", query, output });

module.exports = createAdapter({
  baseUrl: "https://www.biquluo.la/",
  domains: ["www.biquluo.la"],
  search: {
    url: (keyword, page) => "https://www.biquluo.la/search.html?name=" + encodeURIComponent(keyword),
    list: css(".novelslist2 li", "all"),
    fields: {
      title: css(".s2 a"),
      bookUrl: css(".s2 a", "href"),
      author: css(".s4")
    }
  },
  bookInfo: {
    fields: {
      title: css("#info h1"),
      author: css("#info p:nth-of-type(1)"),
      intro: css("#intro"),
      coverUrl: css("#fmimg img", "src")
    }
  },
  toc: {
    list: css("#list dd a", "all"),
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
