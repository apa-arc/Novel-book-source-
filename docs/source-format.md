# 书源文件格式规范（Source Format v1）

本文定义本仓库书源 JSON 与解析器之间的约定。它是文件格式规范，不是网站或在线服务接口。

## 1. 文件组成

每个书源由两部分组成：

- `sources/<id>.json`：书源元数据、版本、站点范围和解析器路径。
- `scripts/<id>.js`：书源解析规则。

`index.json` 只登记书源文件位置和启用状态，阅读 App 可读取索引后导入 JSON 文件。仓库不提供用户系统、在线阅读服务或小说正文托管。

## 2. 元数据字段

| 字段 | 类型 | 说明 |
|---|---|---|
| schemaVersion | number | 固定为 1 |
| id | string | 全仓库唯一，小写字母、数字和短横线 |
| name | string | 阅读器中显示的名称 |
| kind | string | official 或 public-web |
| version | string | 语义版本，例如 1.0.0 |
| baseUrl | string | 来源站点 HTTPS 根地址 |
| domains | string[] | 允许解析器访问的主机名白名单 |
| script | string | 仓库内解析器路径 |
| enabled | boolean | 是否默认启用 |
| description | string | 可选说明 |
| categories | string[] | 可选分类 |
| licenseNote | string | 来源许可和使用依据说明 |

`domains` 必须包含 `baseUrl` 的主机名。解析器不得请求白名单之外的主机。不要在书源文件中保存 Cookie、密码、令牌或其他个人凭据。

## 3. 解析器接口

解析器使用 CommonJS 导出对象，方法均为异步方法：

- `search({ keyword, page, http })`
- `getBookDetail({ bookUrl, http })`
- `getChapters({ bookUrl, http })`
- `getContent({ chapterUrl, http })`

请求能力由阅读 App 提供受限的 `http` 参数。当前通用运行时约定 `http.get(url)` 返回 `{ document, url? }`：`document` 是由 App 自己的 HTML 解析器产生的 DOM 根节点，`url` 是最终响应 URL（如有）。运行时会再次检查最终 URL 的 HTTPS 和域名白名单。解析器不得自行使用全局网络 API、文件系统、动态代码执行或未声明的系统能力。

仓库提供 `runtime/source-adapter.js` 的 `createAdapter(config)`，用于将声明式选择器配置接入四个统一方法。它不负责网络请求或 HTML 解析；这些能力必须由 App 注入。选择器配置仍需经过目标 App 的真实 DOM 兼容测试。

### 3.1 App 兼容配置（可选）

书源可以在元数据中声明 `appConfig`，供 AppleNovelApp 直接导入。必须提供四个 HTTPS 接口地址；如果站点返回 HTML，可同时提供受限 CSS 选择器规则：

```json
{
  "appConfig": {
    "searchUrl": "https://example.com/search?q={keyword}",
    "bookUrl": "https://example.com/book/{bookId}",
    "chapterListUrl": "https://example.com/chapters?bookUrl={bookUrl}",
    "chapterUrl": "https://example.com/chapter",
    "htmlRules": {
      "search": {
        "itemSelector": ".book",
        "titleSelector": "a.title",
        "urlSelector": "a.title",
        "authorSelector": ".author",
        "descriptionSelector": ".intro"
      },
      "detail": {
        "titleSelector": "h1",
        "descriptionSelector": ".intro"
      },
      "chapters": {
        "itemSelector": ".chapter",
        "titleSelector": "a",
        "urlSelector": "a"
      },
      "content": {
        "contentSelector": "#content",
        "titleSelector": "h1"
      }
    }
  }
}
```

四个接口地址必须为 HTTPS，主机名必须位于 `domains` 白名单内。CSS 规则只支持 App 明确实现的安全子集（标签、类、ID、属性、后代/子元素、基础位置伪类）；不支持 XPath、正则脚本或任意 JavaScript。没有 `appConfig` 的脚本源会被 App 标记为暂不兼容。CI 的解析器测试不替代目标 App 的真实站点验证。

## 4. 统一返回结构

### 搜索结果

```js
{
  title: "书名",
  author: "作者",
  bookUrl: "https://allowed.example/book/1",
  coverUrl: "https://allowed.example/cover/1.jpg",
  intro: "简介"
}
```

必须提供 `title`、`bookUrl`。其余字段可省略。

### 书籍详情

```js
{
  title: "书名",
  author: "作者",
  intro: "简介",
  coverUrl: "https://allowed.example/cover/1.jpg",
  latestChapter: "最新章节"
}
```

必须提供 `title`。

### 目录章节

```js
{
  title: "第一章",
  chapterUrl: "https://allowed.example/chapter/1",
  index: 0
}
```

必须提供 `title` 和 `chapterUrl`；`index` 为从 0 开始的目录顺序。

### 正文章节

```js
{
  title: "第一章",
  content: "章节正文"
}
```

必须提供非空字符串 `content`。

## 5. URL 与内容约束

- 所有来源 URL 必须使用 HTTPS。
- 书籍、章节和封面链接必须属于该书源声明的域名范围；跨域资源需要显式加入白名单并经过审核。
- 书源规则不得尝试绕过登录、付费墙、验证码、DRM 或访问控制。
- 只收录具有合法使用和分发依据的规则；许可不明确时保持禁用，不将其作为正式可分发书源。
- 仓库保存规则，不保存未经授权的小说正文、账号凭据或会话数据。

## 6. 状态定义

- 模板：结构示例，不代表真实可用书源。
- 候选：格式扫描或转换得到，尚未完成审核。
- 已验证：通过结构校验及授权审查，并在目标 App 中完成对应功能测试。
- 启用：已验证且由维护者明确允许在索引中启用。

静态转换成功、选择器语法可解析或 CI 通过，都不能单独证明书源可用或获得授权。

# 正式启用质量门禁

将书源索引中的 `enabled` 设为 `true` 前，元数据必须同时具备：

- `licenseApproved: true`、非空 `licenseEvidence`、有效的 `licenseType`（`self-owned`、`written-permission`、`open-license`、`public-domain`）及 HTTPS `licenseEvidenceUrl`。证据链接必须直接支持许可/权属主张，网站首页或“公开可访问”不算证据。
- 完整的 `appConfig`：搜索、详情、目录、正文四个 HTTPS 接口，所有主机都必须位于 `domains` 白名单。
- `hostValidated: true` 及 `functionalTestReport`。报告必须对应当前 sourceId/version，状态为 passed、失败阶段为 0、至少抽查 1 章，并通过文本质量检查。
- `qualityReport`：对应当前 sourceId/version，至少扫描 1 章，乱码/可疑、需人工复核和重复正文均为 0。

仅有布尔值、手写说明或模拟数据不能代替测试报告。模拟源必须保持禁用，不能被计入正式订阅。订阅构建器会再次执行这些检查；任一条件不满足即拒绝发布。

