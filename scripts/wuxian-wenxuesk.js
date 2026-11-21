"use strict";
const { createAdapter } = require("../runtime/source-adapter");
const css = (query, output = "text") => ({ engine: "css", query, output });
module.exports = createAdapter({
  baseUrl: "https://www.wenxuesk.net/",
  domains: ["www.wenxuesk.net"],
  search: { url: (keyword) => "https://www.wenxuesk.net/search/result.html?searchkey=" + encodeURIComponent(keyword), list: css(".search-list li", "all"), fields: { title: css(".s2 a"), bookUrl: css(".s2 a", "href"), author: css(".s4") } },
  bookInfo: { fields: { title: css("h1"), intro: css("#intro") } },
  toc: { list: css("#list dd", "all"), fields: { title: css("a"), chapterUrl: css("a", "href") } },
  content: { title: css("h1"), body: css("#content") }
});
