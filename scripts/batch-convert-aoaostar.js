#!/usr/bin/env node
"use strict";
// Build a sanitized compatibility report for every source in the AOAOSTAR full snapshot.
// Fetches public upstream JSON in memory; never stores raw source definitions or credentials.
const fs=require("node:fs");
const path=require("node:path");
const {convertSource}=require("./convert-legado-rules");
const root=path.resolve(__dirname,"..");
const catalog=JSON.parse(fs.readFileSync(path.join(root,"imports/aoaostar/catalog.json"),"utf8"));
const MAX_BYTES=50*1024*1024;
async function fetchCollection(item){
  const u=new URL(item.url);
  if(u.protocol!=="https:"||u.hostname!=="raw.githubusercontent.com"||u.pathname.split("/").slice(1,3).join("/")!=="aoaostar/legado") throw new Error("Upstream URL rejected");
  const response=await fetch(u,{signal:AbortSignal.timeout(45000)});
  if(!response.ok) throw new Error("HTTP "+response.status);
  const declared=Number(response.headers.get("content-length")||0);
  if(declared>MAX_BYTES) throw new Error("Collection exceeds size limit");
  const body=await response.text();
  if(Buffer.byteLength(body,"utf8")>MAX_BYTES) throw new Error("Collection exceeds size limit");
  const parsed=JSON.parse(body);
  const arr=Array.isArray(parsed)?parsed:[parsed];
  if(!arr.length||arr.some(x=>!x||typeof x!=="object"||Array.isArray(x))) throw new Error("Invalid source collection");
  return arr;
}
function sanitizeRuleShape(value){
 let text=String(value||"").slice(0,240);
 text=text.replace(/https?:\/\/[^\s"'<>]+/gi,"<URL>");
 text=text.replace(/([?&][^=\s]+)=([^&\s]+)/g,"$1=<value>");
 text=text.replace(/(cookie|authorization|token|password|secret)(\s*[:=]\s*)[^&\s"'<>]+/gi,"$1$2<redacted>");
 text=text.replace(/(\[[^\]=~^$*|]+\s*(?:[~|^$*]?=\s*))("[^"]*"|'[^']*'|[^\]]+)/g,'$1"<value>"');
 text=text.replace(/(["'])[^\r\n"'<>]{1,100}\1/g,'" <quoted> "');
 return text.replace(/\s+/g," ").trim();
}
async function main(){
 const byCollection=new Map();
 const failures=[];
 for(const item of catalog.collections.filter(x=>x.id==="b778fe6b")){
  try{byCollection.set(item.id,await fetchCollection(item));console.log("Fetched "+item.id);}
  catch(e){failures.push({collectionId:item.id,error:e.message});}
 }
 const rows=[];
 const attributeShapes=new Map();
 const diagnosticShapes=new Map();
 const diagnosticReasons=new Set(["unsupported-jsonpath","unsupported-xpath","unsupported-regex-transform","unsupported-regex-mode","unsupported-selector-step","unsupported-fallback-part","unsupported-concat-part","unsupported-compound-expression","invalid-selector-index"]);
 const rawGroupKeys={search:"ruleSearch",bookInfo:"ruleBookInfo",toc:"ruleToc",content:"ruleContent",explore:"ruleExplore"};
 const fullSources=byCollection.get("b778fe6b")||[];
 if(!fullSources.length) throw new Error("AOAOSTAR full collection unavailable");
 for(let index=0;index<fullSources.length;index++){
  const source=fullSources[index];
  const candidate={id:"aoaostar-full-"+(index+1),collectionId:"b778fe6b",index:index+1,name:String(source.bookSourceName||source.name||("未命名源 "+(index+1))).slice(0,100)};
  let converted;
  try{converted=convertSource(source,index);}
  catch(error){
   rows.push({id:candidate.id,collectionId:candidate.collectionId,index:candidate.index,name:candidate.name,status:"manual",reason:"conversion-exception:"+String(error.message||error).slice(0,120)});
   continue;
  }
  for(const [groupName,group] of Object.entries(converted.groups)){
    const rawGroup=source[rawGroupKeys[groupName]]||{};
    for(const [field,parsed] of Object.entries(group.fields||{})){
      if(typeof rawGroup[field]==="string"&&parsed.reason){
        const shape=sanitizeRuleShape(rawGroup[field]);
        if(parsed.reason==="unsupported-attribute-filter") attributeShapes.set(shape,(attributeShapes.get(shape)||0)+1);
        if(diagnosticReasons.has(parsed.reason)){
          if(!diagnosticShapes.has(parsed.reason)) diagnosticShapes.set(parsed.reason,new Map());
          const shapes=diagnosticShapes.get(parsed.reason);
          shapes.set(shape,(shapes.get(shape)||0)+1);
        }
      }
    }
  }
  const groups={};
  for(const [name,g] of Object.entries(converted.groups)){
    groups[name]={status:g.status,fields:Object.fromEntries(Object.entries(g.fields||{}).map(([field,v])=>[field,{status:v.status,reason:v.reason||null,selector:v.selector||null,outputKind:v.outputKind||null,selectorKind:v.selectorKind||null}]))};
  }
  rows.push({id:candidate.id,collectionId:candidate.collectionId,index:candidate.index,name:candidate.name,baseUrl:converted.baseUrl,status:converted.conversionStatus,warnings:converted.warnings||[],groups});
 }
 const counts={candidate:0,partial:0,manual:0,unavailable:0};
 for(const row of rows) counts[row.status]=(counts[row.status]||0)+1;
 const generatedAt=new Date().toISOString();
 const report={schemaVersion:2,generatedAt,provider:"AOAOSTAR / Legado",sourceCount:rows.length,counts,fetchFailures:failures,diagnostics:{unsupportedAttributeFilterTotal:[...attributeShapes.values()].reduce((a,b)=>a+b,0),unsupportedAttributeShapes:[...attributeShapes.entries()].sort((a,b)=>b[1]-a[1]).slice(0,100).map(([shape,count])=>({shape,count})),unsupportedRuleShapes:[...diagnosticShapes.entries()].map(([reason,shapes])=>({reason,total:[...shapes.values()].reduce((a,b)=>a+b,0),shapes:[...shapes.entries()].sort((a,b)=>b[1]-a[1]).slice(0,50).map(([shape,count])=>({shape,count}))}))},note:"Sanitized selector compatibility report only. Attribute selector diagnostics are redacted shapes; not runnable adapters, not a license determination, and not a live availability test. Raw source definitions, headers, cookies, tokens and credentials are not stored.",sources:rows};
 const out=path.join(root,"reports","aoaostar-conversion-review.json");
 fs.mkdirSync(path.dirname(out),{recursive:true});
 fs.writeFileSync(out,JSON.stringify(report,null,2)+"\n","utf8");
 // Durable public progress file: metadata and aggregate diagnostics only; no selector expressions.
 const summarySources=rows.map(row=>{
   const groups={};
   for(const [name,g] of Object.entries(row.groups||{})){
     const fields=Object.values(g.fields||{});
     const reasons={};
     for(const field of fields) if(field.reason) reasons[field.reason]=(reasons[field.reason]||0)+1;
     groups[name]={status:g.status,fieldCount:fields.length,manualReasons:reasons};
   }
   return {
     id:row.id,collectionId:row.collectionId,index:row.index,name:row.name,
     baseUrl:row.baseUrl||null,conversionStatus:row.status,
     warningCodes:row.warnings||[],groups,
     redistributionStatus:"not-assessed",
     runtimeStatus:"not-a-runnable-adapter"
   };
 });
 const summary={
   schemaVersion:1,generatedAt,provider:"AOAOSTAR / Legado",
   sourceCount:rows.length,counts,fetchFailureCount:failures.length,
   note:"Metadata-only conversion progress. Selector expressions, original rules, scripts, headers, cookies, tokens and credentials are excluded. 'candidate' means static selector parsing only, not a runnable adapter, authorization approval, or live site test.",
   sources:summarySources
 };
 const summaryPath=path.join(root,"imports","aoaostar","conversion-status.json");
 fs.writeFileSync(summaryPath,JSON.stringify(summary,null,2)+"\n","utf8");
 console.log(JSON.stringify({sourceCount:rows.length,counts,fetchFailures:failures.length,output:out,summary:summaryPath},null,2));
 if(failures.length) process.exitCode=1;
}
main().catch(e=>{console.error(e);process.exitCode=1;});

// Expansion target: 300 ordinary, app-compatible sources; never auto-promote candidates.
