# AOAOSTAR 候选规则兼容性复核（第二轮）

- 日期：2026-11-20
- 候选清单：704 条（去重后的元数据队列）
- 工作流：Batch compatibility review for AOAOSTAR candidates
- Run：44740381989
- Commit：2ea6a04906972ca0ee91fad165a87f237e949c81
- Artifact：aoaostar-conversion-review（ID 14629859209）

## 结果

| 状态 | 第一轮 | 第二轮 |
|---|---:|---:|
| 完全候选（四组核心规则均可解析且无警告） | 0 | 0 |
| 部分兼容 | 296 | 300 |
| 需人工处理 | 408 | 404 |
| 不可用 | 0 | 0 |
| 总数 | 704 | 704 |

本轮增加 4 条部分兼容记录；没有产生完全候选。部分兼容不代表可以运行或已在线验证。

## 当前字段级未支持原因

| 原因 | 数量 |
|---|---:|
| unsupported-output | 4,218 |
| unsupported-selector-step | 3,516 |
| compound-or-transform-expression | 2,403 |
| empty-selector-chain | 698 |
| unsupported-xpath | 36 |

## 本轮转换器调整

- 扩展链式规则输出类型：ownText、textNodes。
- 修复 class/id/tag 选择器名称包含点号时的解析，并保留末尾数字索引。
- 增加针对点号名称、文本输出类型和索引的回归测试。
- GitHub Actions 的 validate 和 batch-review 均成功；批量报告包含 704 条，fetchFailures 为 0。

## 尚未完成

- 0 条达到完整候选门槛。
- Selector IR 只是中间表示，不是可运行适配器。
- 尚未执行目标网站的搜索、详情、目录、正文端到端测试。
- 对登录、Cookie、请求头、脚本、付费/验证码等情况继续保持人工审核，不自动执行或迁移凭据。
- 上游 AGPL-3.0 及各条书源的来源和再分发许可仍需逐项核实。

## 下一轮优先级

1. 先细分 unsupported-selector-step 的具体语法类别，避免猜测并错误放宽解析。
2. 再针对有明确语义依据的静态选择器/输出类型扩展测试。
3. 对 compound/transform 只支持能无损表达的子集，其余保留人工处理。
4. 每次修改后重新跑完整 704 条，保留可比较的批次报告。
