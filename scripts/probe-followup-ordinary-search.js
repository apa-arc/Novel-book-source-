#!/usr/bin/env node
"use strict";
const fs=require("node:fs"),path=require("node:path");
const {parseHTML}=require("linkedom");
const ROOT=path.resolve(__dirname,"..");
const SITES=[
 {name:"闪舞小说",base:"https://www.35xss.net/",paths:["/search.html?searchkey=斗罗大陆","/search.html?keyword=斗罗大陆","/search.html?name=斗罗大陆","/search.html?q=斗罗大陆","/search.html?key=斗罗大陆","/search.html?search=斗罗大陆"]},
 {name:"242小说",base:"https://www.242xs.info/",paths:["/search?searchkey=斗罗大陆","/search.html?searchkey=斗罗大陆","/search?keyword=斗罗大陆","/search?q=斗罗大陆"]},
 {name:"四三中文",base:"https://www.zw43.com/",paths:["/search?searchkey=斗罗大陆","/search.html?searchkey=斗罗大陆","/search?keyword=斗罗大陆","/search?q=斗罗大陆"]},
 {name:"新ak小说网",base:"https://xakxsw.com/",paths:["/search?searchkey=斗罗大陆","/search.html?searchkey=斗罗大陆","/search?keyword=斗罗大陆","/search?q=斗罗大陆"]}
];
const headers={"user-agent":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36","accept":"text/html,application/xhtml+xml"};
function norm(v,n=1400){return String(v||"").trim().replace(/\s+/g," ").slice(0,n);}
async function get(url){const r=await fetch(url,{headers,signal:AbortSignal.timeout(12000),redirect:"follow"});return {status:r.status,url:r.url,contentType:r.headers.get("content-type")||"",html:await r.text()};}
async function inspect(site){
 const out={name:site.name,base:site.base};
 try{
  const h=await get(site.base),d=parseHTML(h.html).document;
  out.home={status:h.status,url:h.url,contentType:h.contentType,title:norm(d.querySelector("title")?.textContent),body:norm(d.body?.textContent,1200)};
  out.forms=[...d.querySelectorAll("form")].map(f=>({action:f.getAttribute("action")||"",method:f.getAttribute("method")||"GET",inputs:[...f.querySelectorAll("input")].map(i=>({name:i.name,type:i.type,placeholder:i.placeholder}))}));
  out.inputs=[...d.querySelectorAll("input")].map(i=>({id:i.id,name:i.name,type:i.type,placeholder:i.placeholder,onclick:i.getAttribute("onclick")}));
  out.scripts=[...d.querySelectorAll("script[src]")].map(s=>s.getAttribute("src")).filter(Boolean).slice(0,30);
  out.inlineScripts=[...d.querySelectorAll("script:not([src])")].map(s=>s.textContent||"").filter(s=>/search|submit|keyword|searchkey/i.test(s)).map(s=>s.slice(0,1800)).slice(0,15);
  out.checks=[];
  for(const p of site.paths){try{const r=await get(new URL(p,site.base).href),sd=parseHTML(r.html).document,body=norm(sd.body?.textContent,1600);const links=[...sd.querySelectorAll("a[href]")].map(a=>({text:norm(a.textContent,120),href:a.getAttribute("href")||""})).filter(a=>a.text&&a.href).slice(0,40);out.checks.push({path:p,status:r.status,url:r.url,contentType:r.contentType,title:norm(sd.querySelector("title")?.textContent),containsKeyword:body.includes("斗罗大陆"),body,links});}catch(e){out.checks.push({path:p,error:String(e).slice(0,160)});}}
 }catch(e){out.error=String(e).slice(0,160);}
 return out;
}
(async()=>{const results=[];for(const s of SITES){const r=await inspect(s);results.push(r);console.log(r.name,r.home?.status,r.checks?.filter(x=>x.status===200&&x.containsKeyword).length||0);}
const report={schemaVersion:1,generatedAt:new Date().toISOString(),note:"只检查公开 HTTPS 首页和 GET 搜索路由，不登录、不读取或保存小说正文。",results};
const out=path.join(ROOT,"reports/followup-ordinary-search-probe.json");fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2)+"\n");})().catch(e=>{console.error(e);process.exit(1);});
