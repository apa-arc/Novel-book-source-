"use strict";
const { createAdapter } = require("../runtime/source-adapter");
const css = (query, output = "text") => ({ engine: "css", query, output });
module.exports = createAdapter({
  baseUrl: "https://www.23uswx.net/",
  domains: ["www.23uswx.net"],
  search: { url: (keyword) => "https://www.23uswx.net/modules/article/search.php?q=" + encodeURIComponent(keyword), list: css(".grid tr", "all"), fields: { title: css("td:nth-child(1) a"), bookUrl: css("td:nth-child(1) a", "href"), author: css("td:nth-child(3)") } },
  bookInfo: { fields: { title: css("#info h1"), intro: css("#intro") } },
  toc: { list: css("#list dd", "all"), fields: { title: css("a"), chapterUrl: css("a", "href") } },
  content: { title: css("h1"), body: css("#content") }
});
