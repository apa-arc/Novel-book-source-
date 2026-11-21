"use strict";
const { createAdapter } = require("../runtime/source-adapter");
const css = (query, output = "text") => ({ engine: "css", query, output });
module.exports = createAdapter({
  baseUrl: "https://www.31xs.com/", domains: ["www.31xs.com"],
  search: { url: keyword => "https://www.31xs.com/search.php?keyword=" + encodeURIComponent(keyword), list: css("#bookcase_list tr", "all"), fields: { title: css("td:nth-child(2) a"), bookUrl: css("td:nth-child(2) a", "href"), author: css("td:nth-child(4)") } },
  bookInfo: { fields: { title: css("#info h1"), intro: css("#intro") } },
  toc: { list: css("#list dl dd", "all"), fields: { title: css("a"), chapterUrl: css("a", "href") } },
  content: { title: css("h1"), body: css("#content p") }
});
