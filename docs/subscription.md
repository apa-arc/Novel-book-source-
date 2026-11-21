# 书源订阅

本仓库提供两个互相隔离的固定订阅入口，供兼容本仓库 Source Format v1 的阅读器读取。

## 普通书源订阅

`https://raw.githubusercontent.com/apa-arc/Novel-book-source-/main/subscription.json`

收录所有非成人书源，不再按男频、女频、漫画、有声等题材拆分。

## 成人书源订阅

`https://raw.githubusercontent.com/apa-arc/Novel-book-source-/main/adult-subscription.json`

成人书源独立索引、独立生成、独立更新，绝不混入普通订阅。

## 发布规则

- 普通订阅只读取 `index.json`；成人订阅只读取 `adult-index.json`。
- 正式书源仅在 `enabled: true` 且通过许可、质量门禁和宿主四接口验证后发布。为进行 App 原生宿主联调，允许显式标记 `testOnly: true`、填写 `testOnlyReason` 的测试源进入普通订阅；它不代表正式验收通过，必须在订阅条目中保留测试标记。
- 扫描目录、候选记录和分类元数据不会自动进入任一订阅。测试源只用于明确的 App 联调，不计入正式可用源数量。
- 两份订阅均只包含书源元数据与解析器地址，不包含 Cookie、账号凭据、令牌或小说正文。
- 推送索引或书源文件后，GitHub Actions 自动重新生成两个订阅清单。

## 当前状态

成人目录中的扫描记录不是可运行书源，也不代表已获授权。只有完成独立审核、适配和测试后，才会登记到 `adult-index.json` 并启用。当前成人订阅可以为空；不会为了凑数量导入未经授权的规则。

## 兼容性

订阅清单提供书源目录与文件地址，不会自动让任意阅读器执行 JavaScript。阅读器需要自行实现本仓库的 Source Format v1 和解析器宿主接口，详见 [书源格式规范](source-format.md)。

本项目只托管书源文件，不提供网站、在线阅读服务或自建服务器。
