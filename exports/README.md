# AOAOSTAR 规则镜像导出

本目录由 `scripts/import-aoaostar-rules.js` 从 AOAOSTAR/Legado 全量书源快照生成。

## 可直接获取的规则包

- 普通网络小说规则包：<https://raw.githubusercontent.com/apa-arc/Novel-book-source-/main/exports/legado-ordinary.json>
- 成人网络小说规则包：<https://raw.githubusercontent.com/apa-arc/Novel-book-source-/main/exports/legado-adult.json>
- 导入统计：`aoaostar-import-report.json`

当前快照统计（以报告文件为准）：
- 上游记录：3907
- 普通网络小说规则：2911
- 成人网络小说规则：77
- 排除非小说/古籍/漫画/有声等：223
- 缺少搜索、详情、目录、正文任一核心规则：695

## 格式与兼容性

这两个 JSON 保留 Legado 原始规则字段（`ruleSearch`、`ruleBookInfo`、`ruleToc`、`ruleContent` 等），属于 **Legado 书源格式**。它们可供支持 Legado 书源格式的阅读器导入；自研 iOS App 若没有实现 Legado 规则解释器，不能仅凭订阅 URL 就执行这些规则。后续需要在 App 侧实现兼容层，或将规则逐批转换成 App 原生适配器。

导出过程不会执行任何书源脚本。登录界面/登录校验、Cookie Jar 和敏感认证请求头会被移除；依赖这些凭据的书源默认禁用。其他原始规则表达式保留为数据。

## 更新

GitHub Actions 每日同步 AOAOSTAR 的全量书源快照，并重新生成普通/成人规则包。快照保存在 `imports/aoaostar/raw/aoaostar-full.json`，不需要运行时访问 AOAOSTAR。

## 来源与说明

上游：<https://github.com/aoaostar/legado>  
上游全量书源：<https://github.com/aoaostar/legado/blob/release/sources/b778fe6b.json>

上游仓库声明 AGPL-3.0；各条书源规则的作者和独立再分发许可尚未逐条核验。此镜像保留来源说明，不包含小说正文。请按上游许可证及各站点规则使用。
