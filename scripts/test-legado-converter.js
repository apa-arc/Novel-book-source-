#!/usr/bin/env node
"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const os=require("node:os");
const path=require("node:path");
const {spawnSync}=require("node:child_process");
const root=path.resolve(__dirname,"..");
const fixture=path.join(root,"tests/fixtures/legado-converter.json");
const temp=fs.mkdtempSync(path.join(os.tmpdir(),"legado-ir-"));
const output=path.join(temp,"report.json");
try{
 const run=spawnSync(process.execPath,[path.join(__dirname,"convert-legado-rules.js"),fixture,"--output="+output],{encoding:"utf8"});
 assert.equal(run.status,0,run.stderr||run.stdout);
 const report=JSON.parse(fs.readFileSync(output,"utf8"));
 assert.equal(report.sourceCount,2);
 assert.equal(report.sources[0].groups.search.fields.name.selector.engine,"legado-chain");
 assert.equal(report.sources[0].groups.bookInfo.fields.name.selector.query,'meta[property="og:title"]');
 assert.equal(report.sources[0].groups.content.fields.content.selector.engine,"css");
 assert.equal(report.sources[1].groups.search.fields.name.status,"manual");
 assert.equal(report.sources[1].groups.search.fields.name.reason,"script-or-template");
 console.log("Legado converter fixture tests passed.");
}finally{fs.rmSync(temp,{recursive:true,force:true});}
