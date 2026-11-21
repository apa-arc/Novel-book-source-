#!/usr/bin/env node
"use strict";
// Build a sanitized compatibility report for queued candidates.
// Fetches public upstream JSON in memory; never stores raw source definitions or credentials.
const fs=require("node:fs");
const path=require("node:path");
const {convertSource}=require("./convert-legado-rules");
const root=path.resolve(__dirname,"..");
const catalog=JSON.parse(fs.readFileSync(path.join(root,"imports/aoaostar/catalog.json"),"utf8"));
const queue=JSON.parse(fs.readFileSync(path.join(root,"imports/aoaostar/candidate-review.json"),"utf8"));
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
 for(const item of catalog.collections){
  try{byCollection.set(item.id,await fetchCollection(item));console.log("Fetched "+item.id);}
  catch(e){failures.push({collectionId:item.id,error:e.message});}
 }
 const rows=[];
 const attributeShapes=new Map();
 const rawGroupKeys={search:"ruleSearch",bookInfo:"ruleBookInfo",toc:"ruleToc",content:"ruleContent",explore:"ruleExplore"};
 for(const candidate of queue.sources){
  const arr=byCollection.get(candidate.collectionId);
  if(!arr||!arr[candidate.index-1]){rows.push({id:candidate.id,collectionId:candidate.collectionId,index:candidate.index,name:candidate.name,status:"unavailable",reason:"upstream-collection-fetch-failed-or-index-missing"});continue;}
  const source=arr[candidate.index-1];
  const converted=convertSource(source,candidate.index-1);
  for(const [groupName,group] of Object.entries(converted.groups)){
    const rawGroup=source[rawGroupKeys[groupName]]||{};
    for(const [field,parsed] of Object.entries(group.fields||{})){
      if(parsed.reason==="unsupported-attribute-filter"&&typeof rawGroup[field]==="string"){
        const shape=sanitizeRuleShape(rawGroup[field]);
        attributeShapes.set(shape,(attributeShapes.get(shape)||0)+1);
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
 const report={schemaVersion:2,generatedAt,provider:"AOAOSTAR / Legado",sourceCount:rows.length,counts,fetchFailures:failures,diagnostics:{unsupportedAttributeFilterTotal:[...attributeShapes.values()].reduce((a,b)=>a+b,0),unsupportedAttributeShapes:[...attributeShapes.entries()].sort((a,b)=>b[1]-a[1]).slice(0,100).map(([shape,count])=>({shape,count}))},note:"Sanitized selector compatibility report only. Attribute selector diagnostics are redacted shapes; not runnable adapters, not a license determination, and not a live availability test. Raw source definitions, headers, cookies, tokens and credentials are not stored.",sources:rows};
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
