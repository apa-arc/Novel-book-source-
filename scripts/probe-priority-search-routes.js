#!/usr/bin/env node
"use strict";
const fs=require("node:fs");
const path=require("node:path");
const ROOT=path.resolve(__dirname,"..");
const queue=JSON.parse(fs.readFileSync(path.join(ROOT,"development/priority-scan-queue.json"),"utf8"));
const keywords=["斗罗大陆","斗破苍穹"];
const headers={"user-agent":"Mozilla/5.0 (compatible; NovelSourceRouteProbe/1.0)","accept":"text/html,application/xhtml+xml,application/json"};
function decode(s){return String(s||"").replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/&#39;/g,"'");}
function extractTitle(body){return decode(body.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]||"").replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim().slice(0,160);}
function extractLinks(body,base){
 const out=[];
 for(const m of body.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)){
  const title=decode(m[2].replace(/<[^>]+>/g," ")).replace(/\s+/g," ").trim();
  if(!title)continue;
  try{const u=new URL(decode(m[1]),base);if(u.protocol==="https:")out.push({title:title.slice(0,90),host:u.hostname});}catch{}
  if(out.length>=8)break;
 }
 return out;
}
async function probe(candidate,keyword,route){
 const url=new URL(route.replaceAll("{keyword}",encodeURIComponent(keyword)),candidate.baseUrl);
 const started=Date.now();
 try{
  const res=await fetch(url,{headers,signal:AbortSignal.timeout(12000),redirect:"manual"});
  const location=res.headers.get("location");
  if(res.status>=300&&res.status<400){
   let redirectHost=null,redirectPath=null;
   try{const target=new URL(location,url);redirectHost=target.hostname;redirectPath=target.pathname+target.search;
    if(redirectHost===url.hostname){
     const followed=await fetch(target,{headers,signal:AbortSignal.timeout(12000),redirect:"manual"});
     const type=followed.headers.get("content-type")||"";
     const body=(await followed.text()).slice(0,1500000);
     const hasKeyword=body.includes(keyword)||body.includes(encodeURIComponent(keyword));
     return {keyword,path:route,status:res.status,redirectHost,redirectPath,followedStatus:followed.status,contentType:type,title:extractTitle(body),hasKeyword,links:extractLinks(body,target.href),classification:!followed.ok?"redirect-target-http-error":hasKeyword?"redirect-target-search-hit":"redirect-target-no-keyword-hit",elapsedMs:Date.now()-started};
    }
   }catch{}
   return {keyword,path:route,status:res.status,redirectHost,redirectPath,classification:redirectHost&&redirectHost!==url.hostname?"cross-domain-redirect":"redirect",elapsedMs:Date.now()-started};
  }
  const type=res.headers.get("content-type")||"";
  const body=(await res.text()).slice(0,1500000);
  const hasKeyword=body.includes(keyword)||body.includes(encodeURIComponent(keyword));
  const links=extractLinks(body,url.href);
  return {keyword,path:route,status:res.status,contentType:type,title:extractTitle(body),hasKeyword,links,classification:!res.ok?"http-error":hasKeyword?"search-response-keyword-hit":"http-success-no-keyword-hit",elapsedMs:Date.now()-started};
 }catch(error){return {keyword,path:route,classification:"request-error",error:String(error).slice(0,160),elapsedMs:Date.now()-started};}
}
async function mapLimit(items,limit,fn){const out=new Array(items.length);let next=0;await Promise.all(Array.from({length:Math.min(limit,items.length)},async()=>{while(true){const i=next++;if(i>=items.length)return;out[i]=await fn(items[i]);}}));return out;}
(async()=>{
 const tasks=[];
 for(const c of queue.candidates)for(const keyword of keywords)for(const route of c.searchPaths)tasks.push({candidate:c,keyword,route});
 const results=await mapLimit(tasks,6,x=>probe(x.candidate,x.keyword,x.route).then(r=>({id:x.candidate.id,name:x.candidate.name,baseUrl:x.candidate.baseUrl,...r})));
 const counts={total:results.length};for(const r of results)counts[r.classification]=(counts[r.classification]||0)+1;
 const report={schemaVersion:1,generatedAt:new Date().toISOString(),keywords,candidateCount:queue.candidates.length,note:"仅探测已发现的公开 GET 搜索路由；不执行站点 JavaScript、不登录、不绕过访问控制、不读取或保存小说正文。搜索入口响应不等于 App 兼容或可正式导入。",counts,results};
 const out=path.join(ROOT,"reports/priority-search-route-probe.json");fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2)+"\n");
 console.log(JSON.stringify(counts,null,2));
})().catch(error=>{console.error(error);process.exit(1);});
