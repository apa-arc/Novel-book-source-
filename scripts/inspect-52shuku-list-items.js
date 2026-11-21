#!/usr/bin/env node
"use strict";
const fs=require("node:fs"),path=require("node:path");
const {parseHTML}=require("linkedom");
const ROOT=path.resolve(__dirname,"..");
const BOOKS=[
 {title:"斗罗大陆",url:"https://www.52shuku.net/wuxia/hqO7.html"},
 {title:"斗破苍穹",url:"https://www.52shuku.net/wuxia/hqOE.html"}
];
const headers={"user-agent":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36","accept":"text/html,application/xhtml+xml"};
async function get(url){const r=await fetch(url,{headers,signal:AbortSignal.timeout(15000),redirect:"error"});return {status:r.status,url:r.url,contentType:r.headers.get("content-type")||"",html:await r.text()};}
function norm(v,n=150){return String(v||"").trim().replace(/\s+/g," ").slice(0,n);}
(async()=>{
 const results=[];
 for(const book of BOOKS){
  const r=await get(book.url),d=parseHTML(r.html).document;
  const items=[...d.querySelectorAll("article.article-content ul.list.clearfix li.mulu")];
  const sample=items.map(li=>({text:norm(li.textContent),href:li.querySelector("a")?.getAttribute("href")||"",anchorText:norm(li.querySelector("a")?.textContent)}));
  const pageLinks=[...d.querySelectorAll("article.article-content a[href]")].map(a=>({text:norm(a.textContent),href:a.getAttribute("href")||""})).filter(x=>/^第\\d+页$/.test(x.text));
  results.push({title:book.title,status:r.status,url:r.url,pageItemCount:items.length,first:sample.slice(0,20),middle:sample.slice(740,750),last:sample.slice(-20),pageLinkCount:pageLinks.length,pageLinks:pageLinks.slice(0,10)});
 }
 const report={schemaVersion:1,generatedAt:new Date().toISOString(),results};
 const out=path.join(ROOT,"reports/52shuku-list-item-inspection.json");fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2)+"\n");
 console.log(results.map(x=>({title:x.title,count:x.pageItemCount,pageLinkCount:x.pageLinkCount})));
})().catch(e=>{console.error(e);process.exit(1);});
