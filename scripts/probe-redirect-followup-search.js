#!/usr/bin/env node
"use strict";
const fs=require("node:fs"),path=require("node:path");
const {parseHTML}=require("linkedom");
const ROOT=path.resolve(__dirname,"..");
const HOSTS=[
 {name:"顶点小说（镜像）",base:"https://m.hafukewx.cc/"},
 {name:"精华书阁",base:"https://m.jhsssd.com/"},
 {name:"书阅屋网",base:"https://m2.sywxs.cc/"},
 {name:"落霞小说/梦阮读书",base:"https://www.kunnu8.com/"},
 {name:"格格党",base:"https://www.rdqsdy.cc/"},
 {name:"闪舞小说",base:"https://www.35xss.net/"}
];
const headers={"user-agent":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36","accept":"text/html,application/xhtml+xml"};
function norm(v,n=1200){return String(v||"").trim().replace(/\s+/g," ").slice(0,n);}
async function get(url){const r=await fetch(url,{headers,signal:AbortSignal.timeout(12000),redirect:"follow"});const ct=r.headers.get("content-type")||"";const html=await r.text();return {status:r.status,url:r.url,contentType:ct,html};}
async function inspect(site){
 const out={name:site.name,base:site.base};
 try{
  const home=await get(site.base),doc=parseHTML(home.html).document;
  out.home={status:home.status,url:home.url,contentType:home.contentType,title:norm(doc.querySelector("title")?.textContent),body:norm(doc.body?.textContent,1800)};
  out.forms=[...doc.querySelectorAll("form")].map(f=>({action:f.getAttribute("action")||"",method:(f.getAttribute("method")||"GET").toUpperCase(),inputs:[...f.querySelectorAll("input")].map(i=>({name:i.getAttribute("name")||"",type:i.getAttribute("type")||"",placeholder:i.getAttribute("placeholder")||""}))}));
  out.searchInputs=[...doc.querySelectorAll("input")].map(i=>({id:i.id||"",name:i.getAttribute("name")||"",type:i.getAttribute("type")||"",placeholder:i.getAttribute("placeholder")||"",onclick:i.getAttribute("onclick")||""}));
  out.searchAnchors=[...doc.querySelectorAll("a[href]")].map(a=>({text:norm(a.textContent,80),href:a.getAttribute("href")||""})).filter(a=>/搜索|search/i.test(a.text+" "+a.href)).slice(0,15);
  const routes=new Map();
  for(const f of out.forms.filter(x=>x.method==="GET"&&x.inputs.some(i=>i.name))){
   const u=new URL(f.action||site.base,home.url);
   for(const i of f.inputs)if(i.name)u.searchParams.set(i.name,["text","search"].includes(i.type)?"斗罗大陆":i.placeholder||i.value||"斗罗大陆");
   routes.set(u.href,"homepage-form");
  }
  for(const p of ["/search?q=斗罗大陆","/search?key=斗罗大陆","/search?keyword=斗罗大陆","/search/?q=斗罗大陆","/search/?searchkey=斗罗大陆","/search.html?keyword=斗罗大陆","/so/search.php?q=斗罗大陆","/search?name=斗罗大陆"]){
   const u=new URL(p,site.base);if(!routes.has(u.href))routes.set(u.href,"common-route");
  }
  out.searchChecks=[];
  for(const [url,route] of routes){
   try{
    const sr=await get(url),sd=parseHTML(sr.html).document,body=norm(sd.body?.textContent,1800);
    const links=[...sd.querySelectorAll("a[href]")].map(a=>({text:norm(a.textContent,100),href:a.getAttribute("href")||""})).filter(a=>a.text&&a.href).filter(a=>/book|novel|read|\/\d|\.html/i.test(a.href)).slice(0,18);
    out.searchChecks.push({route,url:sr.url,status:sr.status,contentType:sr.contentType,title:norm(sd.querySelector("title")?.textContent),containsKeyword:body.includes("斗罗大陆"),body,links});
   }catch(e){out.searchChecks.push({route,url,error:String(e).slice(0,160)});}
  }
 }catch(e){out.error=String(e).slice(0,180);}
 return out;
}
(async()=>{
 const results=[];for(const site of HOSTS){const r=await inspect(site);results.push(r);console.log(r.name,r.home?.status,r.searchChecks?.filter(x=>x.status===200&&x.containsKeyword).length||0);}
 const report={schemaVersion:1,generatedAt:new Date().toISOString(),note:"仅测试公开 HTTPS 首页及 GET 搜索路由；没有登录、提交 POST、下载小说正文或纳入成人/漫画来源。",results};
 const out=path.join(ROOT,"reports/redirect-followup-search-probe.json");fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2)+"\n");
})().catch(e=>{console.error(e);process.exit(1);});
