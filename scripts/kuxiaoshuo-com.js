"use strict";
const { createAdapter } = require("../runtime/source-adapter");
const css = (query, output = "text") => ({ engine: "css", query, output });
module.exports = createAdapter({
  baseUrl: "https://www.kuxiaoshuo.com/", domains: ["www.kuxiaoshuo.com"],
  search: {
    url: (keyword, page = 1) => "https://www.kuxiaoshuo.com//modules/article/search.php?searchkey={keyword}".replace("{keyword}", encodeURIComponent(keyword)).replace("{page}", page),
    list: css(".grid tr", "all"),
    fields: { title: css("td.odd a"), bookUrl: css("td.odd a", "href") }
  },
  bookInfo: { fields: { title: css("#info h1"), intro: css("#intro p") } },
  toc: {
    list: css("#list dd:nth-child(n+10)", "all"),
    fields: { title: css("a"), chapterUrl: css("a", "href") }
  },
  content: { title: css("h1"), body: css("#content") }
});
