#!/usr/bin/env node
"use strict";
const fs=require("node:fs"),path=require("node:path");
const {parseHTML}=require("linkedom");
const ROOT=path.resolve(__dirname,".."),BASE="https://so.ihuaben.com/";
const TERMS=["凌天剑狂","斩神","师兄啊师兄","TF四代"];
const headers={"user-agent":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36","accept":"text/html,application/xhtml+xml"};
function norm(v,n=1400){return String(v||"").trim().replace(/\s+/g," ").slice(0,n);}
async function get(url){const r=await fetch(url,{headers,signal:AbortSignal.timeout(12000),redirect:"follow"});return {status:r.status,url:r.url,contentType:r.headers.get("content-type")||"",html:await r.text()};}
(async()=>{const results=[];for(const term of TERMS){const u=new URL("/search",BASE);u.searchParams.set("keyword",term);try{const r=await get(u.href),d=parseHTML(r.html).document;const links=[...d.querySelectorAll("a[href]")].map(a=>({text:norm(a.textContent,140),href:a.getAttribute("href")||"",parent:a.parentElement?.parentElement?.outerHTML?.slice(0,1300)||""})).filter(a=>a.text&&a.href).slice(0,70);results.push({term,status:r.status,url:r.url,contentType:r.contentType,title:norm(d.querySelector("title")?.textContent),body:norm(d.body?.textContent,1400),links});}catch(e){results.push({term,error:String(e).slice(0,160)});}}
const report={schemaVersion:1,generatedAt:new Date().toISOString(),results};const out=path.join(ROOT,"reports/ihuaben-search-probe.json");fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2)+"\n");console.log(results.map(x=>({term:x.term,status:x.status,body:x.body?.slice(0,250)})));})().catch(e=>{console.error(e);process.exit(1);});
