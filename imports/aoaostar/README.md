# AOAOSTAR / Legado 书源扫描与导入

本目录登记公开书源合集入口，作为外部书源的**发现渠道**，不是本仓库的运行时依赖。

## 已登记合集

合集入口见 [catalog.json](./catalog.json)，扫描后的去重元数据目录见 [public-catalog.json](./public-catalog.json)，候选审查队列见 [candidate-review.json](./candidate-review.json)。当前包括全量书源、XIU2 精品、破冰、关耳女频、shidahuilang、三舞313 和开源阅读软件等公开合集。

## 扫描

需要 Node.js 18 或更高版本：

```bash
npm run scan-legado
```

输出机器可读报告：

```bash
npm run scan-legado -- --json
```

将报告保存到文件：

```bash
npm run scan-legado -- --output=reports/aoaostar-scan.json
```

扫描工作流会发布去重后的元数据目录（名称、来源地址、合集位置、扫描级别和审查状态），不复制任何原始书源规则。扫描器只从固定的 `raw.githubusercontent.com/aoaostar/legado` 地址读取 JSON，检查规则字段、脚本迹象、登录和 Cookie 配置。它不执行书源规则，不保存原始规则内容、请求头、Cookie 或凭据。

## 分级含义

- `candidate`：字段较完整，未发现明显脚本、登录或 Cookie 依赖；只是待转换候选，不代表已经能用。
- `partial`：部分核心规则齐全，仍需补充或人工检查。
- `manual`：发现脚本、登录态或 Cookie 配置，必须人工评估；不自动执行。
- `low`：来源地址或关键规则不足。

## 导入原则

1. 先扫描和去重，再逐条检查来源、授权、站点可访问性及规则语法。
2. 仅将有合法依据、允许自动化访问的源转换为本项目的 JSON 元数据 + JavaScript 适配器。
3. 对上游内容保留作者、原始仓库/文件链接、版本和许可证信息；上游项目 README 声明 AGPL-3.0。若要复制或再分发上游文件/代码，必须先核对对应文件的许可范围并履行许可证义务。
4. 不导入或复用个人 Cookie、账号凭据、登录态；不绕过付费墙、验证码、DRM 或访问控制。
5. 未审核记录可以出现在公开元数据目录中，但不会因此进入正式 `index.json`，也不会在 App 中默认启用。

**重要：** AOAOSTAR 的公开书源合集是来源目录，不代表其中每一条书源都由 AOAOSTAR 原创或都可任意复制。配置备份也不等于小说正文备份。
