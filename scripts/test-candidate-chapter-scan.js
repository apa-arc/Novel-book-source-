"use strict";
const assert=require("node:assert/strict");
const {scanCandidates,textFromHtml,sitemapUrls,robotsSitemaps}=require("../scripts/scan-candidate-chapters");
assert.match(textFromHtml("<p>第一章&nbsp;你好</p><script>secret</script>"),/第一章.*你好/);
assert.doesNotMatch(textFromHtml("<script>secret</script><p>正文</p>"),/secret/);
assert.deepEqual(sitemapUrls('<loc>https://example.com/book/123/1.html</loc><loc>https://evil.test/read/1</loc>',"https://example.com","example.com"),["https://example.com/book/123/1.html"]);
assert.deepEqual(robotsSitemaps("Sitemap: https://example.com/sitemap.xml","https://example.com","example.com"),["https://example.com/sitemap.xml"]);
function response(url,body,status=200,type="text/html"){return{ok:status>=200&&status<300,status,url,headers:{get:()=>type},arrayBuffer:async()=>Buffer.from(body,"utf8")};}
const chapter="第一章 开始\n"+"这是一段正常的中文小说正文，内容连续完整，没有乱码字符。".repeat(20);
const html="<html><head><title>测试小说 第1章 开始</title></head><body><article><p>"+chapter+"</p></article></body></html>";
(async()=>{
 const calls=[];const fake=async url=>{calls.push(url);
 if(url==="https://example.com/")return response(url,"<title>小说阅读</title>");
 if(url==="https://example.com/robots.txt")return response(url,"Sitemap: https://example.com/sitemap.xml",200,"text/plain");
 if(url==="https://example.com/sitemap.xml")return response(url,'<loc>https://example.com/book/123/1.html</loc>',200,"application/xml");
 if(url==="https://example.com/book/123/1.html")return response(url,html);
 throw Error("unexpected-url");};
 const report=await scanCandidates({candidates:[{id:"adult",name:"成人小说",baseUrl:"https://adult.example",group:"成人"},{id:"adult-emoji",name:"普通名称",baseUrl:"https://adult-emoji.example",group:"🔞"},{id:"ok",name:"测试小说",baseUrl:"https://example.com"}],fetchImpl:fake,limit:10});
 assert.equal(report.candidateCount,1);assert.equal(report.results[0].status,"chapter-sample-clean");assert.equal(report.results[0].sampledChapters,1);assert.ok(!JSON.stringify(report).includes(chapter));assert.equal(calls.length,4);
 const mixedHtml="<html><head><title>测试小说 第2章 开始</title></head><body><article><p>"+("这是超长章节正文。".repeat(4000))+"</p></article></body></html>";
 const mixedFetch=async url=>{
 if(url==="https://mixed.example/")return response(url,"<title>测试小说</title>");
 if(url==="https://mixed.example/robots.txt")return response(url,"Sitemap: https://mixed.example/sitemap.xml",200,"text/plain");
 if(url==="https://mixed.example/sitemap.xml")return response(url,'<loc>https://mixed.example/read/1.html</loc><loc>https://mixed.example/read/2.html</loc>',200,"application/xml");
 if(url==="https://mixed.example/read/1.html")return response(url,html);
 if(url==="https://mixed.example/read/2.html")return response(url,mixedHtml);
 throw Error("unexpected-url");
 };
 const mixed=await scanCandidates({candidates:[{id:"mixed",name:"测试小说",baseUrl:"https://mixed.example"}],fetchImpl:mixedFetch,limit:1});
 assert.equal(mixed.results[0].sampledChapters,1);assert.equal(mixed.results[0].status,"manual-review");assert.ok(mixed.results[0].reasons.includes("sample-page-content-too-large-for-single-chapter"));
 const offsetReport=await scanCandidates({candidates:[{id:"first",name:"第一站",baseUrl:"https://first.example"},{id:"second",name:"第二站",baseUrl:"https://second.example"}],fetchImpl:async()=>{throw Error("blocked");},limit:1,offset:1});
 assert.equal(offsetReport.candidateCount,1);assert.equal(offsetReport.offset,1);assert.equal(offsetReport.totalUniqueCandidates,2);assert.equal(offsetReport.results[0].id,"second");
 console.log("Candidate chapter scanner tests passed.");
})().catch(e=>{console.error(e);process.exitCode=1;});
