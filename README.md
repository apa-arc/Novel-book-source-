# Apple Novel Sources

个人 iPhone 小说阅读器的独立书源仓库，采用 JSON 元数据 + JavaScript 解析器。

## 目录结构

```text
.
├── sources/                 # JSON 书源定义
├── scripts/                 # JavaScript 解析器
├── schemas/                 # JSON Schema
├── index.json               # 书源索引
├── package.json             # 校验工具配置
└── README.md
```

## 书源设计

- JSON 负责书源元数据、入口和解析器引用。
- JavaScript 负责搜索、详情、目录和章节正文解析。
- App 端只加载受信任、经过校验的脚本；脚本执行必须隔离并设置网络域名白名单、超时和资源限制。
- 仅接入有权访问且允许自动化访问的站点；不在仓库托管未经授权的小说正文。

## 状态

当前为仓库初始化阶段，接口契约与校验流程先行，具体网站适配器后续逐个开发和测试。
