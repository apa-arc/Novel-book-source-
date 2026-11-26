"use strict";

const { createAdapter } = require("../runtime/source-adapter");
const css = (query, output = "text") => ({ engine: "css", query, output });

module.exports = createAdapter({
  baseUrl: "https://iyueba.net/",
  domains: ["iyueba.net", "qcdn.zhangzhongyun.com"],
  search: {
    url: (keyword) => "https://iyueba.net/z/?keyword=" + encodeURIComponent(keyword),
    list: css(".item", "all"),
    fields: {
      title: css("a:nth-of-type(2)"),
      bookUrl: css("a:nth-of-type(2)", "href"),
      coverUrl: css("img", "attr:src")
    }
  },
  bookInfo: { fields: { title: css("h1"), coverUrl: css("meta[property='og:image']", "attr:content") } },
  toc: {
    list: css("#content_1 dd", "all"),
    fields: {
      title: css("a"),
      chapterUrl: css("a", "href")
    }
  },
  content: { title: css("h1"), body: css("#booktxt") }
});
