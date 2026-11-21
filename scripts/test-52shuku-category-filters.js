#!/usr/bin/env node
"use strict";
const fs=require("node:fs"),path=require("node:path");
const {parseHTML}=require("linkedom");
const ROOT=path.resolve(__dirname,"..");
const BASE="https://www.52shuku.net/so/search.php";
const headers={"user-agent":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36","accept":"text/html,application/xhtml+xml"};
const variants=[
 ["default",{}],
 ["no-extra",{m:"no",f:"_all",syn:"no"}],
 ["male-all",{m:"no",f:"_all",syn:"no",c:"15,16,18,19,20,23"}],
 ["male-15",{c:"15"}],
 ["male-16",{c:"16"}],
 ["male-18",{c:"18"}],
 ["male-19",{c:"19"}],
 ["male-20",{c:"20"}],
 ["male-23",{c:"23"}]
];
function norm(v,n=1000){return String(v||"").trim().replace(/\s+/g," ").slice(0,n);}
async function get(url){const r=await fetch(url,{headers,signal:AbortSignal.timeout(15000),redirect:"error"});return {status:r.status,url:r.url,contentType:r.headers.get("content-type")||"",html:await r.text()};}
(async()=>{
 const results=[];
 for(const keyword of ["斗罗大陆","斗破苍穹"]){
  for(const [name,params] of variants){
   const u=new URL(BASE);u.searchParams.set("q",keyword);for(const [k,v] of Object.entries(params))u.searchParams.set(k,v);
   const r=await get(u.href),d=parseHTML(r.html).document;
   const titles=[...d.querySelectorAll("article.excerpt h2")].map(x=>norm(x.textContent,120)).slice(0,25);
   results.push({keyword,variant:name,status:r.status,url:r.url,title:norm(d.querySelector("title")?.textContent),body:norm(d.body?.textContent,700),titles,match:titles.some(x=>x.includes(keyword))});
  }
 }
 const report={schemaVersion:1,generatedAt:new Date().toISOString(),results};
 const out=path.join(ROOT,"reports/52shuku-category-filter-test.json");fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2)+"\n");
 console.log(results.map(x=>({keyword:x.keyword,variant:x.variant,status:x.status,match:x.match,titles:x.titles.slice(0,3)})));
})().catch(e=>{console.error(e);process.exit(1);});
