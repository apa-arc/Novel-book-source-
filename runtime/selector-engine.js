#!/usr/bin/env node
"use strict";

// Executes only the project's bounded selector IR against a caller-supplied DOM.
// No fetching, eval, script execution, cookies, or filesystem access is provided.
const MAX_STEPS=32;
const MAX_RESULTS=5000;
const MAX_SELECTOR_LENGTH=2048;

function asArray(value){return Array.from(value||[]);}
function descendants(root){
  const out=[];
  const stack=asArray(root&&root.children).reverse();
  while(stack.length){
    const node=stack.pop();
    out.push(node);
    const kids=asArray(node&&node.children);
    for(let i=kids.length-1;i>=0;i--) stack.push(kids[i]);
    if(out.length>MAX_RESULTS) throw new Error("selector-result-limit");
  }
  return out;
}
function cssEscape(value){
  return String(value).replace(/[^a-zA-Z0-9_-]/g,ch=>"\\"+ch);
}
function normalizeIndex(index,length){
  if(!Number.isInteger(index)) return -1;
  const n=index<0?length+index:index;
  return n>=0&&n<length?n:-1;
}
function applySelection(items,step){
  let selected=items;
  if(step.selection){
    const s=step.selection;
    if(s.mode==="include"){
      selected=(s.indices||[]).map(i=>normalizeIndex(i,items.length)).filter(i=>i>=0).map(i=>items[i]);
    }else if(s.mode==="exclude"){
      const excluded=new Set((s.indices||[]).map(i=>normalizeIndex(i,items.length)).filter(i=>i>=0));
      selected=items.filter((_,i)=>!excluded.has(i));
    }else if(s.mode==="range"){
      const start=normalizeIndex(s.start,items.length);
      const end=normalizeIndex(s.end,items.length);
      const stepSize=s.step===undefined?1:s.step;
      if(!Number.isInteger(stepSize)||stepSize<=0) throw new Error("invalid-range-step");
      if(start<0||end<0) selected=[];
      else {
        selected=[];
        for(let i=start;i<=end&&i<items.length;i+=stepSize) selected.push(items[i]);
      }
    }else if(s.mode!=="index") throw new Error("unsupported-selection-mode");
  }
  if(Number.isInteger(step.index)){
    const i=normalizeIndex(step.index,selected.length);
    selected=i<0?[]:[selected[i]];
  }
  return selected;
}
function matchStep(context,step){
  const kind=step.kind;
  if(kind==="children") return asArray(context.children);
  if(kind==="css"){
    if(typeof step.query!=="string"||!step.query.trim()||step.query.length>MAX_SELECTOR_LENGTH) throw new Error("invalid-css-step");
    if(typeof context.querySelectorAll!=="function") throw new Error("dom-query-api-required");
    return asArray(context.querySelectorAll(step.query));
  }
  if(kind==="tag"||kind==="class"||kind==="id"){
    if(typeof step.name!=="string"||!step.name||step.name.length>256) throw new Error("invalid-selector-name");
    let query;
    if(kind==="tag"){
      if(!/^[a-zA-Z][a-zA-Z0-9-]*$/.test(step.name)) throw new Error("invalid-tag-name");
      query=step.name;
    }else query=(kind==="class"?".":"#")+cssEscape(step.name);
    if(typeof context.querySelectorAll!=="function") throw new Error("dom-query-api-required");
    return asArray(context.querySelectorAll(query));
  }
  if(kind==="text"){
    if(typeof step.name!=="string"||step.name.length>256) throw new Error("invalid-text-query");
    return descendants(context).filter(node=>String(node.textContent||"").includes(step.name));
  }
  throw new Error("unsupported-selector-step");
}
function textNodes(node){
  return asArray(node.childNodes).filter(child=>child&&child.nodeType===3).map(child=>child.nodeValue||child.textContent||"");
}
function readOutput(node,output){
  if(output==="all") return node;
  if(output==="text") return String(node.textContent||"");
  if(output==="textnodes") return textNodes(node);
  if(output==="owntext") return textNodes(node).join("");
  if(output==="html") return String(node.innerHTML||"");
  if(output==="href"||output==="src"||output==="content"){
    if(typeof node.getAttribute!=="function") return null;
    return node.getAttribute(output);
  }
  if(output.startsWith("attr:")){
    const name=output.slice(5);
    if(!/^[a-zA-Z_:][a-zA-Z0-9_.:-]{0,63}$/.test(name)) throw new Error("invalid-attribute-output");
    if(typeof node.getAttribute!=="function") return null;
    return node.getAttribute(name);
  }
  throw new Error("unsupported-selector-output");
}
function executeSelector(root,selector){
  if(root==null||!selector||typeof selector!=="object") throw new Error("invalid-selector-input");
  if(selector.engine==="json"){
    if(!Array.isArray(selector.path)||!selector.path.length||selector.path.length>32) throw new Error("invalid-json-path");
    let current=[root];
    for(const step of selector.path){
      const next=[];
      for(const value of current){
        if(step.kind==="property"){
          if(value&&typeof value==="object"&&!Array.isArray(value)&&Object.prototype.hasOwnProperty.call(value,step.name)) next.push(value[step.name]);
        }else if(step.kind==="index"){
          if(Array.isArray(value)){
            const index=step.index<0?value.length+step.index:step.index;
            if(index>=0&&index<value.length) next.push(value[index]);
          }
        }else if(step.kind==="wildcard"){
          if(Array.isArray(value)) next.push(...value);
          else if(value&&typeof value==="object") next.push(...Object.values(value));
        }else if(step.kind==="recursiveProperty"||step.kind==="recursiveWildcard"){
          const budget={visited:0};
          const collect=(node,depth)=>{
            if(node==null||typeof node!=="object"||depth>32||budget.visited>20000) return;
            budget.visited++;
            if(Array.isArray(node)){for(const child of node) collect(child,depth+1);return;}
            for(const [key,child] of Object.entries(node)){
              if(step.kind==="recursiveWildcard"||key===step.name) next.push(child);
              collect(child,depth+1);
              if(next.length>MAX_RESULTS) throw new Error("json-result-limit");
            }
          };
          collect(value,0);
        }else throw new Error("unsupported-json-path-step");
      }
      current=next;
      if(!current.length) return [];
    }
    return current.length===1?current[0]:current;
  }
  if(selector.engine==="literal") return String(selector.value==null?"":selector.value);
  if(selector.engine==="composite"){
    if(!Array.isArray(selector.parts)||!selector.parts.length||selector.parts.length>32) throw new Error("invalid-composite-selector");
    const values=selector.parts.map(part=>executeSelector(root,part));
    if(selector.operator==="concat") return values.map(value=>Array.isArray(value)?value.join(""):String(value==null?"":value)).join("");
    if(selector.operator==="fallback"){
      for(const value of values){
        const text=Array.isArray(value)?value.filter(x=>x!=null&&String(x).trim()).join(""):String(value==null?"":value);
        if(text.trim()) return value;
      }
      return "";
    }
    if(selector.operator==="zip"){
      const lists=values.map(value=>Array.isArray(value)?value:(value==null||value===""?[]:[value]));
      const max=lists.reduce((count,list)=>Math.max(count,list.length),0);
      const output=[];
      for(let index=0;index<max;index++) for(const list of lists) if(index<list.length) output.push(list[index]);
      return output;
    }
    throw new Error("unsupported-composite-operator");
  }
  if(selector.engine==="replace"){
    if(typeof selector.pattern!=="string"||selector.pattern.length>256||typeof selector.replacement!=="string") throw new Error("invalid-regex-transform");
    if(/\([^)]*[+*][^)]*\)[+*{]|\([^)]*\+[^)]*\)\+/u.test(selector.pattern)) throw new Error("unsafe-regex-transform");
    const input=executeSelector(root,selector.input);
    const value=Array.isArray(input)?input.join(""):String(input==null?"":input);
    if(value.length>200000) throw new Error("regex-input-limit");
    let regex;
    try{regex=new RegExp(selector.pattern,selector.replaceFirst?"u":"gu");}catch{throw new Error("invalid-regex-transform");}
    return value.replace(regex,selector.replacement);
  }
  if(selector.engine==="self") return readOutput(root, selector.output || "text");
  if(selector.engine==="css"){
    if(typeof selector.query!=="string"||!selector.query.trim()||selector.query.length>MAX_SELECTOR_LENGTH) throw new Error("invalid-css-query");
    if(typeof root.querySelectorAll!=="function") throw new Error("dom-query-api-required");
    let nodes=asArray(root.querySelectorAll(selector.query));
    if(nodes.length>MAX_RESULTS) throw new Error("selector-result-limit");
    if(selector.reverse) nodes.reverse();
    return nodes.map(node=>readOutput(node,selector.output||"text"));
  }
  if(selector.engine!=="legado-chain") throw new Error("unsupported-selector-engine");
  if(!Array.isArray(selector.steps)||!selector.steps.length||selector.steps.length>MAX_STEPS) throw new Error("invalid-selector-steps");
  let current=[root];
  for(const step of selector.steps){
    const next=[];
    for(const context of current){
      next.push(...applySelection(matchStep(context,step),step));
      if(next.length>MAX_RESULTS) throw new Error("selector-result-limit");
    }
    current=next;
    if(!current.length) break;
  }
  if(selector.reverse) current.reverse();
  if(selector.output==="all") return current;
  return current.map(node=>readOutput(node,selector.output||"text"));
}

module.exports={executeSelector};
