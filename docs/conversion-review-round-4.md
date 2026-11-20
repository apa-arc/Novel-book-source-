# AOAOSTAR 候选规则兼容性复核（第四轮）

- 日期：2026-11-20
- 候选清单：704 条（去重后的元数据队列）
- 工作流：Batch compatibility review for AOAOSTAR candidates
- Run：44741592568
- Commit：ddcad180c70af585c8678a34583034886fd8b5c4
- Artifact：aoaostar-conversion-review（ID 14631530881）

## 结果

| 状态 | 第三轮 | 第四轮 |
|---|---:|---:|
| 完整规则候选（四组核心规则都能解析且无警告） | 0 | 9 |
| 部分兼容 | 401 | 638 |
| 需人工处理 | 303 | 57 |
| 不可用 | 0 | 0 |
| 总数 | 704 | 704 |

本轮将 246 条从人工处理提升为部分兼容，并识别出 9 条达到“规则完整候选”门槛的源。完整候选只是静态语法解析结果，不是运行成功或授权结论。

## 未支持字段原因

| 原因 | 数量 |
|---|---:|
| compound-or-transform-expression | 2,403 |
| unsupported-jsonpath | 1,004 |
| empty-selector-chain | 698 |
| unsupported-selector-step | 149 |
| unsupported-index-filter | 114 |
| unsupported-xpath | 36 |
| invalid-selector-index | 1 |

不再出现 unsupported-output 统计，原因是解析器现在把未识别的末段按默认文本输出规则继续作为选择器段处理；这避免了把普通 HTML 标签误判为输出类型。

## 本轮解析器改进

- 支持裸 HTML 标签链，例如 `div@a@text`、`a@href`。
- 最后一个段只有在属于明确输出类型时才作为输出；否则默认输出 `text`。
- 增加 `@xpath:` 和 `@json:` / JSONPath 的明确人工处理分类。
- 对不支持的语法只记录受限的语法 token 分类，不保存原始规则表达式、请求头、Cookie 或凭据。
- 回归测试、validate 和 704 条 batch-review 均成功，fetchFailures 为 0。

## 下一步优先级

1. 解析 114 条索引筛选/排除规则，先支持可无损表达的子集。
2. 拆分 2,403 条组合/正则转换表达式，保留不能等价转换的规则为人工处理。
3. 评估 JSONPath 与 XPath 是否需要独立安全解析器。
4. 对 9 条完整候选进行逐条人工审查、许可核实和实际网站测试，再决定是否生成运行适配器。

## 重要边界

- Selector IR 不是可运行适配器。
- 9 条完整规则候选尚未经过端到端网络测试。
- 仍需逐项核实 Legado 上游 AGPL-3.0 与各条源自身的许可、来源和再分发条件。
- 不绕过登录、付费墙、验证码、DRM，不迁移 Cookie 或账号凭据。
