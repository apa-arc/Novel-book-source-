"use strict";
const { createAdapter } = require("../runtime/source-adapter");
const css = (query, output = "text") => ({ engine: "css", query, output });
module.exports = createAdapter({baseUrl:"https://wujixsw.info/",domains:["wujixsw.info"],search:{url:keyword=>"https://wujixsw.info/search.html?name="+encodeURIComponent(keyword),list:css(".novelslist2 li","all"),fields:{title:css(".s2 a"),bookUrl:css(".s2 a","href"),author:css(".s4")}},bookInfo:{fields:{title:css("h1"),intro:css("meta[property='og:description']","content")}},toc:{list:css("#list dd","all"),fields:{title:css("a"),chapterUrl:css("a","href")}},content:{title:css("h1"),body:css("#content")}});
