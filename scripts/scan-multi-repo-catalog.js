#!/usr/bin/env node
"use strict";
// Metadata-only discovery. Never executes or copies upstream source rules.
const fs=require("node:fs");
const path=require("node:path");
const crypto=require("node:crypto");
const ROOT=path.resolve(__dirname,"..");
const INPUTS=[
 {id:"scaryburial-main-1944",url:"https://raw.githubusercontent.com/scaryburial/legado-book-sources/master/main/Main-BookSources-1944.json",repo:"scaryburial/legado-book-sources",license:"not-declared"},
 {id:"huanqingsha-main",url:"https://raw.githubusercontent.com/huanqingsha/legado-book-sources/main/legado-book-sources.json",repo:"huanqingsha/legado-book-sources",license:"not-declared"},
 {id:"jiwangyihao-source-j",url:"https://raw.githubusercontent.com/jiwangyihao/source-j-legado/main/bilinovel.json",repo:"jiwangyihao/source-j-legado",license:"MPL-2.0"}
];
const ADULT=/🔞|成人|色情|情色|R18|18\+|18禁|PO18|肉文|淫秽|色情小说|海棠|御宅屋|肉肉屋|脸红心跳|第一版主|日居月诸|UAA|Hentai|Erotic|绅士/i;
const NON_NOVEL=/漫画|動漫|动漫|有声|听书|古籍|国学|诗词|詞典|词典|百科|维基|公版|杂志|影视|短剧|网盘|音乐|播客|英文|英语|English|日语|Japanese|原版小说|RSS|视频|音频/i;
const SCRIPT=/@js:|<js>|\bjavascript\b|\bfunction\b|\breturn\b|\$\{|java\.net|org\.jsoup|Packages\./i;
const PAYWALL=/💰|🏷|VIP|付费|会员|需登录|须登陆|需要登录|正版|搜书专用/i;
function canonical(v){if(Array.isArray(v))return "["+v.map(canonical).join(",")+"]";if(v&&typeof v==="object")return "{"+Object.keys(v).sort().map(k=>JSON.stringify(k)+":"+canonical(v[k])).join(",")+"}";return JSON.stringify(v);}
function walk(v,fn){if(typeof v==="string")fn(v);else if(Array.isArray(v))v.forEach(x=>walk(x,fn));else if(v&&typeof v==="object")Object.values(v).forEach(x=>walk(x,fn));}
function hostOf(value){try{const u=new URL(value);if(u.protocol!=="https:"||u.username||u.password)return null;return u.hostname.toLowerCase();}catch{return null;}}
function getBase(value){try{const u=new URL(value);u.pathname="/";u.search="";u.hash="";return u.origin+"/";}catch{return null;}}
async function main(){
 const own=JSON.parse(fs.readFileSync(path.join(ROOT,"subscription.json"),"utf8"));
 const ownHosts=new Set((own.sources||[]).flatMap(s=>s.domains||[]).map(x=>x.toLowerCase()));
 const byHost=new Map();const stats={};
 for(const input of INPUTS){
  const res=await fetch(input.url,{signal:AbortSignal.timeout(90000),headers:{"user-agent":"NovelSourceMetadataScanner/1.0"}});
  if(!res.ok)throw new Error(input.id+" HTTP "+res.status);
  const raw=await res.text();if(Buffer.byteLength(raw)>40*1024*1024)throw new Error(input.id+" exceeds 40MB");
  const parsed=JSON.parse(raw);const arr=Array.isArray(parsed)?parsed:[parsed];
  const st=stats[input.id]={records:arr.length,adult:0,nonNovel:0,paywall:0,nonHttps:0,loginOrCookie:0,script:0,duplicate:0,accepted:0};
  for(const s of arr){
   if(!s||typeof s!=="object"||Array.isArray(s))continue;
   const name=String(s.bookSourceName||"").trim();const group=String(s.bookSourceGroup||"");
   const comment=String(s.bookSourceComment||"");
   const label=[name,group,comment].join(" ");
   if(ADULT.test(label)){st.adult++;continue;}
   if(NON_NOVEL.test(label)){st.nonNovel++;continue;}
   if(PAYWALL.test(label)){st.paywall++;continue;}
   const baseUrl=getBase(s.bookSourceUrl);const host=hostOf(baseUrl||"");
   if(!host){st.nonHttps++;continue;}
   if(ownHosts.has(host)||byHost.has(host)){st.duplicate++;continue;}
   const login=Boolean(s.loginUrl||s.loginUi||s.loginCheckJs||s.enabledCookieJar);
   const cookie=Boolean(s.header&&Object.keys(s.header).some(k=>/cookie|authorization|token|password|api[-_]?key/i.test(k)));
   if(login||cookie){st.loginOrCookie++;continue;}
   const rules=["ruleSearch","ruleBookInfo","ruleToc","ruleContent"];
   if(!rules.every(k=>s[k]&&typeof s[k]==="object"&&!Array.isArray(s[k])&&Object.keys(s[k]).length))continue;
   let hasScript=false;for(const k of rules)walk(s[k],v=>{if(SCRIPT.test(v))hasScript=true;});
   if(hasScript){st.script++;continue;}
   const id=crypto.createHash("sha256").update(host).digest("hex").slice(0,16);
   byHost.set(host,{id,name,baseUrl,host,group:group||"未分类",upstream:input.repo,upstreamFile:input.url,upstreamLicense:input.license,ruleClass:"static-no-script-no-login",redistributionStatus:"not-assessed",runtimeStatus:"not-converted"});
   st.accepted++;
  }
  console.log(input.id,JSON.stringify(st));
 }
 const sources=[...byHost.values()].sort((a,b)=>a.name.localeCompare(b.name,"zh-Hans"));
 const out={schemaVersion:1,generatedAt:new Date().toISOString(),provider:"multi-repository metadata-only discovery",notice:"仅保留书源名称、HTTPS站点地址和分组元数据；不复制规则、请求头、Cookie、凭据或小说正文。静态规则候选不是 App 可用源；必须独立适配并通过搜索、详情、目录、正文测试。成人/绅士/付费/非小说/脚本/登录态来源已排除。",upstreams:INPUTS,stats,sourceCount:sources.length,sources};
 const dest=path.join(ROOT,"imports/third-party/multi-repo-candidate-catalog.json");fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,JSON.stringify(out,null,2)+"\n");
 console.log("TOTAL",sources.length,"REPORT",dest);
}
main().catch(e=>{console.error(e);process.exit(1);});
