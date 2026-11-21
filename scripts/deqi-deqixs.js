"use strict";
const { createAdapter } = require("../runtime/source-adapter");
const css = (query, output = "text") => ({ engine: "css", query, output });
module.exports = createAdapter({
  baseUrl: "https://www.deqixs.com/", domains: ["www.deqixs.com"],
  search: { url: keyword => "https://www.deqixs.com/tag/?key=" + encodeURIComponent(keyword), list: css(".item", "all"), fields: { title: css("h3 a"), bookUrl: css("h3 a", "href"), author: css("p a") } },
  bookInfo: { fields: { title: css(".itemtxt h1 a"), intro: css(".des p") } },
  toc: { list: css("#list a", "all"), fields: { title: { engine: "self", output: "text" }, chapterUrl: { engine: "self", output: "href" } } },
  content: { title: css("h1"), body: css(".con") }
});
