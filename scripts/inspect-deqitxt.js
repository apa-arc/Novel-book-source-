#!/usr/bin/env node
"use strict";
const fs=require("node:fs"),path=require("node:path");
const {parseHTML}=require("linkedom");
const ROOT=path.resolve(__dirname,".."),BASE="https://www.deqitxt.com/";
const BOOK="https://www.deqitxt.com/21/",CHAPTER="https://www.deqitxt.com/21/529239.html";
const SEARCH_TERMS=["夜无疆","官场从秘书开始"];
const headers={"user-agent":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36","accept":"text/html,application/xhtml+xml"};
async function get(url){const r=await fetch(url,{headers,signal:AbortSignal.timeout(20000),redirect:"follow"});return {status:r.status,url:r.url,contentType:r.headers.get("content-type")||"",html:await r.text()};}
function norm(v){return String(v||"").trim().replace(/\s+/g," ").slice(0,180);}
function summary(n){return {tag:n.tagName?.toLowerCase()||"",id:n.id||"",className:String(n.className?.baseVal||n.className||"").slice(0,140),textLength:(n.textContent||"").trim().length,text:norm(n.textContent)};}
async function main(){
 const home=await get(BASE),hd=parseHTML(home.html).document;
 const forms=[...hd.querySelectorAll("form")].map(f=>({outerHTML:f.outerHTML.slice(0,1200),action:f.getAttribute("action")||"",method:(f.getAttribute("method")||"GET").toUpperCase(),id:f.id||"",className:String(f.className||""),inputs:[...f.querySelectorAll("input,button,select")].map(e=>({tag:e.tagName.toLowerCase(),type:e.getAttribute("type")||"",name:e.getAttribute("name")||"",value:e.getAttribute("value")||"",placeholder:e.getAttribute("placeholder")||""}))}));
 const searches=[];
 const paths=keyword=>["/?key=","/?searchkey=","/search/?key=","/search?key=","/search.html?key=","/search.html?searchkey=","/index.php?key=","/search/?searchkey="].map(p=>p+encodeURIComponent(keyword));
 for(const keyword of SEARCH_TERMS){
  for(const p of paths(keyword)){
   try {
    const response=await get(new URL(p,BASE).href),doc=parseHTML(response.html).document;
    const bodyText=String(doc.body?.textContent||"").trim().replace(/\s+/g," ");
    const links=[...doc.querySelectorAll("a[href]")].map(a=>({text:norm(a.textContent),href:a.getAttribute("href")||""})).filter(a=>a.text&&/^\/\d+\/?$/.test(a.href)).slice(0,30);
    searches.push({keyword,path:p,status:response.status,url:response.url,contentType:response.contentType,title:norm(doc.querySelector("title")?.textContent),bodyLength:bodyText.length,bodyStart:bodyText.slice(0,1400),bodyEnd:bodyText.slice(-1000),bookLinks:links});
   } catch(error) { searches.push({keyword,path:p,error:String(error).slice(0,200)}); }
  }
 }
 const book=await get(BOOK),bd=parseHTML(book.html).document;
 const chapterLinks=[...bd.querySelectorAll("a[href]")].map(a=>({text:norm(a.textContent),href:a.getAttribute("href")||""})).filter(a=>a.href&&(/\.html/i.test(a.href)||/chapter|read/i.test(a.href))).slice(0,60);
 const chapter=await get(CHAPTER),cd=parseHTML(chapter.html).document;
 const contentCandidates=[...cd.querySelectorAll("div,article,section,main,p")].map(summary).filter(x=>x.textLength>=200).sort((a,b)=>b.textLength-a.textLength).slice(0,20);
 const report={generatedAt:new Date().toISOString(),homepage:{status:home.status,url:home.url,contentType:home.contentType,title:norm(hd.querySelector("title")?.textContent),forms,scripts:[...hd.querySelectorAll("script[src]")].map(x=>x.getAttribute("src")).slice(0,40)},searches,bookPage:{status:book.status,url:book.url,contentType:book.contentType,title:norm(bd.querySelector("title")?.textContent),headings:[...bd.querySelectorAll("h1,h2,h3")].map(summary),chapterLinks},chapterPage:{status:chapter.status,url:chapter.url,contentType:chapter.contentType,title:norm(cd.querySelector("title")?.textContent),headings:[...cd.querySelectorAll("h1,h2,h3")].map(summary),contentCandidates,links:[...cd.querySelectorAll("a[href]")].map(a=>({text:norm(a.textContent),href:a.getAttribute("href")||""})).filter(a=>/\.html/i.test(a.href)).slice(0,30)}};
 const out=path.join(ROOT,"reports/deqitxt-inspection.json");fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2)+"\n");
 console.log(JSON.stringify({home:home.status,searches:searches.length,book:book.status,chapter:chapter.status,contentCandidates:contentCandidates.length},null,2));
}
main().catch(e=>{console.error(e);process.exit(1);});
