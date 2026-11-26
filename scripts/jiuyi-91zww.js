"use strict";
const { createAdapter } = require("../runtime/source-adapter");
const css = (query, output = "text") => ({ engine: "css", query, output });
module.exports = createAdapter({
  baseUrl: "https://www.91zww.com/",
  domains: ["www.91zww.com"],
  search: { url: (keyword) => "https://www.91zww.com/search/?searchkey=" + encodeURIComponent(keyword), list: css(".txt-list li", "all"), fields: { title: css(".s2 a"), bookUrl: css(".s2 a", "href"), author: css(".s4"), coverUrl: css("img", "attr:src") } },
  bookInfo: { fields: { title: css("h1"), intro: css("#intro"), coverUrl: css("meta[property='og:image']", "attr:content") } },
  toc: { list: css(".section-list li", "all"), fields: { title: css("a"), chapterUrl: css("a", "href") } },
  content: { title: css("h1"), body: css("#content") }
});
