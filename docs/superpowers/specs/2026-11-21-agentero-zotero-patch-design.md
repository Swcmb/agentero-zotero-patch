# Agentero Zotero Patch — 功能融合设计规格

- 日期：2026-11-21
- 状态：已通过头脑风暴确认，待用户审阅
- 来源设计：用户提供的 `agentero-zotero-integration-design (1).html`
- 目标仓库：`D:/agentero-zotero-patch`（独立 Git 仓库）

## 1. 背景与结论

将 `dsh-zotero` 的 Zotero 能力整合为 `agentero-dsh-plugin` 的扩展补丁。产品形态是一个**独立安装的 DSH bundle 插件**：安装 `agentero-zotero-patch` 即通过自身 `cordis.patch.yml` 的 `insert` 把 Zotero 组件注入 DSH 运行时，自动为 `agentero-dsh` 打补丁。用户无需修改 agentero 源码，也无需并行安装 dsh-zotero。

核心边界：Agentero Vault 继续管理 Agentero 自己的文献/笔记/PDF；Zotero 作为外部文献源经本地 API 只读访问；第一阶段只读，写入与双向同步分别设计授权机制且默认关闭；两边数据所有权各自保留。

## 2. 审计事实（源码固定版本）

两个上游仓库源码已通过 codeload 拉取到 `.sources/`（已被 `.gitignore` 排除，仅作审计参考，不纳入交付）：

| 仓库 | 版本/分支 | 关键事实 |
| --- | --- | --- |
| `Vncntvx/dsh-zotero` | main，package v1.4.0 | Cordis Service 插件，提供 `ctx.zotero`；488 个源文件；4 组件（core/library/scholarly/enrichment）；`cordis.patch.yml` 用 `insert` 注入；DSH `>=0.2.2-rc.4 <0.3.0`；MIT。 |
| `poco-ai/agentero-dsh-plugin` | main，package v0.1.8 | pnpm monorepo，四包 `host/library/notes/pdf`（`agentero-dsh-*`）；Node `>=24.9.0`，DSH `>=0.2.1-rc.5 <0.3.0`；`cordis.patch.yml` 用 `insert` 注入四个包。 |

本机环境：Zotero 10.0.3 已安装（`D:/ProgramFiles/Zotero`），数据目录 `C:/Users/Swcmb/Zotero`（含真实库与 Agentero 子目录）；DSH 桌面端已安装（`D:/ProgramFiles/dsh/DeepSeek Harness.exe`）；本机 Node v22.22.2（低于源码要求，联调前需确认/切换到 Node 24）。

重要约束：两仓库的版本 pin、私有路由与客户端 UI 不同，不能整体套用；核心模块体量大（`service.ts` 1283 行、`contract.ts` 1688 行、`types.ts` 1853 行），抽取纯逻辑需逐模块判断，避免把 DSH 深耦合代码搬过来。

## 3. 已确认的决策

| 主题 | 决策 |
| --- | --- |
| 本次目标 | 完整实现设计文档的全部 5 个阶段 |
| 源码审计 | 尽力拉取真实源码并审计后再迁移（已完成拉取与初步审计） |
| 落地形式 | 独立 DSH bundle 插件，安装后自动给 agentero-dsh 打补丁 |
| 实现路径 | 分层复用 + 分阶段推进：抽取 dsh-zotero 纯逻辑，Cordis 服务接口对接 agentero |
| 桥接方式 | 可选探测 `ctx` 上的 agentero 服务 + 最小只读回退，不强依赖、无版本 pin 冲突 |
| 阶段 4 UI | 先做数据/服务层，UI 复用 agentero 现有 library 面板，不移植 dsh-zotero 客户端组件 |
| 工具命名 | 只注册 `research_*`，不注册 `zotero_*` 别名，避免与 dsh-zotero 重名 |
| 验收标准 | 本机真实联调：启动 Zotero 10 并开启本地 API，验证连接/搜索/详情/PDF 证据/导出，DSH 加载插件验证注入 |
| 交付节奏 | 分 5 阶段逐个实现、逐个验收 |
| 联调准备 | 用户手动开启 Zotero 本地 API，插件负责检测与调用 |

## 4. 架构

### 4.1 分层

