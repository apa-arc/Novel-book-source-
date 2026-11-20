# AppleNovelApp 模拟书源开发

## 当前阶段

阅读 App 尚未完成 HTML/XPath 解析和完整在线阅读流程，因此书源仓库先提供不联网的模拟源，按 App 当前 `NovelSource`、`NovelSummary`、`NovelDetail`、`NovelChapter`、`NovelContent` 数据模型准备联调数据。

## 文件

- `development/mock-source.json`：字段对齐 App 当前手动导入格式（name、baseUrl、searchUrl、bookUrl、chapterListUrl、chapterUrl）。
- `development/mock-responses.json`：原创测试数据，包含搜索结果、详情、3章目录和3章正文。
- `scripts/test-app-mock-source.js`：离线校验模拟源的字段、HTTPS 地址格式、搜索、详情、目录和正文完整性。

## 安全与发布边界

- 使用保留的 `example.invalid` 域名，不会解析到真实站点。
- 不发起网络请求，不会把模拟数据伪装成真实网站响应。
- `enabled=false` 且 `developmentOnly=true`，不写入普通或成人正式索引，不计入可用书源数量。
- 测试正文为本项目原创短篇，仅用于验证阅读器数据链路。

## App 完工后的联调顺序

1. 用模拟搜索响应验证搜索列表映射。
2. 验证书籍详情和章节目录字段映射。
3. 验证正文、章节前后关系、空正文和乱码质量检查。
4. App 的真实解析器和宿主 HTTP 能力完成后，再将模拟接口替换为获授权的真实站点适配器。
5. 只有经过真实宿主验证、许可审核和质量门禁的书源才进入正式订阅。
