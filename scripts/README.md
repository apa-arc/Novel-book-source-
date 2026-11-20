# 书源解析器接口

书源解析器为阅读 App 提供统一的规则入口。每个解析器按需实现以下异步方法：

- `search({ keyword, page, http })`
- `getBookDetail({ bookUrl, http })`
- `getChapters({ bookUrl, http })`
- `getContent({ chapterUrl, http })`

返回值使用普通 JavaScript 对象和数组，字段定义以 `sources/template.json` 为准。

## 运行约束

解析器由阅读 App 调用，使用 App 注入的受限请求接口获取书源目标页面的数据。解析器不应拥有任意网络、文件系统或系统权限。

本仓库只维护书源配置、规则和相关工具，不托管小说网站或小说正文。模板仅用于定义书源结构，尚未配置为可用书源。

## 通用书源运行时

`runtime/source-adapter.js` 导出 `createAdapter(config)`，将声明式选择器映射为 `search`、`getBookDetail`、`getChapters`、`getContent`。宿主传入 `http.get(url)`，返回 `{ document, url? }`；`document` 必须是宿主 HTML 解析器生成的 DOM。运行时会校验请求 URL 和重定向后的最终 URL 是否为 HTTPS 且主机在 `domains` 白名单内。它不自行联网、不解析 HTML、不执行上游脚本，也不提供 Cookie/登录态。

运行测试：`npm test`。目前测试使用模拟 DOM，不代表已通过 iOS App 或真实网站验证。
