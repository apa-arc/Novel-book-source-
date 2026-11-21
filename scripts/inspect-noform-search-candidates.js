#!/usr/bin/env node
"use strict";
const fs=require("node:fs"),path=require("node:path");
const {parseHTML}=require("linkedom");
const ROOT=path.resolve(__dirname,"..");
const catalog=JSON.parse(fs.readFileSync(path.join(ROOT,"imports/third-party/multi-repo-candidate-catalog.json"),"utf8"));
const probe=JSON.parse(fs.readFileSync(path.join(ROOT,"reports/candidate-homepage-probe.json"),"utf8"));
const compatibility=JSON.parse(fs.readFileSync(path.join(ROOT,"reports/candidate-search-compatibility.json"),"utf8"));
const noForm=new Set(compatibility.results.filter(x=>x.classification==="needs-manual-search-discovery").map(x=>x.id));
const sources=(catalog.sources||[]).filter(x=>noForm.has(x.id));
const headers={"user-agent":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36","accept":"text/html,application/xhtml+xml"};
async function sanitize(value){if(typeof value==="string")return value.replace(/pk\\.[A-Za-z0-9._-]{20,}/g,"[REDACTED]").replace(/([?&](?:access_token|token|api_key)=)[^&\\s]+/gi,"$1[REDACTED]");if(Array.isArray(value))return value.map(sanitize);if(value&&typeof value==="object")return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,sanitize(v)]));return value;}\nasync function inspect(source){
 const started=Date.now();
 try{
  const response=await fetch(source.baseUrl,{headers,signal:AbortSignal.timeout(12000),redirect:"error"});
  const contentType=response.headers.get("content-type")||"",html=await response.text(),doc=parseHTML(html).document;
  const inputs=[...doc.querySelectorAll("input,button,select")].map(e=>({tag:e.tagName.toLowerCase(),type:e.getAttribute("type")||"",name:e.getAttribute("name")||"",placeholder:e.getAttribute("placeholder")||"",onclick:e.getAttribute("onclick")||"",id:e.id||"",className:String(e.className?.baseVal||e.className||"").slice(0,80)})).slice(0,50);
  const searchAnchors=[...doc.querySelectorAll("a[href]")].map(a=>({text:(a.textContent||"").trim().replace(/\s+/g," ").slice(0,80),href:a.getAttribute("href")||""})).filter(a=>/搜索|搜书|search|find/i.test(a.text+" "+a.href)).slice(0,40);
  const scripts=[...doc.querySelectorAll("script[src]")].map(s=>s.getAttribute("src")).filter(Boolean).slice(0,30);
  const forms=[...doc.querySelectorAll("form")].map(f=>({action:f.getAttribute("action")||"",method:(f.getAttribute("method")||"GET").toUpperCase(),id:f.id||"",inputs:[...f.querySelectorAll("input")].map(i=>({type:i.getAttribute("type")||"",name:i.getAttribute("name")||"",placeholder:i.getAttribute("placeholder")||""}))}));
  const searchText=(doc.body?.textContent||"").split(/\n/).map(x=>x.trim()).filter(x=>/搜索|搜书|查找|search/i.test(x)).slice(0,20);
  return {id:source.id,name:source.name,host:source.host,status:response.status,url:response.url,contentType,title:doc.querySelector("title")?.textContent||"",forms,inputs,searchAnchors,scripts,searchText,elapsedMs:Date.now()-started};
 }catch(error){return {id:source.id,name:source.name,host:source.host,error:String(error).slice(0,180),elapsedMs:Date.now()-started};}
}
async function mapLimit(items,limit,fn){const out=new Array(items.length);let next=0;await Promise.all(Array.from({length:Math.min(limit,items.length)},async()=>{while(true){const i=next++;if(i>=items.length)return;out[i]=await fn(items[i]);}}));return out;}
(async()=>{
 const results=await mapLimit(sources,8,inspect);
 const counts={total:results.length,withForms:results.filter(x=>x.forms?.length).length,withSearchInputs:results.filter(x=>x.inputs?.some(i=>["search","text"].includes(i.type))).length,withSearchLinks:results.filter(x=>x.searchAnchors?.length).length,errors:results.filter(x=>x.error).length};
 const report={schemaVersion:1,generatedAt:new Date().toISOString(),note:"只检查首页 DOM 中的表单、搜索控件、搜索链接和脚本引用，不执行页面 JavaScript、不登录、不读取小说正文。",counts,results:sanitize(results)};
 const out=path.join(ROOT,"reports/candidate-noform-search-inspection.json");fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2)+"\n");
 console.log(JSON.stringify(counts,null,2));
})().catch(e=>{console.error(e);process.exit(1);});
