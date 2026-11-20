# AOAOSTAR 候选规则兼容性复核（第三轮）

- 日期：2026-11-20
- 候选清单：704 条（去重后的元数据队列）
- 工作流：Batch compatibility review for AOAOSTAR candidates
- Run：44741312172
- Commit：a1f55e5af8288100d0974811f72d7f66a4bd1639
- Artifact：aoaostar-conversion-review（ID 14631176423）

## 结果

| 状态 | 第二轮 | 第三轮 |
|---|---:|---:|
| 完全候选 | 0 | 0 |
| 部分兼容 | 300 | 401 |
| 需人工处理 | 404 | 303 |
| 不可用 | 0 | 0 |
| 总数 | 704 | 704 |

本轮部分兼容增加 101 条，人工处理减少 101 条。仍然没有完整候选；部分兼容仅代表中间规则可解析的比例增加，不代表源可运行或已在线验证。

## 字段级未支持原因

| 原因 | 第二轮 | 第三轮 |
|---|---:|---:|
| unsupported-output | 4,218 | 4,217 |
| unsupported-selector-step | 3,516 | 3,204 |
| compound-or-transform-expression | 2,403 | 2,403 |
| empty-selector-chain | 698 | 698 |
| unsupported-xpath | 36 | 36 |

## 本轮解析器改进

- 增加 JSOUP 链式选择器 `text.keyword` 和 `children` 的语法识别。
- 支持 `all` 输出类型。
- 修正无显式索引时的语义：不再错误地默认取第 0 项，而是保留为全部匹配（index=null）。
- 识别规则段前的 `-` 并将其保留为反转标记。
- 增加上述语法的回归测试。
- Validate 与 704 条 batch-review 均通过，fetchFailures 为 0。

## 尚未完成

- 0 条达到完整候选门槛。
- Selector IR 不是可运行适配器；当前仅记录语法和选择器中间表示。
- 负索引、排除索引、区间/多选、复杂 XPath、JSONPath、正则替换、组合表达式仍未完整支持。
- 未执行目标网站的搜索、详情、目录、正文端到端测试。
- 仍须逐项核实上游 AGPL-3.0 与每条源的许可、来源和再分发条件。

## 下一轮

优先分析剩余 unsupported-selector-step 的语法分布，再决定是否实现索引筛选/排除语法；同时分析 unsupported-output 中的具体输出类型。保持未知语法人工审核，不做猜测性转换。
