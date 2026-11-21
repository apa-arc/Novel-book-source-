#!/usr/bin/env node
"use strict";
const fs=require("node:fs");
const path=require("node:path");
const {parseHTML}=require("linkedom");
const ROOT=path.resolve(__dirname,"..");
const BASE="https://bixiange.top/";
const BOOK="https://bixiange.top/trxs/23598/";
const CHAPTER="https://bixiange.top/trxs/21002/index/1.html";
const headers={"user-agent":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36","accept":"text/html,application/xhtml+xml"};
async function get(url){const r=await fetch(url,{headers,signal:AbortSignal.timeout(25000),redirect:"follow"});const html=await r.text();return {status:r.status,url:r.url,html};}
function summary(node){return {tag:node.tagName?.toLowerCase()||"",id:node.id||"",className:String(node.className?.baseVal||node.className||"").slice(0,140),textLength:(node.textContent||"").trim().length,text:(node.textContent||"").trim().replace(/\s+/g," ").slice(0,180)};}
(async()=>{
 const home=await get(BASE),hd=parseHTML(home.html).document;
 const forms=[...hd.querySelectorAll("form")].map(f=>({action:f.getAttribute("action")||"",method:(f.getAttribute("method")||"GET").toUpperCase(),id:f.id||"",className:String(f.className||""),inputs:[...f.querySelectorAll("input,button,select")].map(e=>({tag:e.tagName.toLowerCase(),type:e.getAttribute("type")||"",name:e.getAttribute("name")||"",value:e.getAttribute("value")||"",placeholder:e.getAttribute("placeholder")||""}))}));
 const book=await get(BOOK),bd=parseHTML(book.html).document;
 const chapterLinks=[...bd.querySelectorAll("a[href]")].map(a=>({text:(a.textContent||"").trim().replace(/\s+/g," ").slice(0,80),href:a.getAttribute("href")||""})).filter(a=>/index\/\d+\.html|\/read\//i.test(a.href)).slice(0,30);
 const chapter=await get(CHAPTER),cd=parseHTML(chapter.html).document;
 const candidates=[...cd.querySelectorAll("div,article,section,main,p")].map(summary).filter(x=>x.textLength>=300).sort((a,b)=>b.textLength-a.textLength).slice(0,20);
 const headings=[...cd.querySelectorAll("h1,h2,h3")].map(summary);
 const report={generatedAt:new Date().toISOString(),homepage:{status:home.status,url:home.url,title:hd.querySelector("title")?.textContent||"",forms,searchInputs:[...hd.querySelectorAll("input")].map(e=>({type:e.getAttribute("type")||"",name:e.getAttribute("name")||"",placeholder:e.getAttribute("placeholder")||"",formAction:e.closest("form")?.getAttribute("action")||""}))},bookPage:{status:book.status,url:book.url,title:bd.querySelector("title")?.textContent||"",headings:[...bd.querySelectorAll("h1,h2,h3")].map(summary),chapterLinks},chapterPage:{status:chapter.status,url:chapter.url,title:cd.querySelector("title")?.textContent||"",headings,contentCandidates:candidates,links:[...cd.querySelectorAll("a[href]")].map(a=>({text:(a.textContent||"").trim().replace(/\s+/g," ").slice(0,60),href:a.getAttribute("href")||""})).filter(a=>/index\/\d+\.html/i.test(a.href)).slice(0,20)}};
 const out=path.join(ROOT,"reports/bixiange-inspection.json");fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2)+"\n");
 console.log(JSON.stringify({home:home.status,forms:forms.length,book:book.status,chapter:chapter.status,contentCandidates:candidates.length,output:out},null,2));
})().catch(e=>{console.error(e);process.exit(1);});
