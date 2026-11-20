"use strict";
const { scanArticles } = require("../runtime/text-quality");
const CHAPTER_URL = /(?:chapter|chapters|read|book|novel|content|\/(?:\d{1,}|[a-z0-9_-]+\/\d+)(?:[/.?]|$)|第[零〇一二三四五六七八九十百千万\d]+[章节回])/i;
const CHAPTER_TEXT = /(?:第[零〇一二三四五六七八九十百千万\d]+章|正文|阅读|继续阅读|chapter)/i;
const ADULT = /(?:色情|成人|情色|淫|18\+|adult)/i;
function hostAliases(host) {
  const h = host.toLowerCase(), root = /^(www|m|mobile)\./i.test(h) ? h.replace(/^[^.]+\./, "") : h;
  return new Set([h, root, "www."+root, "m."+root]);
}
function normalizeHosts(hosts){return hosts instanceof Set?hosts:hostAliases(String(hosts));}
function allowed(url, hosts) { return url.protocol==="https:" && !url.username && !url.password && normalizeHosts(hosts).has(url.hostname.toLowerCase()); }
function textFromHtml(html) {
 return String(html||"").replace(/<!--[\s\S]*?-->/g," ").replace(/<(script|style|noscript|svg|nav|header|footer|form)[^>]*>[\s\S]*?<\/\1\s*>/gi," ")
 .replace(/<br\s*\/?>|<\/p\s*>|<\/div\s*>|<\/article\s*>|<\/section\s*>/gi,"\n").replace(/<[^>]+>/g," ")
 .replace(/&nbsp;|&#160;/gi," ").replace(/&amp;/gi,"&").replace(/&lt;/gi,"<").replace(/&gt;/gi,">").replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'")
 .replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16)))
 .replace(/[ \t\r]+/g," ").replace(/\n\s*/g,"\n").trim();
}
function titleFromHtml(html){const m=String(html).match(/<title[^>]*>([\s\S]*?)<\/title>/i);return m?textFromHtml(m[1]).slice(0,120):"";}
function extractLinks(html,base,hosts){
 const out=[]; const re=/<a\b([^>]*?)href\s*=\s*["']([^"']+)["']([^>]*)>([\s\S]*?)<\/a\s*>/gi; let m;
 while((m=re.exec(String(html)))&&out.length<4000){try{const u=new URL(m[2],base);const label=textFromHtml(m[4]).slice(0,100);if(allowed(u,hosts)&&CHAPTER_URL.test(u.pathname+" "+label)&&(!label||CHAPTER_TEXT.test(label)||CHAPTER_URL.test(u.pathname)))out.push({url:u.href,label});}catch{}}
 return [...new Map(out.map(x=>[x.url,x])).values()].slice(0,8);
}
function sitemapUrls(xml,base,hosts){const out=[];const re=/<loc>\s*([^<]+?)\s*<\/loc>/gi;let m;while((m=re.exec(xml))&&out.length<2000){try{const u=new URL(m[1].trim(),base);if(allowed(u,hosts)&&CHAPTER_URL.test(u.pathname))out.push(u.href);}catch{}}return [...new Set(out)].slice(0,8);}
function sitemapChildren(xml,base,hosts){const out=[];const re=/<loc>\s*([^<]+?)\s*<\/loc>/gi;let m;while((m=re.exec(xml))&&out.length<100){try{const u=new URL(m[1].trim(),base);if(allowed(u,hosts)&&/sitemap/i.test(u.pathname))out.push(u.href);}catch{}}return [...new Set(out)].slice(0,2);}
function robotsSitemaps(body,base,hosts){const out=[];for(const line of String(body).split(/\r?\n/)){const m=line.match(/^\s*Sitemap:\s*(\S+)/i);if(m){try{const u=new URL(m[1],base);if(allowed(u,hosts))out.push(u.href);}catch{}}}return out;}
async function get(fetchImpl,url,hosts,maxBytes,timeout=10000){
 const u=new URL(url);if(!allowed(u,hosts))throw Error("url-outside-registered-domain");
 const r=await fetchImpl(u.href,{redirect:"follow",signal:AbortSignal.timeout(timeout),headers:{"User-Agent":"NovelSourceQualityScanner/1.1 (public-page sample; no-login)"}});
 const final=new URL(r.url||u.href);if(!allowed(final,hosts))throw Error("redirect-outside-registered-domain");
 if(!r.ok)throw Error("http-"+r.status);
 const type=r.headers?.get?.("content-type")||"";if(type&&!/(text\/html|text\/xml|application\/xml|application\/xhtml|text\/plain)/i.test(type))throw Error("unsupported-content-type");
 const b=Buffer.from(await r.arrayBuffer());if(b.length>maxBytes)throw Error("response-too-large");return b.toString("utf8");
}
async function scanOne(c,fetchImpl){
 let base;try{base=new URL(c.baseUrl);}catch{return{id:c.id,name:c.name,status:"invalid-url",reasons:["invalid-base-url"]};}
 if(base.protocol!=="https:"||base.username||base.password)return{id:c.id,name:c.name,status:"invalid-url",reasons:["https-required"]};
 const hosts=hostAliases(base.hostname),host=base.hostname.toLowerCase();
 const r={id:c.id,name:c.name,domain:host,status:"unknown",homepage:false,sitemapFound:false,chapterPagesFound:0,sampledChapters:0,quality:null,reasons:[]};
 try{
  const home=await get(fetchImpl,base.href,hosts,2*1024*1024);r.homepage=true;r.siteTitle=titleFromHtml(home);
  const links=extractLinks(home,base,hosts);
  let maps=[];try{maps=robotsSitemaps(await get(fetchImpl,new URL("/robots.txt",base),hosts,256*1024,7000),base,hosts);}catch{}
  if(!maps.length)maps=[new URL("/sitemap.xml",base).href];
  let urls=[];
  for(const map of maps.slice(0,2)){try{const xml=await get(fetchImpl,map,hosts,5*1024*1024);r.sitemapFound=true;urls.push(...sitemapUrls(xml,base,hosts));const children=sitemapChildren(xml,base,hosts);for(const child of children.slice(0,2)){try{urls.push(...sitemapUrls(await get(fetchImpl,child,hosts,5*1024*1024),base,hosts));}catch{}}}catch{}}
  urls=[...new Set([...urls,...links.map(x=>x.url)])].slice(0,3);r.chapterPagesFound=urls.length;
  if(!urls.length){r.status=/小说|文学|阅读|书城/.test((r.siteTitle||"")+" "+c.name)?"needs-adapter":"non-novel-or-undiscovered";r.reasons.push("no-chapter-link-in-homepage-or-public-sitemap");return r;}
  const articles=[];
  for(const url of urls.slice(0,2)){try{const html=await get(fetchImpl,url,hosts,2*1024*1024);let content=textFromHtml(html);
    const article=html.match(/<(article|main)[^>]*>([\s\S]*?)<\/\1\s*>/i);if(article)content=textFromHtml(article[2]);
    const cjk=(content.match(/[\u3400-\u9fff]/g)||[]).length;
    if(content.length>=300&&cjk>=100)articles.push({title:titleFromHtml(html)||"chapter-"+(articles.length+1),content});else r.reasons.push("sample-page-too-short-or-not-chinese-text");
  }catch(e){r.reasons.push(String(e.message||e).slice(0,100));}}
  r.sampledChapters=articles.length;if(!articles.length){r.status="chapter-content-unavailable";return r;}
  const q=scanArticles(articles);r.quality=q.summary;r.chapterFindings=q.results.map(x=>({title:x.title,status:x.status,length:x.length,flags:x.flags}));
  r.status=q.summary.suspect||q.summary.duplicates?"suspect":q.summary.review?"manual-review":"chapter-sample-clean";
  if(r.status==="suspect")r.reasons.push("chapter-text-quality-findings");return r;
 }catch(e){r.status="unreachable-or-blocked";r.reasons.push(String(e.message||e).slice(0,120));return r;}
}
async function scanCandidates({candidates,fetchImpl=fetch,limit=40}){
 const chosen=[],hostsSeen=new Set();for(const c of candidates||[]){if(!c?.baseUrl||ADULT.test(String(c.group||"")+" "+String(c.name||"")))continue;let h;try{h=new URL(c.baseUrl).hostname.toLowerCase();}catch{continue;}
 const aliases=hostAliases(h);const key=[...aliases].sort().join("|");if(hostsSeen.has(key))continue;hostsSeen.add(key);chosen.push(c);if(chosen.length>=Math.max(1,Math.min(100,Number(limit)||40)))break;}
 const results=[];for(const c of chosen)results.push(await scanOne(c,fetchImpl));const counts={};for(const r of results)counts[r.status]=(counts[r.status]||0)+1;
 return{schemaVersion:2,generatedAt:new Date().toISOString(),mode:"public-homepage-and-sitemap-chapter-sample",candidateCount:chosen.length,counts,note:"Limited public-page sample only. Canonical www/mobile host aliases are allowed; no login, cookies, paywall bypass, upstream rules or novel text are stored. Clean sample is not license approval or full-site validation.",results};
}
module.exports={scanCandidates,textFromHtml,sitemapUrls,robotsSitemaps,extractLinks,hostAliases};
