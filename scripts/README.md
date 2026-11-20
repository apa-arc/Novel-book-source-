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
