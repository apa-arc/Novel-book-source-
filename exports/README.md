# 小说书源订阅导出

本目录由 `scripts/import-aoaostar-rules.js` 生成：以 AOAOSTAR/Legado 为主，并合并经过第三方完整阅读验证、且通过本仓库凭据安全筛选的普通小说源。

## 正式订阅入口

以下两个仓库根目录链接现已作为稳定订阅地址，内容为 Legado 原生 JSON 数组，可直接导入支持 Legado 书源格式的阅读器：

- 普通订阅：<https://raw.githubusercontent.com/apa-arc/Novel-book-source-/main/subscription.json>
- 成人订阅：<https://raw.githubusercontent.com/apa-arc/Novel-book-source-/main/adult-subscription.json>

其中 App 原生清单另存为 `app-subscription.json` 和 `adult-app-subscription.json`，只收录通过本仓库自定义质量门禁的适配源；不会把未经实测的 Legado 规则冒充 App 原生源。

## 可直接获取的镜像规则包

- 普通网络小说规则包：<https://raw.githubusercontent.com/apa-arc/Novel-book-source-/main/exports/legado-ordinary.json>
- 成人网络小说规则包：<https://raw.githubusercontent.com/apa-arc/Novel-book-source-/main/exports/legado-adult.json>
- 导入统计：`aoaostar-import-report.json`

当前数量以 `aoaostar-import-report.json` 中的 `stats` 为准：
- `ordinary`：普通订阅总条目（含通过筛选的第三方已验证源）
- `adult`：成人独立订阅条目
- `thirdPartyVerifiedAdded`：本轮实际新增的第三方已验证源
- `thirdPartyVerifiedDuplicates`：与现有普通订阅重复、未重复加入的第三方源
- AOAOSTAR 原始扫描、去重、非小说排除、核心规则缺失和凭据禁用数量也记录在同一报告中。

## 第三方已验证源

另从 [tickmao/Novel](https://github.com/tickmao/Novel) 的 Legado 发布包中筛选安全子集，保留原始 Legado 规则。上游当前发布的健康集为 310 条；本仓库只选取其中当前深度检查有效、内容审核通过、无登录/Cookie Jar/动态或敏感请求头、无非小说类型的安全源，并在与 AOAOSTAR 去重后合并到普通订阅。未验证候选和 37 条 legacy/reserve 不会导入。

- 安全子集：`imports/third-party/tickmao/verified-safe.json`
- 验证来源、引擎指纹、筛选及去重统计：`imports/third-party/tickmao/validation-manifest.json`
- 上游 MIT 许可证、作者致谢及非商业使用声明：`imports/third-party/tickmao/`

上游使用 Legado JVM 引擎进行真实搜索、书籍详情、目录和章节正文检查；本仓库保留其引擎版本和验证指纹。上游七日连续验收在快照时仍为 pending，因此这不是长期稳定性保证。原始书源版权仍归各自作者；该合集按上游声明仅作非商业个人学习交流用途。

## 格式与兼容性

这两个 JSON 保留 Legado 原始规则字段（`ruleSearch`、`ruleBookInfo`、`ruleToc`、`ruleContent` 等），属于 **Legado 书源格式**。它们可供支持 Legado 书源格式的阅读器导入；自研 iOS App 若没有实现 Legado 规则解释器，不能仅凭订阅 URL 就执行这些规则。后续需要在 App 侧实现兼容层，或将规则逐批转换成 App 原生适配器。

导出过程不会执行任何书源脚本。登录界面/登录校验、Cookie Jar 和敏感认证请求头会被移除；依赖这些凭据的书源默认禁用。其他原始规则表达式保留为数据。

## 更新

GitHub Actions 每日同步 AOAOSTAR 的全量书源快照，并重新生成普通/成人规则包。快照保存在 `imports/aoaostar/raw/aoaostar-full.json`，不需要运行时访问 AOAOSTAR。

## 来源与说明

上游：<https://github.com/aoaostar/legado>  
上游全量书源：<https://github.com/aoaostar/legado/blob/release/sources/b778fe6b.json>

上游仓库声明 AGPL-3.0；各条书源规则的作者和独立再分发许可尚未逐条核验。此镜像保留来源说明，不包含小说正文。请按上游许可证及各站点规则使用。