```
DSH 运行时（Cordis ctx）
   │  cordis.patch.yml → insert: zotero-patch / zotero-patch-bridge / ...
   ▼
[1] 补丁入口层  index.ts                 注册组件、声明 inject、挂载服务与配置
   ▼
[2] 桥接/服务层 bridge + unified service ctx.zoteroPatch 暴露 research_* 统一工具；
                                        可选探测 agentero 服务决定复用或回退
   ▼
[3] 可复用逻辑层 core（从 dsh-zotero 抽取，保留 MIT 版权声明）
      zotero-client / search(BM25) / retrieve / export / match / sources / changes
   ▼
[4] 传输层 transport                     Zotero Local API http://127.0.0.1:23119，
                                         仅 loopback，附件路径限定合法范围
```

统一文献服务层屏蔽数据源差异；上层 Agent 工具与 Sources 只面向统一数据模型；Agentero 与 Zotero Adapter 分别实现底层。`PaperReference` 保留 `source: "agentero" | "zotero"`、原生 `sourceId`、可选 DOI、标题、作者、年份。统一展示不等于合并数据库；用户显式导入时才在 Agentero 建记录并保存来源关联。

### 4.2 组件拓扑（Cordis 服务）

| 组件 id | 职责 | 默认 |
| --- | --- | --- |
| `zotero-patch` | 核心服务 `ctx.zoteroPatch`：连接检测、统一工具注册、Sources 折叠 | 启用 |
| `zotero-patch-bridge` | 可选探测 agentero 服务、决定是否复用其 PDF/笔记 | 启用 |
| `zotero-patch-sources` | Sources 会话轨迹投影（会话事件增量折叠） | 启用 |
| `zotero-patch-scholarly` | 外部学术检索（阶段 5） | 关闭 |
| `zotero-patch-enrichment` | 文档解析/语义排序（阶段 5） | 关闭 |

依赖方向固定：bridge/sources/scholarly/enrichment → core；core 只通过纯接口槽调用增强能力，不反向依赖。组件卸载时撤槽、停止新准入、等待在途读取排空。

## 5. 统一工具契约

阶段 1-3 注册 `research_*` 工具，参数含 `source?: "agentero" | "zotero"`，省略则跨库检索。

| 工具 | 阶段 | 职责 | 复用的 dsh-zotero 模块（源文件） |
| --- | --- | --- | --- |
| `research_search` | 1 | 跨库搜索，按数据源/关键词/标签/合集筛选 | `tools/search.ts`, `local/search-domain.ts`, `local/search-index.ts` |
| `research_get` | 1 | 读取单篇元数据、摘要、笔记与附件信息 | `tools/get.ts`, `local/detail.ts` |
| `research_get_batch` | 1 | 批量读取，逐条报告 | `tools/get-batch.ts`, `local/get-batch-domain.ts` |
| `research_browse` | 1 | 浏览数据源、文库、合集、标签、保存搜索 | `tools/browse.ts`, `local/browse-domain.ts` |
| `research_children` | 1 | 获取子条目（附件/笔记/批注） | `tools/child-records.ts`, `local/normalize-children.ts` |
| `research_retrieve` | 2 | 全文/笔记/批注检索，返回片段/页码/来源定位 | `tools/retrieve.ts`, `local/retrieve.ts`, `local/retrieve-fulltext.ts`, `local/evidence-ranker.ts` |
| `research_export` | 2 | 导出 BibTeX/BibLaTeX/RIS/CSL JSON/引用 | `tools/export.ts`, `local/export-domain.ts` |
| `research_match_references` | 2 | 参考文献与库内条目匹配 | `tools/match-references.ts`, `local/match-references-domain.ts` |
| `research_changes` | 2 | 文献库增量变更 | `tools/changes.ts`, `local/changes-domain.ts` |

身份与去重顺序：DOI → arXiv ID / PMID 等强标识 → 标题+作者+年份组合；匹配只用于跨库去重与统一展示，原始记录分别保留。

## 6. 数据流

### 6.1 读路径
Agent 调 `research_*` → 工具层参数校验 → 统一服务层按 `source` 路由 → Zotero 侧经 transport 调用 Local API（loopback 23119）→ 归一化为统一 `PaperReference` → 返回带来源定位的结果。全文检索用 BM25（k1=1.2, b=0.75）；证据片段保留附件、Zotero 页码、匹配方式。Sources 组件旁路监听会话事件，只折叠读类工具与导出的成功事实，记录查询条件、实际读取的文献/笔记/附件、证据片段/页码/批注、导出与失败/取消操作、需审批的写入操作。

### 6.2 写路径（阶段 1 不做；阶段 2+ 默认关闭）
能力门 → 只读预检 → `ctx.approval.request` → 计划审查卡 → Local API → 回执核验（索引/身份/版本/字段一致，缺失返回 `committed-unverified` 且不重试）。写权限不继承 Agentero 授权；附件访问限定 Zotero 返回的合法路径；不引入任意 Shell 执行能力。

