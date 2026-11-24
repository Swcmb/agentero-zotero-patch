# 工具链固定

## Node 24（项目内独立发行版）

两个上游包都要求高于系统 Node：

| 包 | 要求 |
| --- | --- |
| `agentero-dsh-plugin` | `node >=24.9.0` |
| `dsh-zotero` | `node >=24.15.0` |

系统 Node 为 v22.22.2，不满足。项目采用独立发行版，不覆盖系统 Node：

- 路径：`D:/agentero-zotero-patch/.node24/runtime/`
- 版本：`v24.22.3`（`node.exe --version` 实测）
- npm：`11.19.1`（随发行版）
- 来源：`https://registry.npmmirror.com/-/binary/node/v24.22.3/node-v24.22.3-win-x64.zip`
- SHA256（镜像 SHASUMS256.txt 与本地 `sha256sum` 一致）：
  `e612af99f626ab415ea225af6bce5c971feb448cb5cae250bb1c3fa50c5f7d9f`

`.node24/` 已加入 `.gitignore`。所有构建/测试脚本统一用该目录的 `node.exe`。
仓库内脚本通过 `scripts/node.cmd` 或 `scripts/node.sh` 调用，避免依赖 PATH。

复现命令（如需重建）：

```bash
cd D:/agentero-zotero-patch
curl -sL "https://registry.npmmirror.com/-/binary/node/v24.22.3/node-v24.22.3-win-x64.zip" -o _node24.zip
curl -sL "https://registry.npmmirror.com/-/binary/node/v24.22.3/SHASUMS256.txt" -o _shasums.txt
grep 'node-v24.22.3-win-x64.zip' _shasums.txt
sha256sum _node24.zip   # 两行哈希必须相同
mkdir -p .node24 && unzip -q _node24.zip -d .node24
mv .node24/node-v24.22.3-win-x64 .node24/runtime
rm -f _node24.zip _shasums.txt
```
