"use strict";
const { createAdapter } = require("../runtime/source-adapter");
const chain = (steps, output = "text") => ({ engine: "legado-chain", steps, output });
const pick = (kind, name, output = "text") => chain([{ kind, name, index: null }], output);
module.exports = createAdapter({
  baseUrl: "https://raw.githubusercontent.com/apa-arc/Novel-book-source-/main/demo-content/",
  domains: ["raw.githubusercontent.com"],
  search: {
    url: () => "https://raw.githubusercontent.com/apa-arc/Novel-book-source-/main/demo-content/search.html",
    list: { engine: "css", query: ".book", output: "all" },
    fields: { title: pick("class", "title"), bookUrl: pick("class", "title", "href"), author: pick("class", "author"), intro: pick("class", "intro") }
  },
  bookInfo: { fields: { title: pick("class", "title"), author: pick("class", "author"), intro: pick("class", "intro") } },
  toc: {
    list: { engine: "css", query: ".chapter", output: "all" },
    fields: { title: chain([{ kind: "tag", name: "a", index: null }]), chapterUrl: chain([{ kind: "tag", name: "a", index: null }], "href") }
  },
  content: { title: pick("class", "title"), body: pick("id", "content") }
});
