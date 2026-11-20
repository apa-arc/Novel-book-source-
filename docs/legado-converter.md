# Legado 规则转换器（第一版）

本工具把 Legado 规则中可识别的静态选择器转换为中间表示（Selector IR），供后续编写 iPhone App 适配器使用。

## 运行

    node scripts/convert-legado-rules.js ./合法取得的书源.json --output=./reports/selector-ir.json

支持输入单个书源对象或书源数组。转换器只读取本地 JSON，不访问网站、不执行规则，也不导入 Cookie 或请求头值。

## 第一版支持范围

- `class.name.0@tag.a.0@text` 形式的静态链式选择器。
- `id.name.0@tag.a.0@href` 形式的静态链式选择器。
- `tag.name.0@src` 等简单字段。
- `@css:` 后跟静态 CSS selector，并可选择 `@text`、`@html`、`@href`、`@src`。
- 简单 XPath：`//meta[@property='og:title']/@content`，转换为 CSS selector + 属性读取。

## 明确不自动转换

- `@js:`、`<js>`、脚本和模板表达式。
- `##` 正则替换、`&&` 多规则合并、`||` 等复合表达式。
- 复杂 XPath、动态 URL、请求体模板、登录、Cookie、鉴权头。
- 任何需要执行 Legado 专有表达式的规则。

遇到不支持语法时，字段会保留原表达式并标记 `manual`，不会猜测转换。

## 状态含义

- `candidate`：字段可解析为静态选择器中间表示，不代表网站可用。
- `partial`：部分字段可解析，或来源含有需要单独审核的配置。
- `manual`：没有可自动识别的规则组，或需人工处理。

Selector IR 不是可运行书源。只有实现 App 端选择器执行器、补齐请求定义、通过网站访问授权审查并完成真实搜索/详情/目录/正文测试后，才能标记为可用。
