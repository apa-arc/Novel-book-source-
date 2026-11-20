# AOAOSTAR / 阅读书源兼容方案

## 调研结论

AOAOSTAR（https://legado.aoaostar.com/）是「阅读」App 的书源、订阅源、主题和排版配置仓库，不是单一小说内容网站。其 GitHub 项目 README 列出了全量书源及多个分类书源；全量书源文件在其发布页中标注为数千条。

「阅读」书源 JSON 与本仓库的轻量元数据格式不是同一种协议。典型「阅读」书源会包含：
- `bookSourceName`、`bookSourceUrl`、`bookSourceGroup`
- `searchUrl`、`exploreUrl`、`ruleSearch`、`ruleBookInfo`、`ruleToc`、`ruleContent`
- 请求头、Cookie 开关、登录/网页访问相关配置
- 部分规则可能依赖「阅读」App 自己的规则引擎、变量、脚本扩展或运行时行为

因此不能把 AOAOSTAR 的 JSON 直接当成本仓库的 source.json，也不能保证所有规则原样迁移后可运行。

## 本项目的兼容策略

1. **先做格式识别与只读导入**：识别「阅读」书源 JSON，展示来源名称、网址、分组、规则字段是否存在。
2. **再做规则子集转换**：仅转换已明确支持的静态 URL 模板、CSS/XPath 选择器和常见字段映射。
3. **复杂规则标记为待适配**：涉及动态脚本、登录态、Cookie、复杂变量、加密/签名请求或平台访问控制的条目，不自动执行、不承诺自动转换。
4. **逐条测试后启用**：转换结果进入本项目自己的 source schema，必须通过校验和端到端测试。
5. **尊重来源许可**：记录原始来源与许可证/授权信息；不镜像未经许可的内容或凭据，不绕过付费、登录、验证码或 DRM。

## 当前优先级

- P0：阅读书源 JSON 文件解析器（只读、无网络请求、无脚本执行）。
- P1：书源字段分析报告与兼容度分级。
- P2：支持一小部分常见静态规则的转换器。
- P3：在 AppleNovelApp 中实现受限的规则执行/HTTP 桥接。
- P4：逐个站点验收搜索、详情、目录、正文和朗读链路。

## 参考

- AOAOSTAR 资源页：https://legado.aoaostar.com/
- AOAOSTAR 仓库说明：https://github.com/aoaostar/legado
- 全量书源文件：https://legado.aoaostar.com/sources/b778fe6b.json
