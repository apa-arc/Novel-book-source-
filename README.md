# Apple Novel Sources

个人 iPhone 小说阅读器的独立书源仓库，采用 JSON 元数据 + JavaScript 解析器，统一管理正版平台与公开小说网站适配器。

## 双路线

- `official`：正版平台。优先使用官方 API、开放接口或平台明确授权的接入方式；遵守登录、订阅、地区和访问限制。
- `public-web`：公开小说网站。仅适配允许自动化访问、且内容使用具有合法依据的网站；不绕过登录、付费墙、验证码或 DRM。

两类来源共用同一套搜索、详情、目录和正文接口。每个书源通过 JSON 的 `kind` 字段标明类别。

## 目录结构

```text
.
├── .github/workflows/       # 自动校验
├── docs/                    # 协议和适配说明
├── schemas/                 # JSON Schema
├── scripts/                 # JavaScript 解析器
├── sources/                 # JSON 书源定义
├── index.json               # 书源总索引
└── package.json             # 校验工具配置
```

## 安全边界

- JSON 负责元数据、站点域名白名单和解析器引用。
- JavaScript 负责搜索、详情、目录和章节正文解析。
- App 端必须在隔离环境执行解析器，并限制网络域名、重定向、超时、响应大小和可用 API。
- 不向解析器开放文件系统、任意网络或用户凭据。
- 仓库只保存适配代码和配置，不托管未经授权的小说正文。

## 开发状态

目前已建立书源索引、配置模板、接口模板、静态规则转换器，以及第一阶段无网络选择器执行模块（`runtime/selector-engine.js`）。执行模块尚未接入 AppleNovelApp，也未完成真实网站或 Swift DOM 兼容测试；目前没有任何第三方源被宣称为可直接使用。
