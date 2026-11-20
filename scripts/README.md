# JavaScript 解析器接口

每个解析器导出以下异步方法：

- `search({ keyword, page, http })`
- `getBookDetail({ bookUrl, http })`
- `getChapters({ bookUrl, http })`
- `getContent({ chapterUrl, http })`

返回值统一使用普通 JavaScript 对象和数组，字段见模板注释。

## 网络边界

解析器通过 App 注入的受限 `http` 对象请求网页。App 必须校验 HTTPS、域名白名单、重定向目标、超时、响应大小和内容类型。不要给解析器任意网络、文件或系统权限。

当前模板只定义接口，不是可直接使用的网站书源。
