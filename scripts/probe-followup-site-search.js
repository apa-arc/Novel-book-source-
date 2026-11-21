#!/usr/bin/env node
"use strict";
const fs=require("node:fs"),path=require("node:path");
const {parseHTML}=require("linkedom");
const ROOT=path.resolve(__dirname,"..");
const SITES=[
 {name:"得奇小说网（deqitxt）",base:"https://www.deqitxt.com/",queries:["斗罗大陆","斗破苍穹"],paths:["/?key={q}","/search/?key={q}","/search?key={q}","/search.html?searchkey={q}","/modules/article/search.php?searchkey={q}"]},
 {name:"话本小说",base:"https://www.ihuaben.com/",queries:["斗罗大陆","斗破苍穹"],paths:["/search.html?keyword={q}","/search?keyword={q}","/search.html?key={q}"]},
 {name:"逐浪网手机版",base:"https://m.zhulang.com/",queries:["绝世帝君","听鬼说故事"],paths:["/search/index.html?k={q}","/search/index.html?keyword={q}","/search/index.html?key={q}"]},
 {name:"鲲弩小说",base:"https://www.kunnu8.com/",queries:["斗罗大陆","斗破苍穹"],paths:["/?s={q}","/search.asp?keyword={q}","/search.html?keyword={q}","/search/?q={q}","/search/?key={q}","/so/?q={q}"]}
];
const headers={"user-agent":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36","accept":"text/html,application/xhtml+xml"};
function norm(v,n=1300){return String(v||"").trim().replace(/\s+/g," ").slice(0,n);}
async function get(url){const r=await fetch(url,{headers,signal:AbortSignal.timeout(12000),redirect:"follow"});return {status:r.status,url:r.url,contentType:r.headers.get("content-type")||"",html:await r.text()};}
async function inspect(site){
 const out={name:site.name,base:site.base};
 try{
  const h=await get(site.base),d=parseHTML(h.html).document;
  out.home={status:h.status,title:norm(d.querySelector("title")?.textContent),body:norm(d.body?.textContent,1200)};
  out.forms=[...d.querySelectorAll("form")].map(f=>({action:f.getAttribute("action")||"",method:(f.getAttribute("method")||"GET").toUpperCase(),inputs:[...f.querySelectorAll("input")].map(i=>({id:i.id,name:i.name,type:i.type,placeholder:i.placeholder}))}));
  out.inputs=[...d.querySelectorAll("input")].map(i=>({id:i.id,name:i.name,type:i.type,placeholder:i.placeholder,onfocus:i.getAttribute("onfocus"),onclick:i.getAttribute("onclick")}));
  out.inlineScripts=[...d.querySelectorAll("script:not([src])")].map(s=>s.textContent||"").filter(s=>/function\\s+(doit|search)|doit\\s*=|search\\s*=|search\\(/i.test(s)).map(s=>s.slice(0,2200)).slice(0,12);
  out.checks=[];
  for(const q of site.queries)for(const p of site.paths){
   const url=new URL(p.replace("{q}",encodeURIComponent(q)),site.base).href;
   try{const r=await get(url),sd=parseHTML(r.html).document,body=norm(sd.body?.textContent,1700);
    const links=[...sd.querySelectorAll("a[href]")].map(a=>({text:norm(a.textContent,120),href:a.getAttribute("href")||""})).filter(a=>a.text&&a.href&&/book|novel|read|\/\d|\.html/i.test(a.href)).slice(0,20);
    out.checks.push({query:q,path:p,status:r.status,url:r.url,contentType:r.contentType,title:norm(sd.querySelector("title")?.textContent),containsQuery:body.includes(q),body,links});
   }catch(e){out.checks.push({query:q,path:p,error:String(e).slice(0,150)});}
  }
 }catch(e){out.error=String(e).slice(0,160);}
 return out;
}
(async()=>{const results=[];for(const s of SITES){const r=await inspect(s);results.push(r);console.log(r.name,r.home?.status,r.checks?.filter(x=>x.status===200&&x.containsQuery).length||0);}
const report={schemaVersion:1,generatedAt:new Date().toISOString(),note:"只探测公开 GET 搜索路由与页面表单；不登录、不提交 POST、不读取正文。",results};
const out=path.join(ROOT,"reports/followup-site-search-probe.json");fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2)+"\n");})().catch(e=>{console.error(e);process.exit(1);});
