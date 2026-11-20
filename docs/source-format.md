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

请求能力由阅读 App 提供受限的 `http` 参数。解析器不得自行使用全局网络 API、文件系统、动态代码执行或未声明的系统能力。

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
