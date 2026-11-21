#!/usr/bin/env node
"use strict";
const fs=require("node:fs"),path=require("node:path");
const {parseHTML}=require("linkedom");
const ROOT=path.resolve(__dirname,"..");
const HOSTS=["https://www.yeban360.com/","https://www.c66c.com/","https://www.babazw.com/","https://www.chunyushuwu.com/","https://m.yeduku.com/","https://www.deqitxt.com/"];
const headers={"user-agent":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36","accept":"text/html,application/xhtml+xml"};
function decode(bytes,contentType){const m=String(contentType||"").match(/charset\s*=\s*["']?([^;"'\s]+)/i);const label=(m?.[1]||"utf-8").toLowerCase();try{return new TextDecoder(label).decode(bytes);}catch{return new TextDecoder("utf-8").decode(bytes);}}
async function get(url){const r=await fetch(url,{headers,signal:AbortSignal.timeout(18000),redirect:"follow"});const ct=r.headers.get("content-type")||"";const bytes=Buffer.from(await r.arrayBuffer());return {status:r.status,url:r.url,contentType:ct,html:decode(bytes,ct)};}
function norm(t){return String(t||"").trim().replace(/\s+/g," ").slice(0,140);}
async function inspect(base){
 const started=Date.now();
 try{
  const home=await get(base),doc=parseHTML(home.html).document;
  const forms=[...doc.querySelectorAll("form")].map(f=>({action:f.getAttribute("action")||"",method:(f.getAttribute("method")||"GET").toUpperCase(),id:f.id||"",className:String(f.className||""),inputs:[...f.querySelectorAll("input,button,select")].map(e=>({tag:e.tagName.toLowerCase(),type:e.getAttribute("type")||"",name:e.getAttribute("name")||"",value:e.getAttribute("value")||"",placeholder:e.getAttribute("placeholder")||""}))}));
  const anchors=[...doc.querySelectorAll("a[href]")].map(a=>({text:norm(a.textContent),href:a.getAttribute("href")||""})).filter(a=>a.text&&a.href).slice(0,60);
  const searchForm=forms.find(f=>f.inputs.some(i=>i.type==="text"||i.type==="search"));
  let search=null;
  if(searchForm&&searchForm.method==="GET"){
   const u=new URL(searchForm.action||base,home.url);
   for(const input of searchForm.inputs){if(!input.name)continue;u.searchParams.set(input.name,input.type==="text"||input.type==="search"?"斗罗大陆":input.value);}
   try{const sr=await get(u.href),sd=parseHTML(sr.html).document;search={status:sr.status,url:sr.url,contentType:sr.contentType,title:norm(sd.querySelector("title")?.textContent),body:norm(sd.body?.textContent).slice(0,900),links:[...sd.querySelectorAll("a[href]")].map(a=>({text:norm(a.textContent),href:a.getAttribute("href")||""})).filter(a=>/book|novel|read|\/\d+/i.test(a.href)).slice(0,20)};}catch(e){search={error:String(e).slice(0,180)};}
  }
  return {base,status:home.status,url:home.url,contentType:home.contentType,title:norm(doc.querySelector("title")?.textContent),forms,searchFormMethod:searchForm?.method||null,search,anchors,elapsedMs:Date.now()-started};
 }catch(e){return {base,status:null,error:String(e).slice(0,180),elapsedMs:Date.now()-started};}
}
(async()=>{
 const results=[];for(const host of HOSTS){const r=await inspect(host);results.push(r);console.log(host,r.status,r.searchFormMethod||"-",r.search?.status||"-",r.contentType||"");}
 const report={schemaVersion:1,generatedAt:new Date().toISOString(),note:"只检查公开首页和 GET 搜索表单，不读取/保存小说正文。POST 搜索与非 UTF-8 编码标记的来源不符合当前 App 的 GET/UTF-8 HTTP 客户端限制。",results};
 const out=path.join(ROOT,"reports/selected-candidate-homepage-inspection.json");fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2)+"\n");
})().catch(e=>{console.error(e);process.exit(1);});
