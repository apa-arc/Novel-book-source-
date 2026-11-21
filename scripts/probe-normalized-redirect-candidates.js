#!/usr/bin/env node
"use strict";
const fs=require("node:fs"),path=require("node:path");
const {parseHTML}=require("linkedom");
const ROOT=path.resolve(__dirname,"..");
const list=JSON.parse(fs.readFileSync(path.join(ROOT,"reports/redirect-normalized-candidates.json"),"utf8"));
const headers={"user-agent":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36","accept":"text/html,application/xhtml+xml"};
function norm(v,n=900){return String(v||"").trim().replace(/\s+/g," ").slice(0,n);}
function charsetOk(ct){const m=String(ct||"").match(/charset\s*=\s*["']?([^;"'\s]+)/i);return !m||/^(utf-8|utf8)$/i.test(m[1]);}
async function get(url){const r=await fetch(url,{headers,signal:AbortSignal.timeout(10000),redirect:"error"});return {status:r.status,url:r.url,contentType:r.headers.get("content-type")||"",html:await r.text()};}
async function inspect(source){
 const started=Date.now();
 try{
  const home=await get(source.baseUrl),doc=parseHTML(home.html).document;
  const forms=[...doc.querySelectorAll("form")].map(f=>({action:f.getAttribute("action")||"",method:(f.getAttribute("method")||"GET").toUpperCase(),inputs:[...f.querySelectorAll("input,button,select")].map(e=>({type:e.getAttribute("type")||"",name:e.getAttribute("name")||"",value:e.getAttribute("value")||"",placeholder:e.getAttribute("placeholder")||""}))}));
  const inputs=[...doc.querySelectorAll("input")].map(e=>({type:e.getAttribute("type")||"",name:e.getAttribute("name")||"",placeholder:e.getAttribute("placeholder")||"",onclick:e.getAttribute("onclick")||""}));
  const searchAnchors=[...doc.querySelectorAll("a[href]")].map(a=>({text:norm(a.textContent,100),href:a.getAttribute("href")||""})).filter(a=>/搜索|search|搜书/i.test(a.text+" "+a.href)).slice(0,20);
  const form=forms.find(f=>f.inputs.some(i=>["text","search"].includes(i.type)));
  let search=null;
  if(form&&form.method==="GET"){
   const u=new URL(form.action||source.baseUrl,home.url);
   for(const i of form.inputs)if(i.name)u.searchParams.set(i.name,["text","search"].includes(i.type)?"斗罗大陆":i.value);
   try{
    const result=await get(u.href),sd=parseHTML(result.html).document;
    const links=[...sd.querySelectorAll("a[href]")].map(a=>({text:norm(a.textContent,100),href:a.getAttribute("href")||""})).filter(a=>a.text&&a.href).slice(0,35);
    const body=norm(sd.body?.textContent,1400);
    search={method:"GET",url:u.href,status:result.status,contentType:result.contentType,charsetOk:charsetOk(result.contentType),body,links,containsKeyword:body.includes("斗罗大陆")};
   }catch(error){search={method:"GET",url:u.href,error:String(error).slice(0,180)};}
  }else if(form){search={method:form.method,compatible:false};}
  return {host:source.host,baseUrl:source.baseUrl,names:source.names,homeStatus:home.status,homeContentType:home.contentType,forms,inputs,searchAnchors,search,classification:search?.method==="GET"&&search.status===200&&search.charsetOk?"GET-search-needs-functional-check":form?.method==="POST"?"POST-search-incompatible":search?"search-error":"manual-search-required",elapsedMs:Date.now()-started};
 }catch(error){return {host:source.host,baseUrl:source.baseUrl,names:source.names,error:String(error).slice(0,180),classification:"unreachable-after-normalization",elapsedMs:Date.now()-started};}
}
async function mapLimit(items,limit,fn){const out=new Array(items.length);let next=0;await Promise.all(Array.from({length:Math.min(limit,items.length)},async()=>{while(true){const i=next++;if(i>=items.length)return;out[i]=await fn(items[i]);}}));return out;}
(async()=>{
 const results=await mapLimit(list.results||[],6,inspect),counts={total:results.length};
 for(const x of results)counts[x.classification]=(counts[x.classification]||0)+1;
 const report={schemaVersion:1,generatedAt:new Date().toISOString(),note:"已将旧域名首页重定向到的最终 HTTPS 主机作为新 baseUrl 检查；只测试首页和 GET 搜索表单，不代表详情、目录、正文已通过。",counts,results};
 const out=path.join(ROOT,"reports/redirect-normalized-search-probe.json");fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2)+"\n");
 console.log(JSON.stringify(counts,null,2));
})().catch(e=>{console.error(e);process.exit(1);});
