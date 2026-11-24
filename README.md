# Agentero Zotero Patch

把 **Zotero 本地文献库**以只读方式接入 **Agentero / DSH 科研工作流**的独立 DSH bundle 插件。

它向 DSH 注册一组 `research_*` 工具，让 Agent 能搜索 Zotero 条目、读取元数据与附件、在 PDF 全文中检索可回溯到页码的证据片段、导出引用格式，并把一次会话中“读过哪些文献、用了哪些证据、做过哪些导出”记录成 Sources 轨迹。

```
Agent ──research_* 工具──> 本插件 ──Local API(loopback 23119)──> Zotero 10 桌面端
                                  └──可选桥接──> agentero-host / agentero-library
```

## 为什么需要它

Agentero Vault 管理 Agentero 自己的文献、笔记与 PDF；Zotero 是很多研究者另一套独立的文献库。过去这两者之间没有可用的工具通道——Agent 既看不到 Zotero 里的条目，也无法引用其中的证据。

本插件补上这条通道，但刻意保持克制：

- **只读**：第一阶段只读取 Zotero，写入与双向同步都明确排除在本项目范围之外。
- **数据所有权不合并**：统一展示不等于合并数据库。每条结果都保留 `source`（`zotero` / `agentero`）和原生 `sourceId`，原始记录各自独立。
- **不强依赖 agentero**：即使只装本插件、没装 agentero-dsh，全部 Zotero 能力照常可用。
- **不修改 agentero 源码**：见下一节。

## 它是什么 / 不是什么

**一个容易误解的点**：`cordis.patch.yml` 里的 `insert` 语义是“向 DSH 运行时 composition 插入本插件的组件行”，**不是**“给 `agentero-dsh` 打补丁”。

因此：

| 本插件 | 不是 |
| --- | --- |
| 独立安装、独立挂载的 DSH bundle | `agentero-dsh` 的源码补丁或 fork |
| 与 `agentero-dsh` 并列运行 | 重写 / 替换 `agentero-dsh` 的文献能力 |
| 通过 `ctx` 可选探测 agentero 服务来复用能力 | import `agentero-dsh-*` 包、产生版本 pin 依赖 |
| 安装顺序无关的纯 Zotero 只读增强 | 需要 agentero 存在才能工作的附属组件 |

同理，它也不要求你并行安装 `dsh-zotero`。`dsh-zotero`（MIT，固定 commit `0ad6f59…`）只在开发阶段作为真实库联调参考，其传输契约与数据模型的设计要点已在 `THIRD_PARTY_NOTICES.md` 中声明。

## 功能一览

### 九个 `research_*` 工具

只注册 `research_*`，**不注册 `zotero_*` 别名**，避免与 `dsh-zotero` 的工具名冲突。

| 工具 | 作用 |
| --- | --- |
| `research_search` | 搜索文献库，默认只返回顶层父条目（排除附件/笔记/批注混入）；支持关键词、标签、合集筛选与 `qmode=everything` 全文召回 |
| `research_get` | 按 Zotero key 读取单条文献元数据 |
| `research_get_batch` | 批量读取，逐条报告成功或失败 |
| `research_browse` | 浏览合集与标签 |
| `research_children` | 读取条目的附件、笔记或批注子条目 |
| `research_retrieve` | 在附件全文中检索证据片段，返回可回溯到附件与页码的结果（BM25 排序） |
| `research_export` | 导出 citation / bibtex / biblatex / ris / csljson |
| `research_match_references` | 按 DOI → arXiv ID / PMID → 标题+作者+年份 的优先级匹配参考文献 |
| `research_changes` | 按游标读取文献库增量变更 |

所有工具都接受可选参数 `source`：`"zotero"` / `"agentero"`，省略则跨库。当 agentero 未安装却显式指定 `source: "agentero"` 时，会明确报错 `ZOTERO_PATCH_AGENTERO_UNAVAILABLE`，**不会静默改走 Zotero**。

### Sources 会话轨迹

`zotero-patch-sources` 组件旁路折叠会话事件，以 `event.id` 去重保证幂等。它输出一个窗口化视图：

```ts
{
  sources: PaperReference[],
  totalSources: number,
  exports: string[],
  queries: string[]
}
```

用途：会话结束后可以还原“这次研究读过哪些文献、跑过哪些查询、导出过什么”。

### 可选的 agentero 桥接

