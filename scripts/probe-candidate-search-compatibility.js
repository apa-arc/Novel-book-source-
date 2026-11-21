#!/usr/bin/env node
"use strict";
const fs=require("node:fs"),path=require("node:path");
const {parseHTML}=require("linkedom");
const ROOT=path.resolve(__dirname,"..");
const catalog=JSON.parse(fs.readFileSync(path.join(ROOT,"imports/third-party/multi-repo-candidate-catalog.json"),"utf8"));
const probe=JSON.parse(fs.readFileSync(path.join(ROOT,"reports/candidate-homepage-probe.json"),"utf8"));
const reachable=new Set((probe.results||[]).filter(x=>x.classification==="homepage-reachable").map(x=>x.id));
const sources=(catalog.sources||[]).filter(x=>reachable.has(x.id));
const headers={"user-agent":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36","accept":"text/html,application/xhtml+xml"};
function charsetOk(ct){const m=String(ct||"").match(/charset\s*=\s*["']?([^;"'\s]+)/i);return !m||/^(utf-8|utf8)$/i.test(m[1]);}
function compact(v,n=500){return String(v||"").trim().replace(/\s+/g," ").slice(0,n);}
async function get(url){const r=await fetch(url,{headers,signal:AbortSignal.timeout(10000),redirect:"error"});return {status:r.status,url:r.url,contentType:r.headers.get("content-type")||"",body:await r.text()};}
async function inspect(source){
 const started=Date.now();
 try{
  const home=await get(source.baseUrl),doc=parseHTML(home.body).document;
  const forms=[...doc.querySelectorAll("form")].map(f=>({action:f.getAttribute("action")||"",method:(f.getAttribute("method")||"GET").toUpperCase(),inputs:[...f.querySelectorAll("input,button,select")].map(e=>({type:e.getAttribute("type")||"",name:e.getAttribute("name")||"",value:e.getAttribute("value")||""}))}));
  const form=forms.find(f=>f.inputs.some(i=>["text","search"].includes(i.type)));
  if(!form)return {id:source.id,name:source.name,host:source.host,homepageStatus:home.status,homepageContentType:home.contentType,searchMode:"no-form",classification:"needs-manual-search-discovery",elapsedMs:Date.now()-started};
  if(form.method!=="GET")return {id:source.id,name:source.name,host:source.host,homepageStatus:home.status,homepageContentType:home.contentType,searchMode:form.method,classification:"app-incompatible-post-search",elapsedMs:Date.now()-started};
  const searchUrl=new URL(form.action||source.baseUrl,home.url);
  for(const input of form.inputs){if(!input.name)continue;searchUrl.searchParams.set(input.name,["text","search"].includes(input.type)?"斗罗大陆":input.value);}
  const result=await get(searchUrl.href);
  const searchDoc=parseHTML(result.body).document;
  const links=[...searchDoc.querySelectorAll("a[href]")].map(a=>({text:compact(a.textContent,100),href:a.getAttribute("href")||""})).filter(a=>a.text&&a.href).slice(0,50);
  const text=compact(searchDoc.body?.textContent,1800);
  const charset=charsetOk(result.contentType);
  const isHtml=/text\/html|application\/xhtml\+xml/i.test(result.contentType);
  const containsKeyword=text.includes("斗罗大陆");
  const classification=!charset?"app-incompatible-charset":!isHtml?"non-html-search-response":containsKeyword||links.some(x=>x.text.includes("斗罗"))?"get-search-responds":"get-search-no-keyword-hit";
  return {id:source.id,name:source.name,host:source.host,homepageStatus:home.status,homepageContentType:home.contentType,searchMode:"GET",searchUrl:searchUrl.href,searchStatus:result.status,searchContentType:result.contentType,charsetOk:charset,isHtml,containsKeyword,linkCount:links.length,linkSamples:links.slice(0,8),bodySample:text.slice(0,900),classification,elapsedMs:Date.now()-started};
 }catch(error){return {id:source.id,name:source.name,host:source.host,classification:"request-error-or-redirect",error:String(error).slice(0,180),elapsedMs:Date.now()-started};}
}
async function mapLimit(items,limit,fn){const out=new Array(items.length);let next=0;await Promise.all(Array.from({length:Math.min(limit,items.length)},async()=>{while(true){const i=next++;if(i>=items.length)return;out[i]=await fn(items[i]);}}));return out;}
(async()=>{
 const results=await mapLimit(sources,8,inspect),counts={total:results.length};
 for(const r of results)counts[r.classification]=(counts[r.classification]||0)+1;
 const report={schemaVersion:1,generatedAt:new Date().toISOString(),note:"只检测当前 App GET/UTF-8 HTTP 边界下的搜索入口；不代表详情、目录、正文已通过。POST、跨域跳转和非 UTF-8 来源不会自动加入正式订阅。",counts,results};
 const out=path.join(ROOT,"reports/candidate-search-compatibility.json");fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2)+"\n");
 console.log(JSON.stringify(counts,null,2));
})().catch(e=>{console.error(e);process.exit(1);});
