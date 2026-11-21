#!/usr/bin/env node
"use strict";
const assert=require("node:assert/strict");
const {executeSelector}=require("../runtime/selector-engine");

function element(tag,attrs={},children=[]){
  const node={
    nodeType:1,tagName:tag.toUpperCase(),attributes:attrs,children:children.filter(child=>typeof child!=="string"),childNodes:[],
    get textContent(){return this.childNodes.map(x=>x.nodeType===3?x.nodeValue:x.textContent).join("");},
    get innerHTML(){return this.childNodes.map(x=>x.nodeType===3?x.nodeValue:x.outerHTML).join("");},
    get outerHTML(){return "<"+tag+">"+this.innerHTML+"</"+tag+">";},
    getAttribute(name){return Object.prototype.hasOwnProperty.call(attrs,name)?attrs[name]:null;},
    querySelectorAll(query){
      const all=[]; const stack=[...this.children].reverse();
      while(stack.length){const n=stack.pop();all.push(n);for(let i=n.children.length-1;i>=0;i--)stack.push(n.children[i]);}
      if(query==="*") return all;
      if(query.startsWith(".")) return all.filter(n=>(n.attributes.class||"").split(/\s+/).includes(query.slice(1)));
      if(query.startsWith("#")) return all.filter(n=>n.attributes.id===query.slice(1));
      if(/^[a-z][a-z0-9-]*$/i.test(query)) return all.filter(n=>n.tagName.toLowerCase()===query.toLowerCase());
      const attr=query.match(/^([a-z][a-z0-9-]*)\[([a-z-]+)="([^"]*)"\]$/i);
      if(attr) return all.filter(n=>n.tagName.toLowerCase()===attr[1].toLowerCase()&&n.getAttribute(attr[2])===attr[3]);
      const attrOnly=query.match(/^\[([a-z-]+)="([^"]*)"\]$/i);
      if(attrOnly) return all.filter(n=>n.getAttribute(attrOnly[1])===attrOnly[2]);
      throw new Error("unsupported test selector: "+query);
    }
  };
  node.childNodes=children.flatMap(child=>typeof child==="string"?[{nodeType:3,nodeValue:child}]:[child]);
  return node;
}
const a=element("a",{class:"chapter",href:"/1"},["第一章"]);
const b=element("a",{class:"chapter",href:"/2"},["第二章"]);
const c=element("a",{class:"chapter",href:"/3"},["第三章"]);
const list=element("div",{class:"list"},[a,b,c]);
const root=element("main",{},[list]);
const chain=(steps,output="text",reverse=false)=>({engine:"legado-chain",steps,output,reverse});
assert.deepEqual(executeSelector(root,chain([{kind:"class",name:"list",index:null},{kind:"tag",name:"a",index:null}])) ,["第一章","第二章","第三章"]);
assert.deepEqual(executeSelector(root,chain([{kind:"class",name:"list",index:null},{kind:"tag",name:"a",index:1}])) ,["第二章"]);
assert.deepEqual(executeSelector(root,chain([{kind:"class",name:"list",index:null},{kind:"tag",name:"a",index:-1}])) ,["第三章"]);
assert.deepEqual(executeSelector(root,chain([{kind:"class",name:"list",index:null},{kind:"tag",name:"a",index:null,selection:{mode:"exclude",indices:[1]}}])) ,["第一章","第三章"]);
assert.deepEqual(executeSelector(root,chain([{kind:"class",name:"list",index:null},{kind:"tag",name:"a",index:null,selection:{mode:"range",start:0,end:2,step:2}}])) ,["第一章","第三章"]);
assert.deepEqual(executeSelector(root,chain([{kind:"class",name:"list",index:null},{kind:"tag",name:"a",index:null}],"href",true)),["/3","/2","/1"]);
assert.deepEqual(executeSelector(root,{engine:"css",query:"a",output:"text"}),["第一章","第二章","第三章"]);
assert.equal(executeSelector(a,{engine:"self",output:"text"}),"第一章");
assert.equal(executeSelector(a,{engine:"self",output:"href"}),"/1");
assert.deepEqual(executeSelector(root,chain([{kind:"class",name:"list",index:null},{kind:"tag",name:"a",index:null}],"href")),["/1","/2","/3"]);
assert.deepEqual(executeSelector(root,{engine:"css",query:"a",output:"attr:href"}),["/1","/2","/3"]);
assert.deepEqual(executeSelector(root,chain([{kind:"css",query:'a[href="/2"]'}],"href")),["/2"]);
assert.deepEqual(executeSelector(root,{engine:"composite",operator:"concat",parts:[
  {engine:"css",query:".list",output:"text"},
  {engine:"literal",value:" - 附加"}
]}),["第一章第二章第三章"," - 附加"]);
assert.deepEqual(executeSelector(root,{engine:"composite",operator:"fallback",parts:[
  {engine:"css",query:".missing",output:"text"},
  {engine:"css",query:".list",output:"text"}
]}),["第一章第二章第三章"]);
assert.deepEqual(executeSelector(root,{engine:"replace",input:{engine:"css",query:".list",output:"text"},pattern:"第一",replacement:"第壹"}),["第壹章第二章第三章"]);
const jsonRoot={data:{books:[{title:"斗破苍穹",author:"天蚕土豆"},{title:"凡人修仙传",author:"忘语"}]}};
assert.deepEqual(executeSelector(jsonRoot,{engine:"json",path:[
  {kind:"property",name:"data"},{kind:"property",name:"books"},{kind:"wildcard"},{kind:"property",name:"title"}
]}),["斗破苍穹","凡人修仙传"]);
assert.deepEqual(executeSelector(jsonRoot,{engine:"json",path:[
  {kind:"property",name:"data"},{kind:"property",name:"books"}
]}),[{title:"斗破苍穹",author:"天蚕土豆"},{title:"凡人修仙传",author:"忘语"}]);
const nestedJson={data:{search:[{title:"A"},{title:"B"}],other:{search:[{title:"C"}]}}};
assert.deepEqual(executeSelector(nestedJson,{engine:"json",path:[
  {kind:"recursiveProperty",name:"search"},{kind:"wildcard"},{kind:"property",name:"title"}
]}),["A","B","C"]);
assert.deepEqual(executeSelector(nestedJson,{engine:"json",path:[
  {kind:"property",name:"data"},{kind:"wildcard"}
]}),[nestedJson.data.search,nestedJson.data.other]);
assert.equal(executeSelector({textContent:"作者：甲 作者：乙"},{engine:"replace",input:{engine:"self",output:"text"},pattern:"作者：([^ ]+)",replacement:"$1",replaceFirst:true}),"甲 作者：乙");
assert.deepEqual(executeSelector(jsonRoot,{engine:"composite",operator:"zip",parts:[
  {engine:"json",path:[{kind:"property",name:"data"},{kind:"property",name:"books"},{kind:"wildcard"},{kind:"property",name:"title"}]},
  {engine:"json",path:[{kind:"property",name:"data"},{kind:"property",name:"books"},{kind:"wildcard"},{kind:"property",name:"author"}]}
]}),["斗破苍穹","天蚕土豆","凡人修仙传","忘语"]);
const variableContext={variables:{}};
const putSelector={engine:"put",input:{engine:"json",path:[{kind:"property",name:"data"},{kind:"property",name:"books"},{kind:"index",index:0},{kind:"property",name:"title"}]},assignments:[
  {key:"bookId",value:{engine:"literal",value:"book-001"}}
]};
assert.equal(executeSelector(jsonRoot,putSelector,variableContext),"斗破苍穹");
assert.equal(executeSelector(jsonRoot,{engine:"get",key:"bookId"},variableContext),"book-001");
assert.equal(executeSelector(jsonRoot,{engine:"variable",name:"data"},variableContext),jsonRoot.data);
assert.deepEqual(executeSelector(root,chain([{kind:"class",name:"list",index:null},{kind:"tag",name:"a",index:0}],"all")).length,1);
assert.throws(()=>executeSelector(root,chain([{kind:"script",name:"x"}])),/unsupported-selector-step/);
assert.throws(()=>executeSelector(root,{engine:"legado-chain",steps:Array(33).fill({kind:"children"})}),/invalid-selector-steps/);
console.log("Selector engine fixture tests passed.");
