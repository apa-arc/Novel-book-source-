#!/usr/bin/env node
"use strict";
const fs=require("node:fs"),path=require("node:path");
const {parseHTML}=require("linkedom");
const ROOT=path.resolve(__dirname,".."),BASE="https://www.52shuku.net/";
const TERMS=["斗罗大陆","斗破苍穹"];
const headers={"user-agent":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36","accept":"text/html,application/xhtml+xml"};
async function get(url){const r=await fetch(url,{headers,signal:AbortSignal.timeout(15000),redirect:"error"});return {status:r.status,url:r.url,contentType:r.headers.get("content-type")||"",html:await r.text()};}
function norm(v,n=1200){return String(v||"").trim().replace(/\s+/g," ").slice(0,n);}
function summary(n){return {tag:n.tagName?.toLowerCase()||"",id:n.id||"",className:String(n.className?.baseVal||n.className||"").slice(0,120),textLength:(n.textContent||"").trim().length,text:norm(n.textContent,180)};}
(async()=>{
 const results=[];
 for(const keyword of TERMS){
  const url=new URL("/so/search.php",BASE);url.searchParams.set("q",keyword);
  const search=await get(url.href),sd=parseHTML(search.html).document;
  const anchors=[...sd.querySelectorAll("a[href]")].map(a=>({text:norm(a.textContent,120),href:a.getAttribute("href")||""})).filter(a=>a.text&&a.href).slice(0,100);
  const candidates=[...sd.querySelectorAll("li,article,div")].map(summary).filter(x=>x.textLength>30).sort((a,b)=>b.textLength-a.textLength).slice(0,20);
  const result={keyword,search:{status:search.status,url:search.url,contentType:search.contentType,title:norm(sd.querySelector("title")?.textContent),body:norm(sd.body?.textContent),anchors,candidates}};
  const match=anchors.find(a=>a.text.includes(keyword)||a.href.includes("/book/")||a.href.includes("/novel/")||/\/\d+\/?$/.test(a.href));
  if(match){
   const bookUrl=new URL(match.href,search.url).href;
   try{
    const book=await get(bookUrl),bd=parseHTML(book.html).document;
    const chapterLinks=[...bd.querySelectorAll("a[href]")].map(a=>({text:norm(a.textContent,100),href:a.getAttribute("href")||""})).filter(a=>a.text&&/chapter|read|\.html/i.test(a.href)).slice(0,80);
    result.book={status:book.status,url:book.url,contentType:book.contentType,title:norm(bd.querySelector("title")?.textContent),headings:[...bd.querySelectorAll("h1,h2,h3")].map(summary),chapterLinks};
    const first=chapterLinks[0];
    if(first){const chapterUrl=new URL(first.href,book.url).href;const chapter=await get(chapterUrl),cd=parseHTML(chapter.html).document;const bodies=[...cd.querySelectorAll("div,article,section,main,p")].map(summary).filter(x=>x.textLength>200).sort((a,b)=>b.textLength-a.textLength).slice(0,12);result.firstChapter={status:chapter.status,url:chapter.url,contentType:chapter.contentType,title:norm(cd.querySelector("title")?.textContent),headings:[...cd.querySelectorAll("h1,h2,h3")].map(summary),bodies};}
   }catch(error){result.bookError=String(error).slice(0,180);}
  }
  results.push(result);
 }
 const report={schemaVersion:1,generatedAt:new Date().toISOString(),note:"只检查 GET 搜索、详情和首章页面结构，不登录、不保存正文。",results};
 const out=path.join(ROOT,"reports/52shuku-inspection.json");fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2)+"\n");
 console.log(results.map(x=>({keyword:x.keyword,search:x.search.status,book:x.book?.status,chapters:x.book?.chapterLinks?.length,first:x.firstChapter?.status})));
})().catch(e=>{console.error(e);process.exit(1);});
