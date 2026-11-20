# 书源自动生成器

自动生成器只接受已经完成许可审查的本地 JSON 清单，不会联网抓取或自动复制第三方书源。

## 使用方法

1. 先确认规则有明确的合法使用和分发依据。
2. 准备一个清单 JSON，包含元数据、四组选择器和许可审查证据。
3. 在仓库根目录执行：

```bash
npm run generate-source -- path/to/approved-manifest.json
npm run validate
```

清单结构示例：

```json
{
  "licenseApproved": true,
  "licenseEvidence": "填写许可协议名称、授权内容摘要或自有规则权属说明",
  "licenseType": "open-license",
  "licenseEvidenceUrl": "https://example.com/license",
  "metadata": {
    "id": "my-demo-source",
    "name": "我的示例书源",
    "kind": "public-web",
    "version": "1.0.0",
    "baseUrl": "https://example.com",
    "domains": ["example.com"],
    "categories": ["示例"]
  },
  "selectors": {
    "search": {
      "urlTemplate": "https://example.com/search?q={{keyword}}&page={{page}}",
      "list": { "engine": "css", "query": ".book", "output": "all" },
      "fields": {
        "title": { "engine": "css", "query": ".title", "output": "text" },
        "bookUrl": { "engine": "css", "query": ".title", "output": "href" }
      }
    },
    "bookInfo": { "fields": {} },
    "toc": { "list": { "engine": "css", "query": ".chapter", "output": "all" }, "fields": {} },
    "content": {
      "title": { "engine": "css", "query": "h1", "output": "text" },
      "body": { "engine": "css", "query": ".content", "output": "text" }
    }
  }
}
```

生成结果写入 `sources/<id>.json` 和 `scripts/<id>.js`，默认 `enabled=false`。生成后仍需补齐字段、在目标 App 的真实 DOM 环境测试，并通过授权审查后才能启用。示例域名仅用于说明格式，不是可用书源。

## 批量生成与自动登记

生成器现在支持三种输入方式：

- 单个清单 JSON 文件；
- 一个 JSON 数组，数组中每项都是独立的已审查清单；
- 一个目录，目录内所有 `.json` 清单会按文件名排序后批量处理。

也可以使用包装结构 `{ "sources": [ ... ] }`。例如：

```bash
npm run generate-source -- manifests/
```

每个书源会生成 `sources/<id>.json` 和 `scripts/<id>.js`，并自动追加到 `index.json`。所有清单会先整体校验：只要存在重复 ID、已登记 ID、缺少许可审查、缺少 HTTPS 许可证据链接、许可类型不明确或非法域名，整批就会停止，不会写入部分书源。许可类型仅允许 `self-owned`、`written-permission`、`open-license`、`public-domain`。证据链接必须指向能支持对应权利主张的官方协议、授权文件或权属材料；随意填写网站首页或“公开可访问”不构成许可证明。新源始终以 `enabled=false` 登记。

生成器会先写入新文件，再原子替换索引；写入失败时会清理本批已创建的文件。正式启用前仍须完成真实 App 环境测试与人工审查。
