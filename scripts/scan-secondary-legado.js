#!/usr/bin/env node
"use strict";
const fs=require("node:fs");
const path=require("node:path");
const crypto=require("node:crypto");
const UPSTREAM="https://raw.githubusercontent.com/luanmuc/legado-book-sources/main/books.json";
const MAX=30*1024*1024;
const REQUIRED=["ruleSearch","ruleBookInfo","ruleToc","ruleContent"];
const NON_NOVEL=/漫画|動漫|动漫|有声|听书|古籍|国学|诗词|詞典|词典|百科|维基|公版|杂志|影视|短剧|网盘|音乐|播客/i;
const SCRIPT=/@js:|<js>|\bjavascript\b|\bfunction\b|\breturn\b|\$\{/i;
const URLCtor=globalThis.URL;
function canonical(v){if(Array.isArray(v))return "["+v.map(canonical).join(",")+"]";if(v&&typeof v==="object")return "{"+Object.keys(v).sort().map(k=>JSON.stringify(k)+":"+canonical(v[k])).join(",")+"}";return JSON.stringify(v);}
function normUrl(v){try{const u=new URLCtor(v);u.hash="";u.hostname=u.hostname.toLowerCase().replace(/^www\./,"");u.pathname=u.pathname.replace(/\/+$/,"")||"/";return u.toString();}catch{return null;}}
function walkScript(v){if(typeof v==="string")return SCRIPT.test(v);if(Array.isArray(v))return v.some(walkScript);if(v&&typeof v==="object")return Object.values(v).some(walkScript);return false;}
async function main(){
 const res=await fetch(UPSTREAM,{signal:AbortSignal.timeout(60000)});
 if(!res.ok)throw new Error("upstream HTTP "+res.status);
 const bytes=Buffer.from(await res.arrayBuffer());if(bytes.length>MAX)throw new Error("upstream file exceeds size limit");
 const parsed=JSON.parse(bytes.toString("utf8"));const arr=Array.isArray(parsed)?parsed:[parsed];
 const ownPath=path.join(__dirname,"../imports/aoaostar/raw/aoaostar-full.json");
 const own=JSON.parse(fs.readFileSync(ownPath,"utf8"));const ownArr=Array.isArray(own)?own:[own];
 const ownUrls=new Set(ownArr.map(x=>normUrl(x&&x.bookSourceUrl)).filter(Boolean));
 const seen=new Set(),rows=[];
 const stats={upstreamRecords:arr.length,duplicateWithinCollection:0,duplicateAgainstAoaostar:0,nonNovel:0,incompleteRules:0,ordinary:0,adult:0,staticRuleCandidates:0,scriptOrLoginReview:0};
 for(const s of arr){
  if(!s||typeof s!=="object"||Array.isArray(s))continue;
  const fp=crypto.createHash("sha256").update(canonical(s)).digest("hex");
  if(seen.has(fp)){stats.duplicateWithinCollection++;continue;}seen.add(fp);
  const name=String(s.bookSourceName||"(未命名)"),group=String(s.bookSourceGroup||"");
  const url=normUrl(s.bookSourceUrl);
  const label=[name,group,String(s.bookSourceComment||""),String(s.bookSourceUrl||"")].join(" ");
  if(NON_NOVEL.test(label)){stats.nonNovel++;continue;}
  if(!REQUIRED.every(k=>s[k]&&typeof s[k]==="object"&&!Array.isArray(s[k])&&Object.keys(s[k]).length)){stats.incompleteRules++;continue;}
  const adult=/🔞|成人|色情|情色|R18|18\+/i.test(label);
  if(adult)stats.adult++;else stats.ordinary++;
  const login=Boolean(s.loginUrl||s.loginUi||s.loginCheckJs||s.enabledCookieJar);
  const cookie=Boolean(s.header&&Object.keys(s.header).some(k=>/cookie|authorization|token|password|api[-_]?key/i.test(k)));
  const script=REQUIRED.some(k=>walkScript(s[k]));
  const duplicate=Boolean(url&&ownUrls.has(url));
  if(duplicate)stats.duplicateAgainstAoaostar++;
  if(login||cookie||script)stats.scriptOrLoginReview++;
  else stats.staticRuleCandidates++;
  rows.push({name,url,group,adult,duplicateAgainstAoaostar:duplicate,reviewClass:(login||cookie||script)?"manual-review":"static-syntax-candidate",flags:{login,cookie,script}});
 }
 const out={schemaVersion:1,provider:"luanmuc/legado-book-sources",upstreamUrl:"https://github.com/luanmuc/legado-book-sources",upstreamLicense:"MIT (repository-level declaration; site-rule provenance still needs review)",upstreamFile:"books.json",upstreamSha256:crypto.createHash("sha256").update(bytes).digest("hex"),generatedAt:new Date().toISOString(),notice:"Metadata-only static scan. No source expressions, request headers, cookies, credentials, or novel content are copied. Static-syntax-candidate is not a live test, authorization approval, or runnable adapter.",stats,sources:rows};
 const dest=path.join(__dirname,"../imports/secondary/luanmuc-scan-report.json");fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,JSON.stringify(out,null,2)+"\n");
 console.log(JSON.stringify({stats,report:dest,upstreamBytes:bytes.length},null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
