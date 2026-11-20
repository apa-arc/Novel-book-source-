# 个人小说书源仓库

这是一个独立的书源文件仓库，专门用于整理、维护和分发可由阅读 App 导入的书源配置。

**本项目只做书源，不开发或托管小说网站、在线阅读平台、用户系统或服务器服务。**

## 书源中心（统一入口）

| 入口 | 用途 |
|---|---|
| [书源订阅地址](subscription.json) | 阅读器添加此链接即可获取已启用书源 |\n| [中文维基文库适配候选](docs/zh-wikisource-classics.md) | 首个古典作品来源适配器及验证边界 |\n| [书源总索引](index.json) | 查看当前登记的书源及启用状态 |
| [全部扫描元数据（5152 条）](imports/aoaostar/public-catalog.json) | 浏览去重后的来源目录 |
| [704 条候选转换进度](imports/aoaostar/conversion-status.json) | 查看候选转换状态与诊断统计 |
| [书源格式规范](docs/source-format.md) | 查看 JSON 与解析器接口标准 |\n| [订阅说明](docs/subscription.md) | 查看固定订阅地址、更新规则与兼容要求 |
| [书源自动生成器](docs/source-generator.md) | 从已审查的规则清单生成书源文件 |
| [运行时与解析器说明](scripts/README.md) | 查看运行接口和限制 |
| [选择器引擎说明](docs/selector-engine.md) | 查看支持的选择器能力 |
| [GitHub 自动检查记录](https://github.com/apa-arc/Novel-book-source-/actions) | 查看每次校验结果 |

## 书源格式

书源由 JSON 元数据和 JavaScript 解析器组成。字段、解析器方法和统一返回结构见 [书源文件格式规范](docs/source-format.md)。

## 仓库内容

- `sources/`：书源 JSON 配置
- `index.json`：书源总索引
- `schemas/`：书源格式结构定义
- `runtime/`：独立选择器执行模块
- `scripts/`：扫描、去重、格式转换和校验工具
- `imports/`：扫描目录、批次计划和审查记录；[查看 5152 条去重元数据目录](imports/aoaostar/public-catalog.json)
- `docs/`：书源格式、兼容性和开发说明
- `.github/workflows/`：自动校验

## 安全与来源要求

- 只收录具有合法使用和分发依据的书源。
- 不公开复制未经许可的第三方规则、Cookie、账号凭据或令牌。
- 不绕过登录、付费墙、验证码或 DRM。
- 不将未经授权的小说正文提交到仓库。

## 当前进度

已完成上游集合结构扫描、去重统计、格式分析、批次转换审查、JSON 索引与模板、无网络选择器执行模块、通用书源适配器及许可审查清单驱动的书源生成器。

扫描候选和静态转换结果不等于已授权或已验证可用的正式书源。正式书源须逐个完成许可审查、结构校验和阅读 App 兼容测试。
