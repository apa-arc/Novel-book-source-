"use strict";

const { createAdapter } = require("../runtime/source-adapter");

const css = (query, output = "text") => ({ engine: "css", query, output });

const config = {
  baseUrl: "https://www.bqg.info/",
  domains: ["www.bqg.info"],
  search: {
    urlTemplate: "https://www.bqg.info/search/?searchkey={{keyword}}",
    list: css("div.book-coverlist", "all"),
    fields: {
      title: css("h4 a"),
      bookUrl: css("h4 a", "href"),
      intro: css("div.caption p")
    }
  },
  bookInfo: {
    fields: {
      title: css("meta[property='og:novel:book_name']", "content"),
      author: css("meta[property='og:novel:author']", "content"),
      intro: css("#bookIntro")
    }
  },
  toc: {
    list: css("dl#newlist > dd", "all"),
    fields: {
      title: css("a"),
      chapterUrl: css("a", "href")
    }
  },
  content: {
    title: css("h1.readTitle"),
    body: css("#booktxt")
  }
};

const searchTemplate = config.search.urlTemplate;
delete config.search.urlTemplate;
config.search.url = (keyword, page) => searchTemplate
  .replace(/\\{\\{keyword\\}\\}/g, encodeURIComponent(keyword))
  .replace(/\\{\\{page\\}\\}/g, encodeURIComponent(String(page)));

module.exports = createAdapter(config);
