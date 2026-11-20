#!/usr/bin/env node
"use strict";
const fs=require("node:fs");
const path=require("node:path");
const {URL}=require("node:url");
const ROOT=path.join(__dirname,"..");
const inputs=[
 ["AOAOSTAR",path.join(ROOT,"imports/aoaostar/raw/aoaostar-full.json")],
 ["luanmuc",path.join(ROOT,"imports/secondary/luanmuc-scan-report.json")]
];
const NON_NOVEL=/漫画|動漫|动漫|有声|听书|古籍|国学|诗词|詞典|词典|百科|维基|公版|杂志|影视|短剧|网盘|音乐|播客/i;
const CONCURRENCY=12, TIMEOUT=12000;
function arr(v){return Array.isArray(v)?v:(v?[v]:[])}
function normalize(v){try{const u=new URL(v);if(!/^https?:$/.test(u.protocol))return null;u.hash="";return u}catch{return null}}
function isAdult(s){return /🔞|成人|色情|情色|R18|18\+/i.test([s.bookSourceName,s.bookSourceGroup,s.bookSourceComment,s.bookSourceUrl].join(" "))}
function collect(){
 const map=new Map();
 for(const [provider,file] of inputs){
  const data=JSON.parse(fs.readFileSync(file,"utf8"));
  const rows=provider==="luanmuc"?arr(data.sources).map(x=>({bookSourceUrl:x.url,bookSourceName:x.name,bookSourceGroup:x.group,bookSourceComment:"",provider,duplicateAgainstAoaostar:x.duplicateAgainstAoaostar})):arr(data).map(x=>({...x,provider}));
  for(const s of rows){
   if(!s||!s.bookSourceUrl||NON_NOVEL.test([s.bookSourceName,s.bookSourceGroup,s.bookSourceComment].join(" ")))continue;
   const u=normalize(s.bookSourceUrl);if(!u)continue;
   const host=u.hostname.toLowerCase();
   if(!map.has(host))map.set(host,{host,url:u.origin,name:String(s.bookSourceName||""),provider:s.provider||provider,adult:isAdult(s),sourceRecords:0,examples:[]});
   const x=map.get(host);x.sourceRecords++;if(!x.examples.includes(u.href)&&x.examples.length<3)x.examples.push(u.href);x.adult=x.adult||isAdult(s);
  }
 }
 return [...map.values()];
}
async function probe(item){
 const started=Date.now();const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),TIMEOUT);
 try{
  const r=await fetch(item.url,{redirect:"follow",signal:controller.signal,headers:{"user-agent":"NovelSourceHealthCheck/1.0 (metadata-only connectivity probe)","accept":"text/html,application/xhtml+xml,*/*"}});
  const body=(await r.text()).slice(0,50000);
  const title=(body.match(/<title[^>]*>([\s\S]*?)<\/title>/i)||[])[1]||"";
  const challenge=/验证码|captcha|访问验证|安全验证|人机验证|cloudflare|just a moment|access denied/i.test(body);
  const html=/<!doctype html|<html|<title/i.test(body);
  return {...item,status:r.status,ok:r.ok,finalUrl:r.url,redirected:r.redirected,contentType:r.headers.get("content-type")||"",html,title:title.replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim().slice(0,160),challenge,bodyBytes:Buffer.byteLength(body),latencyMs:Date.now()-started,connectivity:r.ok&&!challenge&&html?"reachable":"review"};
 }catch(e){return {...item,status:null,ok:false,error:e.name==="AbortError"?"timeout":String(e.message||e).slice(0,180),latencyMs:Date.now()-started,connectivity:"unreachable"}}
 finally{clearTimeout(timer)}
}
async function main(){
 const all=collect(),results=new Array(all.length);let next=0,done=0;
 async function worker(){while(true){const i=next++;if(i>=all.length)return;results[i]=await probe(all[i]);done++;if(done%50===0)console.log("probed",done,"/",all.length)}}
 await Promise.all(Array.from({length:CONCURRENCY},worker));
 const counts={hosts:results.length,reachable:0,review:0,unreachable:0,adultHosts:0,ordinaryHosts:0};
 for(const r of results){counts[r.connectivity]++;if(r.adult)counts.adultHosts++;else counts.ordinaryHosts++}
 const report={schemaVersion:1,generatedAt:new Date().toISOString(),test:"live HTTP(S) origin connectivity only; not a four-stage novel search/detail/TOC/content functional test",policy:"No login, CAPTCHA, paywall, or access control bypass. No rule JavaScript executed. Host reachability alone never qualifies a source for production subscription.",counts,results};
 const out=path.join(ROOT,"reports/live-host-probe.json");fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2)+"\n");
 console.log(JSON.stringify({counts,report:out},null,2));
}
main().catch(e=>{console.error(e);process.exit(1)});
