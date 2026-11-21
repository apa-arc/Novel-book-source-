"use strict";

const { createAdapter } = require("../runtime/source-adapter");
const css = (query, output = "text") => ({ engine: "css", query, output });
const self = output => ({ engine: "self", output });

module.exports = createAdapter({
  baseUrl: "https://www.52shuku.net/",
  domains: ["www.52shuku.net"],
  search: {
    url: keyword => "https://www.52shuku.net/so/search.php?q=" + encodeURIComponent(keyword) + "&m=no&f=_all&syn=no",
    list: css('article.excerpt a[href*="/wuxia/"]', "all"),
    fields: {
      title: self("text"),
      bookUrl: self("href")
    }
  },
  bookInfo: {
    fields: {
      title: css("h1.article-title")
    }
  },
  toc: {
    list: css("article.article-content ul.list.clearfix li.mulu a", "all"),
    fields: {
      title: self("text"),
      chapterUrl: self("href")
    }
  },
  content: {
    title: css("h1.article-title"),
    body: css("article.article-content")
  }
});
