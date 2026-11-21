#!/usr/bin/env node
"use strict";
const fs=require("node:fs");
const path=require("node:path");
const ROOT=path.resolve(__dirname,"..");
const input=path.join(ROOT,"imports/third-party/multi-repo-candidate-catalog.json");
const output=path.join(ROOT,"reports/candidate-homepage-probe.json");
const catalog=JSON.parse(fs.readFileSync(input,"utf8"));
const rows=catalog.sources||[]; // Re-probe after each curated catalogue refresh.
async function probe(source){
 const started=Date.now();
 try{
  const response=await fetch(source.baseUrl,{method:"GET",redirect:"follow",signal:AbortSignal.timeout(10000),headers:{"user-agent":"Mozilla/5.0 (compatible; NovelSourceAvailabilityProbe/1.0)","accept":"text/html,application/xhtml+xml"}});
  const final=new URL(response.url);
  const contentType=response.headers.get("content-type")||"";
  try{await response.body?.cancel();}catch{}
  return {id:source.id,name:source.name,host:source.host,status:response.status,finalHost:final.hostname.toLowerCase(),https:final.protocol==="https:",html:/text\/html|application\/xhtml\+xml/i.test(contentType),contentType:contentType.slice(0,100),elapsedMs:Date.now()-started,classification:response.status>=200&&response.status<300&&final.protocol==="https:"&&/text\/html|application\/xhtml\+xml/i.test(contentType)?"homepage-reachable":response.status===403||response.status===429||response.status===503?"blocked-or-rate-limited":"needs-review"};
 }catch(error){return {id:source.id,name:source.name,host:source.host,status:null,elapsedMs:Date.now()-started,classification:"unreachable-or-timeout",error:String(error).slice(0,180)};}
}
async function mapLimit(items,limit,fn){const out=new Array(items.length);let next=0;await Promise.all(Array.from({length:Math.min(limit,items.length)},async()=>{while(true){const i=next++;if(i>=items.length)return;out[i]=await fn(items[i]);}}));return out;}
(async()=>{
 const results=await mapLimit(rows,12,probe);
 const counts={total:results.length};for(const r of results)counts[r.classification]=(counts[r.classification]||0)+1;
 const report={schemaVersion:1,generatedAt:new Date().toISOString(),sourceCatalog:"imports/third-party/multi-repo-candidate-catalog.json",note:"仅检测 HTTPS 站点首页 HTTP 状态和内容类型；不执行页面脚本，不读取/保存小说正文，不代表 App 搜索、详情、目录或正文已通过。",counts,results};
 fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2)+"\n");
 console.log(JSON.stringify(counts,null,2));
})().catch(e=>{console.error(e);process.exit(1);});
