"use strict";
const { createAdapter } = require("../runtime/source-adapter");
const css = (query, output = "text") => ({ engine: "css", query, output });
module.exports = createAdapter({
  baseUrl: "https://www.17177.cc/", domains: ["www.17177.cc"],
  search: {
    url: (keyword, page = 1) => "https://www.17177.cc/search.php?q=" + encodeURIComponent(keyword) + "&p=" + page,
    list: css(".hot dl", "all"),
    fields: { title: css("h3 a"), bookUrl: css("h3 a", "href"), author: css(".book_other span"), coverUrl: css("dt img", "src") }
  },
  bookInfo: { fields: { title: css("meta[property='og:novel:book_name']", "content"), author: css("meta[property='og:novel:author']", "content"), intro: css("meta[property='og:description']", "content") } },
  toc: {
    list: css(".book_list2 li", "all"),
    fields: { title: css("a"), chapterUrl: css("a", "href") }
  },
  content: { title: css("h1"), body: css(".single article") }
});
