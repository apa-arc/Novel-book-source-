# 书源四阶段功能测试器

`runtime/source-test-runner.js` 导出 `runSourceTests`，供阅读器宿主或受控 Smoke Test 注入真实 adapter 与 HTTP/DOM 实现。

## 测试流程

1. 搜索：要求返回至少一条结果，检查书名和书籍 URL。
2. 详情：要求书名非空。
3. 目录：要求至少一章、章节标题和 HTTPS 白名单 URL 有效、章节 URL 不重复、序号连续。
4. 正文：抽查 1–10 章，检查正文非空，并复用 `runtime/text-quality.js` 检测乱码、过短内容和重复正文。

报告仅包含阶段状态、标题、正文长度和质量统计，不保存正文原文、Cookie 或凭据。任何阶段失败或文章质量未通过，整体状态为 failed。

## 安全与边界

- HTTP/DOM 由调用方注入；测试器自身不发起网络请求、不执行上游脚本。
- 所有书籍和章节 URL 都必须是 HTTPS 且主机名位于书源 `domains` 白名单。
- 这是可供真实宿主调用的测试引擎；Node fixture 测试只验证测试器逻辑，不代表某个书源已经完成真实网站或 iPhone App 联调。
- 只有在真实 App 宿主提供 HTTP 与 DOM 后，运行报告才能作为真实功能测试证据。它不会自动修改 `enabled`。

## 本地测试

运行 `node scripts/test-source-test-runner.js` 或 `npm test`。