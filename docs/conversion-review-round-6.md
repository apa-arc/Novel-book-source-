# AOAOSTAR 候选规则兼容性复核（第六轮）

- 日期：2026-11-20
- 候选清单：704 条（去重后的元数据队列）
- 工作流：Batch compatibility review for AOAOSTAR candidates
- Run：44741853020
- Commit：b809aa5362cac76204af4c33a009897457978f10
- Artifact：aoaostar-conversion-review（ID 14630837672）

## 结果

| 状态 | 第四轮 | 第五轮 | 第六轮 |
|---|---:|---:|---:|
| 完整规则候选 | 9 | 9 | 9 |
| 部分兼容 | 638 | 642 | 642 |
| 需人工处理 | 57 | 53 | 53 |
| 不可用 | 0 | 0 | 0 |
| 总数 | 704 | 704 | 704 |

第五轮新增结构化索引表示：单索引、显式索引列表、排除列表、区间/步长，以及隐式 children 索引（如 `head@.1`、`head@[1]`）。相较第四轮，4 条记录由人工处理提升为部分兼容。

第六轮没有改变兼容状态数量；本轮修正的是诊断分类：把不符合已知索引语法的方括号规则归类为 `unsupported-attribute-filter`，避免误称为索引过滤器。

## 字段级未支持原因（第六轮）

| 原因 | 数量 |
|---|---:|
| compound-or-transform-expression | 2,403 |
| unsupported-jsonpath | 1,004 |
| unsupported-attribute-filter | 880 |
| empty-selector-chain | 698 |
| unsupported-selector-step | 149 |
| unsupported-xpath | 36 |
| invalid-selector-index | 1 |

## 验证情况

- 704/704 条进入报告。
- fetchFailures：0。
- validate 工作流成功：44741853041。
- batch-review 工作流成功：44741853020。
- 索引筛选解析有自动化回归测试。
- 9 条完整规则候选仍只是静态 Selector IR，不是运行适配器，也未做端到端网站测试。

## 下一轮

1. 处理 2,403 条组合/正则变换规则，先区分 `&&`、`||`、`%%` 与 `##` 净化规则，不做有损转换。
2. 评估 JSONPath 与 XPath 的安全解析子集。
3. 逐项审核 9 条完整规则候选的许可、来源、站点访问条件，再开展实际测试。
