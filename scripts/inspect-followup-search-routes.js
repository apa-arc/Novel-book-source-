#!/usr/bin/env node
"use strict";
const fs=require("node:fs"),path=require("node:path");
const {parseHTML}=require("linkedom");
const ROOT=path.resolve(__dirname,"..");
const TARGETS=[
 {id:"luochu",base:"https://m.luochu.com/",paths:["/book/search","/book/search?keyword=斗罗大陆","/book/search?key=斗罗大陆"]},
 {id:"lulushu",base:"https://m.lulushu123.net/",paths:["/home/search","/home/search?key=斗罗大陆","/home/search?name=斗罗大陆"]},
 {id:"esjzone",base:"https://www.esjzone.one/",paths:["/","/search?keyword=斗罗大陆","/search?q=斗罗大陆"]},
 {id:"hotread",base:"https://mobile.hotread.com/",paths:["/search","/storySearch/search","/storySearch/search?key=斗罗大陆","/storySearch/search?keyword=斗罗大陆"]}
];
const headers={"user-agent":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36","accept":"text/html,application/xhtml+xml"};
function norm(v,n=1600){return String(v||"").trim().replace(/\s+/g," ").slice(0,n);}
async function get(url){const r=await fetch(url,{headers,signal:AbortSignal.timeout(12000),redirect:"error"});return {status:r.status,url:r.url,contentType:r.headers.get("content-type")||"",html:await r.text()};}
async function inspect(target){
 const out=[];
 for(const p of target.paths){
  try{
   const r=await get(new URL(p,target.base).href),d=parseHTML(r.html).document;
   const forms=[...d.querySelectorAll("form")].map(f=>({action:f.getAttribute("action")||"",method:(f.getAttribute("method")||"GET").toUpperCase(),inputs:[...f.querySelectorAll("input")].map(i=>({type:i.getAttribute("type")||"",name:i.getAttribute("name")||"",placeholder:i.getAttribute("placeholder")||"",value:i.getAttribute("value")||""}))}));
   const inputs=[...d.querySelectorAll("input")].map(i=>({type:i.getAttribute("type")||"",name:i.getAttribute("name")||"",placeholder:i.getAttribute("placeholder")||"",id:i.id||"",onclick:i.getAttribute("onclick")||""}));
   const links=[...d.querySelectorAll("a[href]")].map(a=>({text:norm(a.textContent,100),href:a.getAttribute("href")||""})).filter(a=>a.text&&a.href).slice(0,40);
   out.push({path:p,status:r.status,url:r.url,contentType:r.contentType,title:norm(d.querySelector("title")?.textContent,200),forms,inputs,body:norm(d.body?.textContent,1600),links});
  }catch(e){out.push({path:p,error:String(e).slice(0,180)});}
 }
 return {id:target.id,base:target.base,checks:out};
}
(async()=>{
 const results=[];for(const target of TARGETS){results.push(await inspect(target));}
 const report={schemaVersion:1,generatedAt:new Date().toISOString(),note:"仅检查公开 GET 页面、表单和链接，不登录、不保存正文。",results};
 const out=path.join(ROOT,"reports/followup-search-route-inspection.json");fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2)+"\n");
 console.log(results.map(x=>({id:x.id,checks:x.checks.map(c=>({path:c.path,status:c.status,error:c.error}))})));
})().catch(e=>{console.error(e);process.exit(1);});
