# AOAOSTAR / Legado 书源扫描与导入

本目录登记公开书源合集入口，并保存 AOAOSTAR 全量书源规则快照。镜像结果经过筛选后发布到 `exports/`，不依赖运行时访问上游。

## 已登记合集

合集入口见 [catalog.json](./catalog.json)，扫描后的去重元数据目录见 [public-catalog.json](./public-catalog.json)，候选审查队列见 [candidate-review.json](./candidate-review.json)，转换进度见 [conversion-status.json](./conversion-status.json)。当前包括全量书源、XIU2 精品、破冰、关耳女频、shidahuilang、三舞313 和开源阅读软件等公开合集。

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

扫描工作流会发布去重后的元数据目录（名称、来源地址、合集位置、扫描级别和审查状态），不复制任何原始书源规则。扫描器只从固定的 `raw.githubusercontent.com/aoaostar/legado` 地址读取 JSON，检查规则字段、脚本迹象、登录和 Cookie 配置。规则镜像工作流会保存全量规则快照，并生成普通/成人两份 Legado 格式规则包；导入脚本不会执行书源规则，会移除登录界面/校验、Cookie Jar 和敏感认证请求头，依赖这些凭据的源默认禁用。

## 分级含义

- `candidate`：字段较完整，未发现明显脚本、登录或 Cookie 依赖；只是待转换候选，不代表已经能用。
- `partial`：部分核心规则齐全，仍需补充或人工检查。
- `manual`：发现脚本、登录态或 Cookie 配置，必须人工评估；不自动执行。
- `low`：来源地址或关键规则不足。

## 转换进度

执行 `batch-convert-aoaostar` 工作流后，会更新 `conversion-status.json`。该文件只保留每条候选的静态转换状态、分组字段数量和诊断代码，不公开选择器表达式或原始规则。`candidate` 仅代表静态选择器解析通过，不是可运行适配器，也不代表授权或真实网站测试通过。

## 导入原则

1. 先扫描和去重，再逐条检查来源、授权、站点可访问性及规则语法。
2. 仅将有合法依据、允许自动化访问的源转换为本项目的 JSON 元数据 + JavaScript 适配器。
3. 对上游内容保留作者、原始仓库/文件链接、版本和许可证信息；上游项目 README 声明 AGPL-3.0。若要复制或再分发上游文件/代码，必须先核对对应文件的许可范围并履行许可证义务。
4. 不导入或复用个人 Cookie、账号凭据、登录态；镜像时移除敏感认证字段并禁用依赖登录态的源。不绕过付费墙、验证码、DRM 或访问控制。
5. 未审核记录可以出现在公开元数据目录中，但不会因此进入正式 `index.json`，也不会在 App 中默认启用。

**规则镜像链接：** 普通源见 `exports/legado-ordinary.json`，成人源见 `exports/legado-adult.json`；具体数量以 `exports/aoaostar-import-report.json` 为准。该规则包为 Legado 格式，自研 App 需要支持 Legado 规则解释器才能直接执行。\n\n**重要：** AOAOSTAR 的公开书源合集不代表其中每一条规则都由 AOAOSTAR 原创或都可任意复制；上游声明 AGPL-3.0，但各条规则的来源和再分发许可仍需逐条核验。规则镜像不包含小说正文。
