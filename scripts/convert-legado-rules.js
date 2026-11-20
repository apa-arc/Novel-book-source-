#!/usr/bin/env node
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const RULE_GROUPS = { search:"ruleSearch", bookInfo:"ruleBookInfo", toc:"ruleToc", content:"ruleContent", explore:"ruleExplore" };
const SCRIPT_RE = /@js:|<js>|\bjavascript\b|\bfunction\b|\breturn\b|\$\{/i;
function parseIndex(token) { return /^-?\d+$/.test(token) ? Number(token) : null; }
function parseLegacyChain(expression) {
  const raw = String(expression).trim();
  if (!raw) return {status:"empty",expression:raw};
  if (SCRIPT_RE.test(raw)) return {status:"manual",reason:"script-or-template",expression:raw};
  if (raw.includes("&&") || raw.includes("##") || raw.includes("||")) return {status:"manual",reason:"compound-or-transform-expression",expression:raw};
  if (raw.startsWith("@css:")) {
    const body=raw.slice(5).trim();
    const match=body.match(/^(.*?)(?:@(text|html|href|src|content))?$/i);
    if (!match || !match[1]) return {status:"manual",reason:"unsupported-css-expression",expression:raw};
    return {status:"candidate",selector:{engine:"css",query:match[1],output:(match[2]||"text").toLowerCase()},expression:raw};
  }
  if (raw.startsWith("//")) {
    const match=raw.match(/^\/\/([a-zA-Z][\w-]*)(?:\[@([\w:-]+)=['"]([^'"]+)['"]\])?\/@([\w:-]+)$/);
    if (!match) return {status:"manual",reason:"unsupported-xpath",expression:raw};
    const [,tag,attr,value,out]=match;
    const query=attr ? tag+"["+attr+"=\""+value.replace(/"/g,'\\"')+"\"]" : tag;
    return {status:"candidate",selector:{engine:"css",query,output:out==="text"?"text":"attr:"+out},expression:raw};
  }
  const segments=raw.split("@");
  const output=(segments.pop()||"text").toLowerCase();
  if (!["text","html","href","src"].includes(output)) return {status:"manual",reason:"unsupported-output",expression:raw};
  const steps=[];
  for (const segment of segments) {
    const parts=segment.split(".");
    const kind=parts.shift();
    if (!["class","id","tag"].includes(kind) || parts.length<1) return {status:"manual",reason:"unsupported-selector-step",expression:raw};
    const index=parts.length>1 ? parseIndex(parts[parts.length-1]) : 0;
    const name=parts.length>1 ? parts.slice(0,-1).join(".") : parts[0];
    if (!name || (parts.length>1 && index===null)) return {status:"manual",reason:"invalid-selector-index",expression:raw};
    steps.push({kind,name,index:index===null?0:index});
  }
  if (!steps.length) return {status:"manual",reason:"empty-selector-chain",expression:raw};
  return {status:"candidate",selector:{engine:"legado-chain",steps,output},expression:raw};
}
function convertSource(source,index) {
  const result={sourceIndex:index+1,name:source.bookSourceName||"(未命名)",baseUrl:source.bookSourceUrl||null,sourceEnabled:source.enabled!==false,conversionStatus:"candidate",groups:{}};
  const warnings=[];
  if (!result.baseUrl || !/^https:\/\//i.test(result.baseUrl)) warnings.push("https-required");
  if (source.enabled===false) warnings.push("disabled-upstream");
  if (source.loginUrl || source.loginUi || source.loginCheckJs) warnings.push("login-config-present");
  if (source.enabledCookieJar || source.header) warnings.push("request-header-or-cookie-config-present");
  for (const [groupName,key] of Object.entries(RULE_GROUPS)) {
    const group=source[key];
    if (!group || typeof group!=="object" || Array.isArray(group)) { result.groups[groupName]={status:"missing",fields:{}}; continue; }
    const fields={}; let hasManual=false;
    for (const [field,expression] of Object.entries(group)) {
      if (typeof expression!=="string") { fields[field]={status:"manual",reason:"non-string-rule"}; hasManual=true; continue; }
      const parsed=parseLegacyChain(expression); fields[field]=parsed;
      if (parsed.status==="manual") hasManual=true;
    }
    result.groups[groupName]={status:hasManual?"partial":"candidate",fields};
  }
  if (warnings.length) result.warnings=warnings;
  if (warnings.length || Object.values(result.groups).some(g=>g.status==="partial")) result.conversionStatus="partial";
  if (Object.values(result.groups).every(g=>g.status==="missing")) result.conversionStatus="manual";
  return result;
}
function main() {
  const args=process.argv.slice(2), input=args.find(a=>!a.startsWith("--")), outputArg=args.find(a=>a.startsWith("--output="));
  if (!input) { console.error("用法：node scripts/convert-legado-rules.js <合法取得的书源JSON> [--output=文件]"); process.exit(2); }
  const parsed=JSON.parse(fs.readFileSync(path.resolve(input),"utf8"));
  const sources=Array.isArray(parsed)?parsed:[parsed];
  if (!sources.length || sources.some(s=>!s || typeof s!=="object" || Array.isArray(s))) throw new Error("输入必须是书源对象或书源对象数组");
  const converted=sources.map(convertSource);
  const report={schemaVersion:1,converter:"legado-selector-ir",note:"Selector IR only; not a runnable adapter. No network requests or rule execution. Manual fields require review.",sourceCount:converted.length,counts:{candidate:converted.filter(s=>s.conversionStatus==="candidate").length,partial:converted.filter(s=>s.conversionStatus==="partial").length,manual:converted.filter(s=>s.conversionStatus==="manual").length},sources:converted};
  const output=JSON.stringify(report,null,2)+"\n";
  if(outputArg){const target=path.resolve(outputArg.slice("--output=".length));fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,output,"utf8");console.log("转换报告已写入："+target);}else process.stdout.write(output);
}
main();
