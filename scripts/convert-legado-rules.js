#!/usr/bin/env node
"use strict";
// Selector IR remains non-executable; supports CSS attributes, bounded JSONPath/XPath, safe templates, @put/@get state, %% interleaving, ### first-only replacement, and &&/|| composition.
// Unsupported diagnostics expose bounded syntax tokens, never full rule expressions.
// Bare HTML tag names are retained as tag selector steps; absent output defaults to text.
// Index and exclusion selectors are represented as structured IR; runtime parity remains unverified.
// Non-index bracket selectors remain manual until their exact selector semantics are implemented.
const fs = require("node:fs");
const path = require("node:path");
const RULE_GROUPS = { search:"ruleSearch", bookInfo:"ruleBookInfo", toc:"ruleToc", content:"ruleContent", explore:"ruleExplore" };
const REQUIRED_GROUPS = ["search", "bookInfo", "toc", "content"];
const CHAIN_OUTPUTS = new Set(["text", "html", "href", "src", "content", "owntext", "textnodes"]);
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
function splitTopLevel(raw, operator) {
  const parts=[];
  let quote=null, bracketDepth=0, parenDepth=0, braceDepth=0, start=0;
  for(let i=0;i<raw.length;i++){
    const ch=raw[i];
    if(ch==="\\"){i++;continue;}
    if(quote){if(ch===quote) quote=null;continue;}
    if(ch==="'"||ch=='"'){quote=ch;continue;}
    if(ch==="["){bracketDepth++;continue;}
    if(ch==="]"&&bracketDepth>0){bracketDepth--;continue;}
    if(bracketDepth>0) continue;
    if(ch==="("){parenDepth++;continue;}
    if(ch===")"&&parenDepth>0){parenDepth--;continue;}
    if(ch==="{"){braceDepth++;continue;}
    if(ch==="}"&&braceDepth>0){braceDepth--;continue;}
    if(braceDepth>0) continue;
    if(parenDepth===0&&raw.startsWith(operator,i)){
      parts.push(raw.slice(start,i).trim());
      i+=operator.length-1;
      start=i+1;
    }
  }
  return parts.length?parts.concat(raw.slice(start).trim()):null;
}
function parseJsonPath(expression) {
  const raw=String(expression||"").trim();
  if(!raw||raw.length>1024) return null;
  const steps=[];
  let i=0;
  if(raw[i]==="$") i++;
  while(i<raw.length){
    if(raw[i]==="."&&raw[i+1]==="."){
      i+=2;
      if(raw[i]==="*"){steps.push({kind:"recursiveWildcard"});i++;continue;}
      const match=raw.slice(i).match(/^([A-Za-z_$][\w$-]*)/);
      if(!match) return null;
      steps.push({kind:"recursiveProperty",name:match[1]});
      i+=match[1].length;
      continue;
    }
    if(raw[i]==="."){
      i++;
      if(raw[i]==="[") continue;
      if(raw[i]==="*"){steps.push({kind:"wildcard"});i++;continue;}
      const match=raw.slice(i).match(/^([A-Za-z_$][\w$-]*)/);
      if(!match) return null;
      steps.push({kind:"property",name:match[1]});
      i+=match[1].length;
      continue;
    }
    if(raw[i]==="["){
      const end=raw.indexOf("]",i+1);
      if(end<0) return null;
      const token=raw.slice(i+1,end).trim();
      if(token==="*") steps.push({kind:"wildcard"});
      else if(/^-?\d+$/.test(token)) steps.push({kind:"index",index:Number(token)});
      else if(/^(['"])[\s\S]*\1$/.test(token)) steps.push({kind:"property",name:token.slice(1,-1)});
      else return null;
      i=end+1;
      continue;
    }
    if(i===0){
      const match=raw.slice(i).match(/^([A-Za-z_$][\w$-]*)/);
      if(!match) return null;
      steps.push({kind:"property",name:match[1]});
      i+=match[1].length;
      continue;
    }
    return null;
  }
  return steps.length?steps:null;
}
function parseSimpleXPath(expression) {
  let raw=String(expression||"").trim().replace(/^@xpath:/i,"");
  if(!raw.startsWith("/")) return null;
  let output="text";
  const attr=raw.match(/\/@([\w:-]+)$/);
  if(attr){output="attr:"+attr[1];raw=raw.slice(0,-attr[0].length);}
  else if(/\/text\(\)$/.test(raw)) raw=raw.replace(/\/text\(\)$/,"");
  const segments=[];
  let axis=raw.startsWith("//")?"descendant":"child";
  let i=raw.startsWith("//")?2:1;
  while(i<raw.length){
    const next=raw.indexOf("/",i);
    const segment=raw.slice(i,next<0?raw.length:next);
    if(!segment) return null;
    const name=segment.match(/^([A-Za-z*][\w*-]*)/);
    if(!name) return null;
    let rest=segment.slice(name[1].length);
    let css=name[1];
    while(rest){
      const predicate=rest.match(/^\[@([\w:-]+)\s*=\s*(['"])(.*?)\2\]/);
      const position=rest.match(/^\[(\d+)\]/);
      if(predicate){
        const value=predicate[3].replace(/\\/g,"\\\\").replace(/"/g,'\\"');
        css += "[" + predicate[1] + '="' + value + '"]';
        rest=rest.slice(predicate[0].length);
      }else if(position){
        css+=":nth-of-type("+position[1]+")";
        rest=rest.slice(position[0].length);
      }else return null;
    }
    segments.push({axis,css});
    if(next<0) break;
    if(raw.startsWith("//",next)){axis="descendant";i=next+2;}
    else{axis="child";i=next+1;}
  }
  if(!segments.length) return null;
  const query=segments.map((item,index)=>index===0?item.css:(item.axis==="descendant"?" ":" > ")+item.css).join("");
  return {engine:"css",query,output};
}
function parsePutValue(raw) {
  const value=String(raw||"").trim();
  if(!value) return null;
  if(/^(['"])[\s\S]*\1$/.test(value)) return {engine:"literal",value:value.slice(1,-1)};
  if(/^-?\d+(?:\.\d+)?$/.test(value)||/^(?:true|false|null)$/i.test(value)) return {engine:"literal",value};
  const getMatch=value.match(/^@get:([A-Za-z_$][\w$-]{0,63})$/i);
  if(getMatch) return {engine:"get",key:getMatch[1]};
  if(/^[A-Za-z_$][\w$-]*$/.test(value)) return {engine:"variable",name:value};
  const fallback=splitTopLevel(value,"||");
  if(fallback){
    const parts=fallback.map(parsePutValue);
    return parts.every(Boolean)?{engine:"composite",operator:"fallback",parts}:null;
  }
  const concat=splitTopLevel(value,"&&");
  if(concat){
    const parts=concat.map(parsePutValue);
    return parts.every(Boolean)?{engine:"composite",operator:"concat",parts}:null;
  }
  const parsed=parseLegacyChain(value);
  return parsed.status==="candidate"?parsed.selector:null;
}
function parsePutAssignments(raw) {
  const entries=splitTopLevel(String(raw||""),",")||[String(raw||"").trim()];
  if(!entries||!entries.length||entries.length>32) return null;
  const assignments=[];
  for(const entry of entries){
    const colon=entry.indexOf(":");
    if(colon<1) return null;
    const key=entry.slice(0,colon).trim();
    const value=parsePutValue(entry.slice(colon+1));
    if(!/^[A-Za-z_$][\w$-]{0,63}$/.test(key)||!value) return null;
    assignments.push({key,value});
  }
  return assignments;
}
function parseTemplateExpression(raw) {
  if(!raw.includes("{{")) return null;
  const parts=[];
  let cursor=0,found=false;
  while(true){
    const start=raw.indexOf("{{",cursor);
    if(start<0) break;
    const end=raw.indexOf("}}",start+2);
    if(end<0) return {status:"manual",reason:"unclosed-template"};
    if(start>cursor) parts.push({engine:"literal",value:raw.slice(cursor,start)});
    const inner=raw.slice(start+2,end).trim();
    if(!inner) return {status:"manual",reason:"empty-template-expression"};
    const parsed=parseLegacyChain(inner);
    if(parsed.status!=="candidate") return {status:"manual",reason:"unsupported-template-expression"};
    parts.push(parsed.selector);
    found=true;
    cursor=end+2;
  }
  if(!found) return null;
  if(cursor<raw.length) parts.push({engine:"literal",value:raw.slice(cursor)});
  if(parts.length===1) return {status:"candidate",selector:parts[0]};
  return {status:"candidate",selector:{engine:"composite",operator:"concat",parts}};
}
function parseCompositePart(raw) {
  const value=String(raw||"").trim();
  if(!value) return null;
  if(/^[A-Za-z_$][\w$-]*$/.test(value)) return {status:"candidate",selector:{engine:"variable",name:value}};
  return parseLegacyChain(value);
}
function parseLegacyChain(expression) {
  let raw = String(expression).trim();
  if (!raw) return {status:"empty"};
  if (SCRIPT_RE.test(raw)) return {status:"manual",reason:"script-or-template"};
  const tripleHashParts=splitTopLevel(raw,"###");
  const replaceFirst=!!tripleHashParts&&raw.endsWith("###");
  if(tripleHashParts&&!replaceFirst) return {status:"manual",reason:"unsupported-regex-mode"};
  const regexInput=replaceFirst?raw.slice(0,-3):raw;
  const regexParts=splitTopLevel(regexInput,"##");
  if(regexParts){
    if(regexParts.length<2||(regexParts.length>3&&(regexParts.length-1)%2!==0)||(replaceFirst&&regexParts.length!==3)) return {status:"manual",reason:"unsupported-regex-transform"};
    const base=regexParts[0]?parseLegacyChain(regexParts[0]):{status:"candidate",selector:{engine:"self",output:"text"}};
    if(base.status!=="candidate") return base;
    let selector=base.selector;
    for(let i=1;i<regexParts.length;i+=2){
      const pattern=regexParts[i],replacement=regexParts[i+1]||"";
      if(!pattern||pattern.length>256) return {status:"manual",reason:"unsupported-regex-transform"};
      selector={engine:"replace",input:selector,pattern,replacement,replaceFirst};
    }
    return {status:"candidate",selector};
  }
  const putMatch=raw.match(/^(.*)@put:\{([\s\S]*)\}$/i);
  if(putMatch){
    const assignments=parsePutAssignments(putMatch[2]);
    if(!assignments) return {status:"manual",reason:"unsupported-put-assignment"};
    const base=putMatch[1]?parseLegacyChain(putMatch[1]):{status:"candidate",selector:{engine:"self",output:"text"}};
    if(base.status!=="candidate") return base;
    return {status:"candidate",selector:{engine:"put",input:base.selector,assignments}};
  }
  const getMatch=raw.match(/^@get:([A-Za-z_$][\w$-]{0,63})$/i);
  if(getMatch) return {status:"candidate",selector:{engine:"get",key:getMatch[1]}};
  const fallbackParts=splitTopLevel(raw,"||");
  if(fallbackParts){
    const parts=fallbackParts.map(parseCompositePart).filter(Boolean);
    if(!parts.length) return {status:"manual",reason:"unsupported-fallback-part"};
    if(parts.some(x=>x.status!=="candidate")) return {status:"manual",reason:"unsupported-fallback-part"};
    return parts.length===1?parts[0]:{status:"candidate",selector:{engine:"composite",operator:"fallback",parts:parts.map(x=>x.selector)}};
  }
  const zipParts=splitTopLevel(raw,"%%");
  if(zipParts){
    const parts=zipParts.map(parseCompositePart).filter(Boolean);
    if(!parts.length) return {status:"manual",reason:"unsupported-zip-part"};
    if(parts.some(x=>x.status!=="candidate")) return {status:"manual",reason:"unsupported-zip-part"};
    return parts.length===1?parts[0]:{status:"candidate",selector:{engine:"composite",operator:"zip",parts:parts.map(x=>x.selector)}};
  }
  const concatParts=splitTopLevel(raw,"&&");
  if(concatParts){
    const parts=concatParts.map(parseCompositePart).filter(Boolean);
    if(!parts.length) return {status:"manual",reason:"unsupported-concat-part"};
    if(parts.some(x=>x.status!=="candidate")) return {status:"manual",reason:"unsupported-concat-part"};
    return parts.length===1?parts[0]:{status:"candidate",selector:{engine:"composite",operator:"concat",parts:parts.map(x=>x.selector)}};
  }
  const template=parseTemplateExpression(raw);
  if(template) return template;
  if(/^(['"])[\s\S]*\1$/.test(raw)) return {status:"candidate",selector:{engine:"literal",value:raw.slice(1,-1)}};
  if(raw.startsWith("@text:")) return {status:"candidate",selector:{engine:"literal",value:raw.slice(6)}};
  if(raw.startsWith("@@")) raw=raw.slice(2);
  const expressionShape=scanExpressionOperators(raw);
  if(expressionShape.operators.length || expressionShape.regexDelimiterCount>0) return {status:"manual",reason:"unsupported-compound-expression"};
  if (raw.startsWith("@css:")) {
    const body=raw.slice(5).trim();
    const match=body.match(/^(.*?)(?:@(text|html|href|src|content))?$/i);
    if (!match || !match[1]) return {status:"manual",reason:"unsupported-css-expression"};
    return {status:"candidate",selector:{engine:"css",query:match[1],output:(match[2]||"text").toLowerCase()}};
  }
  if (raw.startsWith("//") || /^@xpath:/i.test(raw)) {
    const xpath=parseSimpleXPath(raw);
    return xpath?{status:"candidate",selector:xpath}:{status:"manual",reason:"unsupported-xpath"};
  }
  const jsonExpression=raw.match(/^@json:(.*)$/i);
  const implicitJson=/^\$[.[]/.test(raw)||/^[A-Za-z_$][\w$-]*\[\*/.test(raw);
  if(jsonExpression||implicitJson){
    const jsonPath=parseJsonPath(jsonExpression?jsonExpression[1]:raw);
    return jsonPath?{status:"candidate",selector:{engine:"json",path:jsonPath}}:{status:"manual",reason:"unsupported-jsonpath"};
  }
  if (/^(text|html|href|src|owntext|textnodes|textNodes|all)$/i.test(raw)) {
    const output = raw.toLowerCase() === "textnodes" ? "textnodes" : raw.toLowerCase();
    return {status:"candidate",selector:{engine:"self",output}};
  }
  if (/^(title|alt|value|content|id|class|data-[a-zA-Z0-9_-]+)$/i.test(raw)) {
    return {status:"candidate",selector:{engine:"self",output:"attr:"+raw.toLowerCase()}};
  }
  const segments=raw.split("@");
  if (segments[0] === "" && raw.startsWith("@")) segments.shift();
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
      const originalSegment=segment;
      segment=bracket[1];
      selection=parseSelection(bracket[2]);
      if (!selection) {
        let query=null;
        const tagAttr=originalSegment.match(/^tag\.([a-zA-Z][\w-]*)((?:\[[^\]]+\])+)/);
        const classAttr=originalSegment.match(/^class\.([a-zA-Z_][\w-]*)((?:\[[^\]]+\])+)/);
        const idAttr=originalSegment.match(/^id\.([a-zA-Z_][\w-]*)((?:\[[^\]]+\])+)/);
        if(tagAttr) query=tagAttr[1]+tagAttr[2];
        else if(classAttr) query="."+classAttr[1]+classAttr[2];
        else if(idAttr) query="#"+idAttr[1]+idAttr[2];
        else if(/^(?:[a-zA-Z][\w-]*|[.#][\w-]+)?(?:[.#][\w-]+)*(?:\[[^\]]+\])+$/.test(originalSegment)) query=originalSegment;
        if(!query) return {status:"manual",reason:"unsupported-attribute-filter"};
        steps.push({kind:"css",query});
        continue;
      }
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
    if (/^[.#][a-zA-Z_][\w-]*(?:\\s|[>+~,:\\[])/.test(segment)) {
      if (steps.length) return {status:"manual",reason:"mixed-css-and-chain"};
      return {status:"candidate",selector:{engine:"css",query:segment,output:"text"}};
    }
    let parts, kind;
    if (/^\\.[a-zA-Z_][\w-]*$/.test(segment)) {
      kind="class"; parts=[segment.slice(1)];
    } else if (/^#[a-zA-Z_][\w-]*$/.test(segment)) {
      kind="id"; parts=[segment.slice(1)];
    } else {
      const implicitTagIndex = segment.match(/^([a-zA-Z][\w-]*)\.(-?\d+)$/);
      if (implicitTagIndex) {
        kind="tag";
        parts=[implicitTagIndex[1],implicitTagIndex[2]];
      } else {
        parts=segment.split(".");
        kind=parts.shift();
        if (!["class","id","tag","text"].includes(kind)) {
          kind="tag";
          parts.unshift(segment);
        }
      }
    }
    const trailingToken=parts.length>1 ? parts[parts.length-1] : null;
    const trailingSelection=trailingToken!==null ? parseSelection(trailingToken) : null;
    const hasTrailingSelection=!!trailingSelection;
    const name=hasTrailingSelection ? parts.slice(0,-1).join(".") : parts.join(".");
    if (!name) return {status:"manual",reason:"invalid-selector-index"};
    const effectiveSelection=selection||trailingSelection;
    const index=effectiveSelection&&effectiveSelection.mode==="index"?effectiveSelection.index:null;
    steps.push({kind,name,index,...(effectiveSelection&&effectiveSelection.mode!=="index"?{selection:effectiveSelection}:{})});
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
  if (requiredReady) result.conversionStatus="candidate";
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
