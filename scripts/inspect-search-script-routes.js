#!/usr/bin/env node
"use strict";
const fs=require("node:fs"),path=require("node:path");
const {parseHTML}=require("linkedom");
const ROOT=path.resolve(__dirname,"..");
const SITES=[
 {name:"格格党",base:"https://www.rdqsdy.cc/"},
 {name:"鲲弩小说",base:"https://www.kunnu8.com/"},
 {name:"得奇小说网",base:"https://www.deqitxt.com/"},
 {name:"闪舞小说",base:"https://www.35xss.net/"}
];
const headers={"user-agent":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36","accept":"text/html,application/xhtml+xml"};
function norm(v,n=1000){return String(v||"").trim().replace(/\s+/g," ").slice(0,n);}
async function get(url){const r=await fetch(url,{headers,signal:AbortSignal.timeout(12000),redirect:"follow"});return {status:r.status,url:r.url,contentType:r.headers.get("content-type")||"",html:await r.text()};}
(async()=>{const results=[];for(const site of SITES){const out={name:site.name,base:site.base};try{const h=await get(site.base),d=parseHTML(h.html).document;out.home={status:h.status,title:norm(d.querySelector("title")?.textContent),body:norm(d.body?.textContent,1200)};out.forms=[...d.querySelectorAll("form")].map(f=>({action:f.getAttribute("action"),method:f.getAttribute("method"),outer:f.outerHTML.slice(0,2500)}));out.scripts=[...d.querySelectorAll("script[src]")].map(s=>new URL(s.getAttribute("src"),h.url).href).slice(0,15);out.inline=[...d.querySelectorAll("script:not([src])")].map(s=>s.textContent||"").filter(s=>/search|keyword|searchkey|doit|submit/i.test(s)).map(s=>s.slice(0,2200)).slice(0,15);out.scriptContents=[];for(const url of out.scripts.slice(0,8)){try{const r=await get(url),txt=r.html;const hits=[];for(const term of ["function search","function doit","search.html","searchkey","location.href","location.assign","searchUrl"]){const i=txt.toLowerCase().indexOf(term.toLowerCase());if(i>=0)hits.push({term,snippet:txt.slice(Math.max(0,i-250),Math.min(txt.length,i+650))});}if(hits.length)out.scriptContents.push({url,status:r.status,hits});}catch(e){}}}catch(e){out.error=String(e).slice(0,150);}results.push(out);console.log(site.name,out.home?.status,out.scripts?.length||0);}
const report={schemaVersion:1,generatedAt:new Date().toISOString(),note:"仅检查首页搜索表单和公开脚本中的搜索路由，不登录、不提交表单、不抓取正文。",results};const p=path.join(ROOT,"reports/search-script-route-inspection.json");fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,JSON.stringify(report,null,2)+"\n");})().catch(e=>{console.error(e);process.exit(1);});
