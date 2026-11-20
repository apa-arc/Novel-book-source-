# 书源订阅

本仓库提供固定订阅入口，供兼容本仓库 Source Format v1 的阅读器读取。

## 订阅地址

`https://raw.githubusercontent.com/apa-arc/Novel-book-source-/main/subscription.json`

## 订阅内容

- 仅发布 `index.json` 中 `enabled: true` 的正式书源。
- 每项提供元数据地址和解析器脚本地址，均指向本仓库的 raw 文件。
- 模板、未验证候选、未启用书源不会进入订阅列表。
- 订阅清单不包含 Cookie、账号凭据、令牌或小说正文。
- 仓库推送后由 GitHub Actions 自动重新生成订阅清单。

## 兼容性

订阅清单提供书源目录与文件地址，不会自动让任意阅读器执行 JavaScript。阅读器需要自行实现本仓库的 Source Format v1 和解析器宿主接口，详见 [书源格式规范](source-format.md)。

本项目只托管书源文件，不提供网站、在线阅读服务或自建服务器。
