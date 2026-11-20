# 中文维基文库古典作品适配候选

- 来源主页：https://zh.wikisource.org/
- 示例作品：《三国演义》：https://zh.wikisource.org/zh-hans/三國志演義
- 示例章节：https://zh.wikisource.org/zh-hans/三國演義/第001回
- 版权政策：https://zh.wikisource.org/wiki/Wikisource:版权信息/全文

## 当前能力

适配器实现搜索、作品详情、目录章节链接提取和章节正文提取四个接口。它只通过阅读器注入的 `http.get` 请求页面，并限制在 `zh.wikisource.org` 域名。

## 版权与状态

该适配器是禁用候选（`enabled: false`），不是正式可用书源。维基文库收录内容包含公有领域作品及特定许可作品；必须逐项检查作品页面的版权标记和使用地区，不能因站点总体政策而推断每一篇作品均可任意使用。该项目当前没有内置作品级版权过滤。

## 验证边界

仓库测试使用模拟 DOM fixture，验证四个接口、URL 白名单和基本解析流程。尚未在目标 iPhone 阅读器的真实 HTML DOM 实现中完成联调，也未进行在线端到端运行测试。只有完成这两项并确认作品级许可后，才可考虑启用并发布到订阅清单。
