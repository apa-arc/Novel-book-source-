#!/usr/bin/env node
"use strict";

// Executes bounded Legado selector IR: CSS chains, JSONPath filters/slices, limited XPath axes, regex cleanup, @put/@get state and normalized output modifiers.
// No fetching, eval, arbitrary script execution, cookies, or filesystem access is provided.
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
  if(output==="href"||output==="src"||output==="content"||output==="class"){
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
function matchesTag(node,tag){
  return !!node&&node.nodeType===1&&(tag==="*"||String(node.tagName||"").toLowerCase()===String(tag).toLowerCase());
}
function selectXPath(root,selector){
  if(!Array.isArray(selector.steps)||selector.steps.length>32) throw new Error("invalid-xpath-steps");
  let current=[root];
  for(const step of selector.steps){
    const next=[];
    for(const parent of current){
      let candidates=[];
      if(step.axis==="descendant"){
        candidates=parent&&typeof parent.querySelectorAll==="function"?Array.from(parent.querySelectorAll(step.tag)): [];
      }else if(step.axis==="child"){
        candidates=Array.from(parent&&parent.children||[]).filter(node=>matchesTag(node,step.tag));
      }else if(step.axis==="parent"){
        const node=parent&&(parent.parentElement||parent.parentNode);
        if(matchesTag(node,step.tag)) candidates=[node];
      }else if(step.axis==="followingSibling"||step.axis==="precedingSibling"){
        const siblings=Array.from(parent&&parent.parentElement&&parent.parentElement.children||[]);
        const index=siblings.indexOf(parent);
        if(index>=0){
          if(step.axis==="followingSibling") candidates=siblings.slice(index+1).filter(node=>matchesTag(node,step.tag));
          else candidates=siblings.slice(0,index).reverse().filter(node=>matchesTag(node,step.tag));
        }
      }else throw new Error("unsupported-xpath-axis");
      for(const filter of step.filters||[]){
        if(filter.kind==="attributeEquals") candidates=candidates.filter(node=>node.getAttribute&&node.getAttribute(filter.name)===filter.value);
        else if(filter.kind==="textEquals") candidates=candidates.filter(node=>String(node.textContent||"").trim()===filter.value);
        else if(filter.kind==="childExists") candidates=candidates.filter(node=>Array.from(node.children||[]).some(child=>matchesTag(child,filter.tag)));
        else if(filter.kind==="position") candidates=filter.index>0&&filter.index<=candidates.length?[candidates[filter.index-1]]:[];
        else if(filter.kind==="last") candidates=candidates.length?[candidates[candidates.length-1]]:[];
        else throw new Error("unsupported-xpath-filter");
      }
      next.push(...candidates);
      if(next.length>MAX_RESULTS) throw new Error("xpath-result-limit");
    }
    current=next;
    if(!current.length) break;
  }
  return current;
}
function executeSelector(root,selector,context={}){
  if(root==null||!selector||typeof selector!=="object") throw new Error("invalid-selector-input");
  if(!context||typeof context!=="object") context={};
  if(selector.engine==="get"){
    const variables=context.variables&&typeof context.variables==="object"?context.variables:{};
    return Object.prototype.hasOwnProperty.call(variables,selector.key)?variables[selector.key]:"";
  }
  if(selector.engine==="variable"){
    const variables=context.variables&&typeof context.variables==="object"?context.variables:{};
    if(Object.prototype.hasOwnProperty.call(variables,selector.name)) return variables[selector.name];
    if(root&&typeof root==="object"&&Object.prototype.hasOwnProperty.call(root,selector.name)) return root[selector.name];
    return "";
  }
  if(selector.engine==="put"){
    if(!Array.isArray(selector.assignments)||selector.assignments.length>32) throw new Error("invalid-put-assignments");
    if(!context.variables||typeof context.variables!=="object") context.variables={};
    const result=executeSelector(root,selector.input,context);
    for(const assignment of selector.assignments){
      const value=executeSelector(root,assignment.value,context);
      context.variables[assignment.key]=value;
    }
    return result;
  }
  if(selector.engine==="xpath"){
    const nodes=selectXPath(root,selector);
    if(selector.output==="all") return nodes;
    return nodes.map(node=>readOutput(node,selector.output||"text"));
  }
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
        }else if(step.kind==="union"){
          if(Array.isArray(value)) for(const rawIndex of step.indices){const index=rawIndex<0?value.length+rawIndex:rawIndex;if(index>=0&&index<value.length) next.push(value[index]);}
        }else if(step.kind==="slice"){
          if(Array.isArray(value)){
            const stride=step.step||1;
            if(stride>0){
              let start=step.start==null?0:step.start<0?Math.max(0,value.length+step.start):Math.min(value.length,step.start);
              let end=step.end==null?value.length:step.end<0?Math.max(0,value.length+step.end):Math.min(value.length,step.end);
              for(let index=start;index<end&&next.length<MAX_RESULTS;index+=stride) next.push(value[index]);
            }else{
              let start=step.start==null?value.length-1:step.start<0?value.length+step.start:step.start;
              let end=step.end==null?-1:step.end<0?value.length+step.end:step.end;
              for(let index=start;index>end&&index>=0&&next.length<MAX_RESULTS;index+=stride) if(index<value.length) next.push(value[index]);
            }
          }
        }else if(step.kind==="filter"){
          const candidates=Array.isArray(value)?value:value&&typeof value==="object"?Object.values(value):[];
          for(const candidate of candidates){
            if(!candidate||typeof candidate!=="object") continue;
            const exists=Object.prototype.hasOwnProperty.call(candidate,step.key);
            if(step.operator==="exists"&&exists) next.push(candidate);
            else if(step.operator==="="||step.operator==="=="){if(exists&&String(candidate[step.key])===String(step.value)) next.push(candidate);}
            else if(step.operator==="!="){if(!exists||String(candidate[step.key])!==String(step.value)) next.push(candidate);}
          }
        }else if(step.kind==="wildcard"){
          if(Array.isArray(value)) next.push(...value);
          else if(value&&typeof value==="object") next.push(...Object.values(value));
        }else if(step.kind==="recursiveProperty"||step.kind==="recursiveWildcard"||step.kind==="recursiveFilter"){
          const budget={visited:0};
          const collect=(node,depth)=>{
            if(node==null||typeof node!=="object"||depth>32||budget.visited>20000) return;
            budget.visited++;
            if(Array.isArray(node)){for(const child of node) collect(child,depth+1);return;}
            for(const [key,child] of Object.entries(node)){
              if(step.kind==="recursiveWildcard"||step.kind==="recursiveProperty"&&key===step.name) next.push(child);
              if(step.kind==="recursiveFilter"&&child&&typeof child==="object"){
                const exists=Object.prototype.hasOwnProperty.call(child,step.key);
                if(step.operator==="exists"&&exists|| (step.operator==="="||step.operator==="==")&&exists&&String(child[step.key])===String(step.value)||step.operator==="!="&&(!exists||String(child[step.key])!==String(step.value))) next.push(child);
              }
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
    const values=selector.parts.map(part=>executeSelector(root,part,context));
    if(selector.operator==="concat") return values.flatMap(value=>Array.isArray(value)?value:[value]).filter(value=>value!=null&&value!=="");
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
    const input=executeSelector(root,selector.input,context);
    const wasArray=Array.isArray(input);
    const values=wasArray?input:[input];
    if(values.some(value=>String(value==null?"":value).length>200000)) throw new Error("regex-input-limit");
    let regex;
    try{regex=new RegExp(selector.pattern,selector.replaceFirst?"u":"gu");}catch{throw new Error("invalid-regex-transform");}
    const transformed=values.map(value=>String(value==null?"":value).replace(regex,selector.replacement)).filter(value=>value!=="");
    return wasArray?transformed:(transformed[0]??"");
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
