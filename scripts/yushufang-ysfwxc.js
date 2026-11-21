"use strict";
const { createAdapter } = require("../runtime/source-adapter");
const css = (query, output = "text") => ({ engine: "css", query, output });
module.exports = createAdapter({baseUrl:"https://www.ysfwxc.com/",domains:["www.ysfwxc.com"],search:{url:keyword=>"https://www.ysfwxc.com/search/?searchkey="+encodeURIComponent(keyword),list:css(".book_data","all"),fields:{title:css("h1 a"),bookUrl:css("h1 a","href"),author:css(".author span")}},bookInfo:{fields:{title:css("h1"),intro:css("meta[property='og:description']","content")}},toc:{list:css(".con dd","all"),fields:{title:css("a"),chapterUrl:css("a","href")}},content:{title:css("h1"),body:css(".content")}});
