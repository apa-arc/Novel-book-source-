# 选择器执行引擎（第一阶段）

`runtime/selector-engine.js` 是独立的、无网络能力的 JavaScript 选择器执行模块。它只接收调用方提供的 DOM 根节点和已解析的 Selector IR；不负责下载网页，不执行上游脚本，也不接触 Cookie、账号或文件系统。

## 当前支持

- `legado-chain` 的有限 IR：`tag`、`class`、`id`、`text`、`children`。
- 单索引（含负索引）、多索引、排除索引、正向区间和步长。
- 反转。
- 输出：`text`、`textNodes`、`ownText`、`html`、`href`、`src`、`content`、受限名称的 `attr:name`、`all`。
- `css` 引擎：将受限长度的 CSS 查询交给调用方提供的 DOM `querySelectorAll`。

## 限制与安全边界

- 最多 32 个链式步骤、单次最多 5,000 个匹配、CSS 查询最多 2,048 字符。
- 只允许已知 IR 步骤类型；未知类型直接报错。
- 不提供 fetch、eval、Function、文件系统、Cookie 或任意网络 API。
- CSS 查询必须由宿主 DOM 实现解析；宿主应进一步限制查询复杂度和执行时间。
- 当前测试使用小型 DOM fixture，不等同于真实浏览器/Swift HTML 解析器兼容测试。
- 该模块尚未接入 AppleNovelApp，也没有证明与 Legado 全部细节行为一致。组合表达式、正则变换、XPath、JSONPath、分页请求模板仍不支持。

## 本地测试

```bash
npm test
npm run validate
```

下一阶段应将相同的输入/输出契约接到 iOS 端的隔离 HTML DOM 实现，再用自建或明确授权的 HTML fixtures 做跨运行时一致性测试。
