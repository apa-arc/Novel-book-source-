"use strict";
const { createAdapter } = require("../runtime/source-adapter");
const css = (query, output = "text") => ({ engine: "css", query, output });
module.exports = createAdapter({
  baseUrl: "https://www.tycqzw.la/",
  domains: ["www.tycqzw.la"],
  search: { url: (keyword) => "https://www.tycqzw.la/search.php?searchkey=" + encodeURIComponent(keyword), list: css(".grid tr", "all"), fields: { title: css("td.even a"), bookUrl: css("td.even a", "href"), author: css("td.odd") } },
  bookInfo: { fields: { title: css("#info h1"), intro: css("#intro") } },
  toc: { list: css("#list dd", "all"), fields: { title: css("a"), chapterUrl: css("a", "href") } },
  content: { title: css("h1"), body: css("#content") }
});