`zotero-patch-bridge` 在挂载时探测 `ctx` 上的 `agentero-host` 与 `agentero-library`。

- **探测成功**：Zotero 来源文献的证据与附件展示可复用 agentero 已有的 PDF/笔记能力。
- **探测失败**：走最小只读回退——元数据、合集、标签、全文与批注检索、证据片段（文本 + 页码 + 附件定位）、引用导出全部由本插件自有端点返回；只是不提供 PDF 阅读器 UI 与笔记写入。

### 默认关闭的高级能力

两个阶段 5 组件默认不启用，需显式打开且各有授权边界：

- `zotero-patch-scholarly`：外部学术检索，受出口白名单约束。
- `zotero-patch-enrichment`：文档解析 / 语义排序；语义模型缺失时**显式报错，不静默回退 BM25**。

## 目录结构

```
agentero-zotero-patch/
├── src/
│   ├── index.ts          # 主入口：apply(ctx, config)，注册工具与服务
│   ├── tools.ts          # 唯一的 DSH 适配层，注册 9 个 research_* 工具
│   ├── handlers.ts       # 九个工具的纯函数实现（不依赖 DSH）
│   ├── transport.ts      # Zotero Local API 唯一网络出口
│   ├── types.ts          # 统一数据模型 PaperReference / EvidenceSnippet
│   ├── errors.ts         # 统一错误码
│   ├── search.ts / detail.ts / browse.ts / children.ts
│   ├── retrieve.ts       # 全文分块 + BM25 证据排序
│   ├── export.ts         # 五种引用格式
│   ├── match.ts          # 身份匹配三优先级
│   ├── changes.ts        # 增量变更游标
│   ├── sources.ts        # Sources 事件折叠
│   ├── unified.ts        # 跨库路由与统一展示
│   ├── bridge.ts         # agentero 可选探测与 adapter 注入
│   ├── scholarly.ts / enrichment.ts   # 阶段 5，默认关闭
│   └── *-entry.ts        # 子入口（bridge / sources）
├── tests/                # 25 个 node:test 测试
├── scripts/
│   ├── node.sh           # 项目内 Node 24 入口（Git Bash）
│   ├── npm.cmd           # 项目内 npm 入口（Windows CMD）
│   └── verify-zotero.mjs # 真实 Zotero 联调冒烟脚本
├── docs/
│   ├── toolchain.md      # Node 24 版本与 SHA256
│   └── superpowers/
│       ├── specs/        # 设计规格
│       └── plans/        # 5 阶段实施计划
├── cordis.patch.yml      # DSH composition 挂载清单
├── THIRD_PARTY_NOTICES.md
├── tsconfig.json
└── package.json
```

## 环境要求

| 依赖 | 版本 | 说明 |
| --- | --- | --- |
| Node | `>= 24.15.0` | 项目内自带 `v24.22.3`，**不覆盖系统 Node**；入口见 `scripts/node.sh` / `scripts/npm.cmd` |
| DSH | `>=0.2.2-rc.4 <0.3.0` | 本机实测 `0.2.2-rc.5` |
| Zotero | 10.x | 本机实测 `10.0.8`，需开启本地 API |
| Zotero Local API | `http://127.0.0.1:23119/api` | 仅 loopback；需 API v3 头与 Server-ID 回传 |

**Zotero 侧准备**：安装并启动 Zotero 10，在 `设置 → 高级 → 允许其他应用与此应用通信`（等价配置 `extensions.zotero.httpServer.localAPI.enabled = true`）开启本地 API。访问 `http://127.0.0.1:23119/api/` 应返回 200，并带 `Zotero-API-Version: 3` 与 `Zotero-Server-ID` 响应头。

## 安装为一个 DSH bundle

本机采用 desktop profile 的 `link:` 方式安装（profile 路径以本机 `D:/ai-configs/runtime/dsh/profiles/desktop` 为例）：

1. **确认构建产物**：`lib/index.js` 等已生成（首次安装前先跑 `npm run build`，或 `npm pack` 走正式分发）。
2. **加入依赖**：编辑 profile 的 `package.json`，在 `dependencies` 加：
   ```json
   "agentero-zotero-patch": "link:D:/agentero-zotero-patch"
   ```
3. **加入 bundles**：在同一文件的 `dsh.profile.bundles` 数组加 `"agentero-zotero-patch"`。
   > DSH CLI 的 `dsh plugin add` 会自动加 dependency，但**不会**自动加 bundles，这一步必须手工补。
