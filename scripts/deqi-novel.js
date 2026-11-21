"use strict";

const { createAdapter } = require("../runtime/source-adapter");
const css = (query, output = "text") => ({ engine: "css", query, output });

const config = {
  baseUrl: "https://www.deqitxt.com/",
  domains: ["www.deqitxt.com"],
  search: {
    url: (keyword) => "https://www.deqitxt.com/so/so.aspx?key=" + encodeURIComponent(keyword),
    list: css(".item", "all"),
    fields: {
      title: css("h3 a"),
      bookUrl: css("h3 a", "href"),
      author: css("p:nth-of-type(2) a"),
      intro: css(".des"),
      coverUrl: css("img", "src")
    }
  },
  bookInfo: {
    fields: {
      title: css("h1 a"),
      author: css("p:nth-of-type(2) a"),
      intro: css(".des")
    }
  },
  toc: {
    list: css("#list li", "all"),
    fields: {
      title: css("a"),
      chapterUrl: css("a", "href")
    }
  },
  content: {
    title: css("h1"),
    body: css(".con")
  }
};

module.exports = createAdapter(config);
