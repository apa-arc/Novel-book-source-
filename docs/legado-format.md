# 阅读（Legado）书源格式说明

## 常见字段

| 字段 | 用途 | 本项目初步处理 |
| --- | --- | --- |
| `bookSourceName` | 书源名称 | 可映射为来源名称 |
| `bookSourceUrl` | 站点/API 基础地址 | 可提取主机名，仍需 HTTPS 与域名校验 |
| `bookSourceGroup` | 分组 | 可映射为标签 |
| `searchUrl` / `exploreUrl` | 搜索/发现请求模板 | 先识别，不直接执行 |
| `ruleSearch` | 搜索结果字段规则 | 逐字段评估 |
| `ruleBookInfo` | 书籍详情规则 | 逐字段评估 |
| `ruleToc` | 目录规则 | 逐字段评估 |
| `ruleContent` | 正文规则 | 逐字段评估 |
| `ruleExplore` | 发现页规则 | 逐字段评估 |
| `header` / `loginUrl` | 请求头、登录配置 | 仅标记存在，不导入凭据 |
| `enabledCookieJar` | Cookie 管理开关 | 仅标记存在，不读取或迁移 Cookie |

## 本地只读分析

将从可信来源合法取得的 JSON 文件放在本地，然后在仓库根目录执行：

```bash
node scripts/analyze-legado-source.js ./path/to/sources.json
```

需要机器可读报告时：

```bash
node scripts/analyze-legado-source.js ./path/to/sources.json --json
```

分析器只调用 JSON.parse，不会执行规则字符串、脚本或表达式，也不会联网。报告只显示是否存在 Cookie/登录配置，不输出其值。

## 兼容等级

- `candidate`：核心规则字段齐全，未检测到明显高级依赖；仅表示值得优先人工测试。
- `partial`：具备部分核心规则，可能适合静态规则子集转换。
- `manual`：检测到登录、Cookie 或脚本特征，必须人工评估。
- `low`：来源地址或核心规则不足。

这些等级不是运行成功率，也不构成自动启用许可。具体规则可能依赖 Legado 专有语法、变量、请求行为或站点授权条件。

## 安全原则

- 不执行导入 JSON 中的任何代码或表达式。
- 不迁移 Cookie、账号密码、令牌或其他登录凭据。
- 不绕过登录、订阅付费、验证码、DRM 或站点访问限制。
- 只适配有合法访问依据且允许自动化访问的来源。

## 已覆盖的链式选择器子集

当前中间表示解析器在保守边界内识别以下 JSOUP 链式步骤：

- `class.name`、`id.name`、`tag.name`：名称选择；未写索引时保留为“全部匹配”，显式 `.0` 等才保留索引。
- `text.keyword`：按文本片段匹配。
- `children`：子元素步骤，不接受名称参数。
- 链式输出：`text`、`textNodes`、`ownText`、`html`、`href`、`src`、`all`。
- 规则段前的 `-` 会记录为反转标记。

这只是语法识别和中间表示，不代表 iOS 运行时已实现相同的 DOM 选择、负索引、过滤、正则替换或组合规则。带排除索引、区间、多选择、复杂 XPath、JSONPath、正则/模板变换以及 `&&` / `||` 的规则仍需单独解析和测试；未覆盖的语法继续标记人工处理。