4. **建立 junction**：若 CLI 未自动建链接，手工创建
   `profiles/desktop/node_modules/agentero-zotero-patch` → `D:\agentero-zotero-patch`（Windows junction）。
5. **重启 DSH**，检查 `boot-state/boot-state.json` 中 `ok: true` 且 `crashReason: null`。

安装前建议备份 profile 的 `package.json`。本插件与 `agentero-dsh` 并列挂载，两者互不影响。

## 开发与验证

所有命令都走项目内 Node 24，避免系统 PATH 上的 v22：

```bash
cd D:/agentero-zotero-patch

# 安装依赖
./scripts/node.sh .node24/runtime/node_modules/npm/bin/npm-cli.js install

# 类型检查
./scripts/node.sh .node24/runtime/node_modules/npm/bin/npm-cli.js run typecheck

# 构建 + 25 个单元测试
./scripts/node.sh .node24/runtime/node_modules/npm/bin/npm-cli.js test

# 真实 Zotero 联调冒烟（需 Zotero 已启动并开启本地 API）
./scripts/node.sh scripts/verify-zotero.mjs
```

Windows CMD 下可改用 `scripts\npm.cmd`（例如 `scripts\npm.cmd test`）。

`verify-zotero.mjs` 会实测 API 版本头、Server-ID 回传、流式字节上限、状态翻译、顶层父条目、PDF 全文、批注、合集与标签，是 transport 契约的回归保护。

## 已验证结果

- **25 / 25** 单元测试通过（transport、normalize、search、handlers、retrieve、match、export、changes、sources、unified、bridge、scholarly）。
- **11 / 11** 真实 Zotero 联调检查通过；PDF 全文抽取实测 58875 字符。
- 本地加载路径模拟 `apply()` 确认：9 个工具全部注册、`ctx.zoteroPatch` 正确挂载、dispose 正常清理。
- DSH desktop profile 重启后 boot-state `ok: true`，bundle 条目与 junction 均存活。
- 远端公开仓库：<https://github.com/Swcmb/agentero-zotero-patch>

## 安全边界

- 网络出口只接受 loopback `127.0.0.1:23119` / `localhost:23119`；拒绝重定向；附件路径限定在 Zotero 返回的合法范围内。
- 每个请求携带 `zotero-api-version: 3`，并记住 / 回传 `zotero-server-id`；服务端实例变化（`412`）立即报错 `ZOTERO_PATCH_SERVER_MISMATCH`，防止串库。
- 响应体流式读取，**16 MiB 字节上限**，超限报 `ZOTERO_PATCH_RESPONSE_TOO_LARGE`。
- 只读设计：没有写工具；写权限不继承 agentero 授权；不引入任意 Shell 执行能力。
- 统一展示保留原始来源与原生 ID，不合并、不覆盖任一边的数据库。

## 已知限制

- **DSH 运行时工具注册无法直接 introspect**：web API 需要启动 token，DevTools port 不可用，`/__ctx-bili/status` 只能确认服务存活。已用本地加载路径模拟 `apply()` 覆盖该验证点，但这不等同于在生产运行时逐条调用工具。
- **阶段 4 的 UI 复用**：数据 / 服务层已完成，UI 计划复用 agentero 现有 library 面板，未移植 dsh-zotero 客户端组件。
- **写入与双向同步**：明确在范围外，未实现。
- `package.json` 的 `files` 列表包含 `LICENSE`，但仓库中尚未放置独立的 LICENSE 文件；许可为 MIT，详见下节与 `THIRD_PARTY_NOTICES.md`。

## 许可与致谢

- 本项目：MIT License。
- 部分设计与逻辑参考 `dsh-zotero`（MIT，Copyright (c) 2025 Wenjie Xu），固定 commit `0ad6f59e3943afc82418360dbcc8dd8cb7e11ede`。完整声明见 [`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md)。

## 参考文档

- [设计规格](./docs/superpowers/specs/2026-11-21-agentero-zotero-patch-design.md) — 背景、审计事实、真实 Zotero API 实测、架构与决策。
- [5 阶段实施计划](./docs/superpowers/plans/2026-11-24-agentero-zotero-patch.md) — 逐 Task 的 TDD 步骤、代码与验收命令。
- [工具链固定](./docs/toolchain.md) — Node 24 版本、来源与 SHA256。
