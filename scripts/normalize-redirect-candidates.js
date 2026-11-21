#!/usr/bin/env node
"use strict";
const fs=require("node:fs"),path=require("node:path");
const ROOT=path.resolve(__dirname,"..");
const catalog=JSON.parse(fs.readFileSync(path.join(ROOT,"imports/third-party/multi-repo-candidate-catalog.json"),"utf8"));
const probe=JSON.parse(fs.readFileSync(path.join(ROOT,"reports/candidate-homepage-probe.json"),"utf8"));
const compatibility=JSON.parse(fs.readFileSync(path.join(ROOT,"reports/candidate-search-compatibility.json"),"utf8"));
const sourceById=new Map((catalog.sources||[]).map(x=>[x.id,x]));
const probeById=new Map((probe.results||[]).map(x=>[x.id,x]));
const errors=(compatibility.results||[]).filter(x=>x.classification==="request-error-or-redirect");
const exclude=/爱奇艺|奇妙小说|QQ浏览器|酷匠|七猫|起点|飞卢|17K|疯读|阅友|书旗|露露书|ESJZone|成人|色情|情色|耽美|R18|18禁/i;
const byHost=new Map();
for(const item of errors){
 const source=sourceById.get(item.id),status=probeById.get(item.id);
 if(!source||!status||!status.finalHost||status.finalHost===source.host)continue;
 const targetHost=status.finalHost.toLowerCase();
 if(exclude.test(source.name+" "+source.group+" "+targetHost))continue;
 if(!byHost.has(targetHost))byHost.set(targetHost,{host:targetHost,baseUrl:"https://"+targetHost+"/",names:[],sourceIds:[],originalHosts:[],groups:[]});
 const row=byHost.get(targetHost);row.names.push(source.name);row.sourceIds.push(source.id);row.originalHosts.push(source.host);row.groups.push(source.group);
}
const results=[...byHost.values()].map(x=>({...x,names:[...new Set(x.names)],sourceIds:[...new Set(x.sourceIds)],originalHosts:[...new Set(x.originalHosts)],groups:[...new Set(x.groups)]})).sort((a,b)=>a.host.localeCompare(b.host));
const report={schemaVersion:1,generatedAt:new Date().toISOString(),note:"仅把首页探测时发生跳转的候选站点规范到其最终 HTTPS 主机名；尚未通过搜索、详情、目录、正文测试，不进入正式订阅。",counts:{redirectedCandidates:errors.length,normalizedUniqueHosts:results.length},results};
const out=path.join(ROOT,"reports/redirect-normalized-candidates.json");fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2)+"\n");
console.log(JSON.stringify(report.counts,null,2));
