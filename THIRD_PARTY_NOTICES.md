# Third-Party Notices

本项目的部分设计与逻辑参考了 `dsh-zotero`（MIT License）：

- 上游仓库：https://github.com/Vncntvx/dsh-zotero
- 审计固定 commit：`0ad6f59e3943afc82418360dbcc8dd8cb7e11ede`
- 参考范围：Zotero Local API 传输契约（API 版本头、Server-ID 身份保护、
  响应体字节上限、状态翻译）、`research_*` 工具的数据模型、BM25 证据排序
  与身份匹配优先级。
- 适配方式：重写为独立 DSH bundle；不复制私有路由、宿主 pin 与客户端 UI 组件。

保留上游版权声明：

```
MIT License

Copyright (c) 2025 Wenjie Xu
```
