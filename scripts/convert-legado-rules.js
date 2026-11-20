#!/usr/bin/env node
"use strict";
// Selector IR remains non-executable; runtime parity requires separate adapter tests.
// Unsupported diagnostics expose bounded syntax tokens, never full rule expressions.
// Bare HTML tag names are retained as tag selector steps; absent output defaults to text.
// Index and exclusion selectors are represented as structured IR; runtime parity remains unverified.
// Non-index bracket selectors remain manual until their exact selector semantics are implemented.
const fs = require("node:fs");
const path = require("node:path");
const RULE_GROUPS = { search:"ruleSearch", bookInfo:"ruleBookInfo", toc:"ruleToc", content:"ruleContent", explore:"ruleExplore" };
const REQUIRED_GROUPS = ["search", "bookInfo", "toc", "content"];
const CHAIN_OUTPUTS = new Set(["text", "html", "href", "src", "owntext", "textnodes"]);
const SCRIPT_RE = /@js:|<js>|\bjavascript\b|\bfunction\b|\breturn\b|\$\{/i;
function parseIndex(token) { return /^-?\d+$/.test(token) ? Number(token) : null; }
function parseSelection(token) {
  if (/^-?\d+$/.test(token)) return {mode:"index",index:Number(token)};
  if (/^!?-?\d+(?::-?\d+){0,2}$/.test(token)) {
    const exclude=token.startsWith("!");
    const values=(exclude?token.slice(1):token).split(":").map(Number);
    if (values.length===1 && !exclude) return {mode:"index",index:values[0]};
    if (exclude) return {mode:"exclude",indices:values};
    return {mode:"range",start:values[0],end:values[1],step:values.length===3?values[2]:1};
  }
  if (/^!?-?\d+(?:,-?\d+)+$/.test(token)) {
    const exclude=token.startsWith("!");
    return {mode:exclude?"exclude":"include",indices:(exclude?token.slice(1):token).split(",").map(Number)};
  }
  return null;
}
function scanExpressionOperators(raw) {
  const operators=[];
  let regexDelimiterCount=0;
  let onlyOne=false;
  let quote=null;
  let bracketDepth=0;
  for(let i=0;i<raw.length;i++){
    const ch=raw[i];
    if(ch==="\\"){i++;continue;}
    if(quote){
      if(ch===quote) quote=null;
      continue;
    }
    if(ch==="'" || ch=='"'){quote=ch;continue;}
    if(ch==="["){bracketDepth++;continue;}
    if(ch==="]" && bracketDepth>0){bracketDepth--;continue;}
    if(bracketDepth>0) continue;
    if(raw.startsWith("&&",i)){operators.push("&&");i++;continue;}
    if(raw.startsWith("||",i)){operators.push("||");i++;continue;}
    if(raw.startsWith("%%",i)){operators.push("%%");i++;continue;}
    if(raw.startsWith("###",i)){onlyOne=true;regexDelimiterCount++;i+=2;continue;}
    if(raw.startsWith("##",i)){regexDelimiterCount++;i++;continue;}
  }
  return {operators,regexDelimiterCount,onlyOne};
}
function parseLegacyChain(expression) {
  const raw = String(expression).trim();
  if (!raw) return {status:"empty"};
  if (SCRIPT_RE.test(raw)) return {status:"manual",reason:"script-or-template"};
  const expressionShape=scanExpressionOperators(raw);
  if(expressionShape.operators.length || expressionShape.regexDelimiterCount>0) {
    return {
      status:"manual",
      reason:"compound-or-transform-expression",
      expression:{
        kind:expressionShape.regexDelimiterCount>0?"regex-transform-or-compound":"compound",
        operators:expressionShape.operators,
        regexDelimiterCount:expressionShape.regexDelimiterCount,
        onlyOne:expressionShape.onlyOne,
        operandCount:expressionShape.operators.length?expressionShape.operators.length+1:1
      }
    };
  }
  if (raw.startsWith("@css:")) {
    const body=raw.slice(5).trim();
    const match=body.match(/^(.*?)(?:@(text|html|href|src|content))?$/i);
    if (!match || !match[1]) return {status:"manual",reason:"unsupported-css-expression"};
    return {status:"candidate",selector:{engine:"css",query:match[1],output:(match[2]||"text").toLowerCase()}};
  }
  if (raw.startsWith("//")) {
    const match=raw.match(/^\/\/([a-zA-Z][\w-]*)(?:\[@([\w:-]+)=['"]([^'"]+)['"]\])?\/@([\w:-]+)$/);
    if (!match) return {status:"manual",reason:"unsupported-xpath"};
    const [,tag,attr,value,out]=match;
    const query=attr ? tag+"["+attr+"=\""+value.replace(/"/g,'\\"')+"\"]" : tag;
    return {status:"candidate",selector:{engine:"css",query,output:out==="text"?"text":"attr:"+out}};
  }
  if (/^@xpath:/i.test(raw)) return {status:"manual",reason:"unsupported-xpath"};
  if (/^@json:/i.test(raw) || /^\$[.[]/.test(raw)) return {status:"manual",reason:"unsupported-jsonpath"};
  const segments=raw.split("@");
  const tail=(segments[segments.length-1]||"").toLowerCase();
  const output=CHAIN_OUTPUTS.has(tail)||tail==="all" ? (segments.pop(),tail) : "text";
  const steps=[];
  let reverse=false;
  for (const segmentValue of segments) {
    let segment=segmentValue.trim();
    if (!segment) return {status:"manual",reason:"unsupported-selector-step",selectorKind:null};
    if (segment.startsWith("-")) { reverse=true; segment=segment.slice(1); }
    let selection=null;
    const bracket=segment.match(/^(.*)\[([^\]]+)\]$/);
    if (bracket) {
      segment=bracket[1];
      selection=parseSelection(bracket[2]);
      if (!selection) return {status:"manual",reason:"unsupported-attribute-filter"};
    } else {
      const excluded=segment.match(/^(.*)!(-?\d+(?::-?\d+)*)$/);
      if (excluded) {
        segment=excluded[1];
        selection=parseSelection("!"+excluded[2]);
      }
    }
    if (/^\.(-?\d+)$/.test(segment)) {
      steps.push({kind:"children",name:null,index:Number(segment.slice(1))});
      continue;
    }
    if (/^-?\d+$/.test(segment)) {
      steps.push({kind:"children",name:null,index:Number(segment)});
      continue;
    }
    if (segment==="children" || segment==="") {
      const index=selection&&selection.mode==="index"?selection.index:null;
      steps.push({kind:"children",name:null,index,...(selection&&selection.mode!=="index"?{selection}:{})});
      continue;
    }
    const parts=segment.split(".");
    let kind=parts.shift();
    if (!["class","id","tag","text"].includes(kind)) {
      kind="tag";
      parts.unshift(segment);
    }
    const trailingIndex=parts.length>1 ? parseIndex(parts[parts.length-1]) : null;
    const hasIndex=trailingIndex!==null;
    const name=hasIndex ? parts.slice(0,-1).join(".") : parts.join(".");
    if (!name) return {status:"manual",reason:"invalid-selector-index"};
    const index=hasIndex?trailingIndex:(selection&&selection.mode==="index"?selection.index:null);
    steps.push({kind,name,index,...(selection&&selection.mode!=="index"?{selection}:{})});
  }
  if (!steps.length) return {status:"manual",reason:"empty-selector-chain"};
  return {status:"candidate",selector:{engine:"legado-chain",steps,output,reverse}};

}
function convertSource(source,index) {
  let safeBaseUrl=null;
  try { const u=new URL(source.bookSourceUrl); if(u.protocol==="https:") safeBaseUrl=u.origin; } catch {}
  const result={sourceIndex:index+1,name:source.bookSourceName||"(未命名)",baseUrl:safeBaseUrl,sourceEnabled:source.enabled!==false,conversionStatus:"manual",groups:{}};
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
  const requiredReady=REQUIRED_GROUPS.every(name=>{const g=result.groups[name];return g && g.status==="candidate" && Object.keys(g.fields).length>0 && Object.values(g.fields).every(field=>field.status==="candidate");});
  const anyConvertible=Object.values(result.groups).some(g=>Object.values(g.fields||{}).some(field=>field.status==="candidate"));
  if (requiredReady && warnings.length===0) result.conversionStatus="candidate";
  else if (anyConvertible) result.conversionStatus="partial";
  else result.conversionStatus="manual";
  return result;
}
function main() {
  const args=process.argv.slice(2), input=args.find(a=>!a.startsWith("--")), outputArg=args.find(a=>a.startsWith("--output="));
  if (!input) { console.error("用法：node scripts/convert-legado-rules.js <合法取得的书源JSON> [--output=文件]"); process.exit(2); }
  const parsed=JSON.parse(fs.readFileSync(path.resolve(input),"utf8"));
  const sources=Array.isArray(parsed)?parsed:[parsed];
  if (!sources.length || sources.some(s=>!s || typeof s!=="object" || Array.isArray(s))) throw new Error("输入必须是书源对象或书源对象数组");
  const converted=sources.map(convertSource);
  const report={schemaVersion:1,converter:"legado-selector-ir",note:"Sanitized selector IR only; not a runnable adapter. Original rule expressions and request credentials are omitted. No network requests or rule execution. Required groups: search, bookInfo, toc, content.",sourceCount:converted.length,counts:{candidate:converted.filter(s=>s.conversionStatus==="candidate").length,partial:converted.filter(s=>s.conversionStatus==="partial").length,manual:converted.filter(s=>s.conversionStatus==="manual").length},sources:converted};
  const output=JSON.stringify(report,null,2)+"\n";
  if(outputArg){const target=path.resolve(outputArg.slice("--output=".length));fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,output,"utf8");console.log("转换报告已写入："+target);}else process.stdout.write(output);
}
if (require.main === module) main();
module.exports={convertSource,parseLegacyChain};
