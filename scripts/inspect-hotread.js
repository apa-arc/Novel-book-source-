#!/usr/bin/env node
"use strict";
const fs=require("node:fs"),path=require("node:path");
const {parseHTML}=require("linkedom");
const ROOT=path.resolve(__dirname,".."),BASE="https://mobile.hotread.com/";
const TERMS=["斗罗大陆","斗破苍穹"];
const headers={"user-agent":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36","accept":"text/html,application/xhtml+xml"};
async function get(url){const r=await fetch(url,{headers,signal:AbortSignal.timeout(15000),redirect:"error"});return {status:r.status,url:r.url,contentType:r.headers.get("content-type")||"",html:await r.text()};}
function norm(v,n=1400){return String(v||"").trim().replace(/\s+/g," ").slice(0,n);}
function summary(n){return {tag:n.tagName?.toLowerCase()||"",id:n.id||"",className:String(n.className?.baseVal||n.className||"").slice(0,100),textLength:(n.textContent||"").trim().length,text:norm(n.textContent,180)};}
(async()=>{
 const results=[];
 for(const keyword of TERMS){
  const url=new URL("/search",BASE);url.searchParams.set("keyWord",keyword);
  const search=await get(url.href),doc=parseHTML(search.html).document;
  const anchors=[...doc.querySelectorAll("a[href]")].map(a=>({text:norm(a.textContent,120),href:a.getAttribute("href")||"",onclick:a.getAttribute("onclick")||""})).filter(a=>a.text&&a.href).slice(0,100);\n  const firstItems=[...doc.querySelectorAll("#searchContainer li")].slice(0,10).map(x=>x.outerHTML.slice(0,1800));\n  const scripts=[...doc.querySelectorAll("script[src]")].map(x=>x.getAttribute("src")).filter(Boolean).slice(0,40);\n  const inlineScripts=[...doc.querySelectorAll("script:not([src])")].map(x=>x.textContent||"").filter(x=>/story|detail|search|url/i.test(x)).map(x=>x.slice(0,1200)).slice(0,15);
  const candidates=[...doc.querySelectorAll("div,li,article,section")].map(summary).filter(x=>x.textLength>30).sort((a,b)=>b.textLength-a.textLength).slice(0,20);
  results.push({keyword,search:{status:search.status,url:search.url,contentType:search.contentType,title:norm(doc.querySelector("title")?.textContent),body:norm(doc.body?.textContent),anchors,candidates,firstItems,scripts,inlineScripts}});
 }
 const report={schemaVersion:1,generatedAt:new Date().toISOString(),note:"仅检查 GET 搜索结果页结构，不登录、不保存小说正文。",results};
 const out=path.join(ROOT,"reports/hotread-search-inspection.json");fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2)+"\n");
 console.log(results.map(x=>({keyword:x.keyword,status:x.search.status,anchors:x.search.anchors.length,title:x.search.title})));
})().catch(e=>{console.error(e);process.exit(1);});
