"use strict";
const { createAdapter } = require("../runtime/source-adapter");
const css = (query, output = "text") => ({ engine: "css", query, output });
module.exports = createAdapter({
  baseUrl: "https://www.biquwu.cc/", domains: ["www.biquwu.cc"],
  search: {
    url: (keyword, page = 1) => "https://www.biquwu.cc//search.php?keyword={keyword}&page={page}".replace("{keyword}", encodeURIComponent(keyword)).replace("{page}", page),
    list: css(".result-item", "all"),
    fields: { title: css(".result-item-title a"), bookUrl: css(".result-item-title a", "href") }
  },
  bookInfo: { fields: { title: css("#info h1"), intro: css("#intro p") } },
  toc: {
    list: css("#list dd", "all"),
    fields: { title: css("a"), chapterUrl: css("a", "href") }
  },
  content: { title: css("h1"), body: css("#content") }
});