## 7. 错误处理

| 类别 | 场景 | 策略 |
| --- | --- | --- |
| 连接 | Zotero 未运行 / 23119 未监听 / 本地 API 未开启 | 错误码 `ZOTERO_PATCH_UNREACHABLE`，提示开启"允许其他应用通信"，不重试风暴 |
| 权限 | 写未授权 / 第三方上传未授权 | `ZOTERO_PATCH_WRITE_DENIED` / `ZOTERO_PATCH_EGRESS_DENIED`，不继承 agentero 授权 |
| 数据 | 条目不存在 / 附件路径越界 / schema 不匹配 | 具体错误码，不降级返回错误数据 |
| 降级 | agentero 服务不存在 / 语义模型缺失 | 走最小只读回退；语义缺失明确报错，不静默回退 BM25 |

## 8. 代码迁移原则与能力映射

1. **先审计，再迁移**：以 `.sources/` 中两个仓库 main 分支源码为准，README 仅作索引。
2. **保留 Agentero 架构**：不复制 dsh-zotero 的私有路由、宿主 pin 与内部 UI 组件。
3. **抽取可复用逻辑**：优先复用 Zotero API 客户端、检索算法、引用格式、身份匹配等纯逻辑；对 1000+ 行的深耦合模块（service/contract/types）只抽取必要部分，其余按统一模型重写。
4. **通过 Cordis 接口集成**：模块间用服务、事件、扩展点交互，避免跨包访问私有实现。
5. **逐阶段提交验证**：每阶段跑类型检查、单测、构建、真实 Zotero 联调后再 Git 提交。
6. **遵守 MIT 许可**：复用代码保留版权声明与 LICENSE，核查依赖许可证。

固定 commit 与逐模块映射表将在实施计划（writing-plans）阶段补齐：源功能 → 源文件 → 目标包 → 适配方式（复用/适配/重写/暂缓）→ 测试用例。

## 9. 测试与验收

1. 单元测试（mock Zotero Local API）：search/get/retrieve/export/match 各模块、身份匹配三优先级、Sources 折叠幂等性。
2. 契约测试：`research_*` 工具 schema 与返回值校验。
3. 安全测试：loopback 限制、附件路径越界拒绝、写权限门。
4. 真实联调（用户指定验收标准）：启动 Zotero 10.0.3 并开启本地 API → 连接检测、搜索真实库、读取详情、PDF 证据定位、引用导出；DSH 加载插件验证 `cordis.patch.yml` 注入成功。联调前确认 Node 24 可用。

每阶段验收 = 类型检查通过 + 该阶段单测通过 + 对应真实 Zotero 操作可用 + Git 提交。

## 10. 分阶段实施计划

- **阶段 1 · Zotero 接入**：patch 入口、transport、连接检测、只读 search/get/get_batch/browse/children。验收：未启动/未授权/无权限均有明确结果；读取与 Zotero 原始条目一致；真实库搜索可用。
- **阶段 2 · 研究工具**：retrieve（全文/笔记/批注、证据、页码）、export、match_references、changes。验收：结果可回溯到原文/附件/页码；导出格式样例校验通过。
- **阶段 3 · Sources 轨迹**：会话事件折叠，记录来源/证据/查询/导出。验收：会话后可还原使用过的文献与证据；重复事件不产生错误重复记录。
- **阶段 4 · 统一服务层与桥接**：bridge 可选探测 agentero、跨库路由、复用 agentero 现有面板的数据契约。验收：两种来源在同一工具工作流中可用，原生 ID 与来源标识始终保留。
- **阶段 5 · 高级能力（默认关闭）**：scholarly 学术检索、enrichment 文档解析/语义排序，各自独立开关、授权边界、测试与可观测。验收：每项能力有独立开关且默认关闭，授权边界清晰。

## 11. 范围外（YAGNI）

- 双向同步（作为独立项目评估）。
- 写入 Zotero 的完整工具集（阶段 1 不做；后续默认关闭，按审批机制逐步开放）。
- 移植 dsh-zotero 客户端 UI 组件（阶段 4 复用 agentero 面板）。
- 任意 Shell 执行能力。

## 12. 待实施计划阶段补齐

- 两个上游仓库的固定 commit SHA。
- 逐模块能力映射表（源功能/源文件/目标包/适配方式/测试用例）。
- Node 24 本机可用性确认与切换方式。
