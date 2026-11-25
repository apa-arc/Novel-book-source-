"use strict";
const { createAdapter } = require("../runtime/source-adapter");
const css = (query, output = "text") => ({ engine: "css", query, output });
module.exports = createAdapter({
  baseUrl: "https://www.d8zw.com/", domains: ["www.d8zw.com"],
  search: {
    url: keyword => "https://www.d8zw.com/search.php?q=" + encodeURIComponent(keyword),
    list: css(".box.hot dl", "all"),
    fields: { title: css("dd h3 a"), bookUrl: css("dd h3 a", "href"), author: css("dd.book_other span"), coverUrl: css("dt img", "src") }
  },
  bookInfo: { fields: { title: css("h1"), intro: css("#intro"), coverUrl: css("img.img-thumbnail", "src") } },
  toc: {
    url: bookUrl => "https://www.d8zw.com/" + String(bookUrl).replace(/^\//, "") + "index_1.html",
    list: css(".book_list2 > ul > li", "all"),
    fields: { title: css("a"), chapterUrl: css("a", "href") }
  },
  content: { title: css("h1"), body: css("article.font_max") }
});
