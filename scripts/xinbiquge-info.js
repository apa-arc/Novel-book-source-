"use strict";
const { createAdapter } = require("../runtime/source-adapter");
const css = (query, output = "text") => ({ engine: "css", query, output });
module.exports = createAdapter({
  baseUrl: "https://www.xbiquge.info/", domains: ["www.xbiquge.info"],
  search: {
    url: keyword => "https://www.xbiquge.info/search.php?q=" + encodeURIComponent(keyword),
    list: css("div.col-12.col-md-6 > list", "all"),
    fields: {
      title: css("listitem > heading > a"),
      bookUrl: css("listitem > heading > a", "href"),
      author: css("listitem.book_other:nth-of-type(1) > span:nth-of-type(2)"),
      coverUrl: css("term > a > img", "src")
    }
  },
  bookInfo: { fields: { title: css("h1"), intro: css("#intro"), coverUrl: css("meta[property='og:image']", "content") } },
  toc: {
    url: bookUrl => "https://www.xbiquge.info/" + String(bookUrl).replace(/^\//, "") + "index_1.html",
    list: css(".book_list2 > ul > li", "all"),
    fields: { title: css("a"), chapterUrl: css("a", "href") }
  },
  content: { title: css("h1"), body: css("article.font_max") }
});
