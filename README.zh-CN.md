# ThoughtGraph：从引用追踪思想演化

**Quote → Anchor → Thread**：记住一个想法最早从哪句话长出来，以及自己后来为什么改变了判断。

[下载 2.0.0 完整包](https://github.com/Wangjia7/thought-inbox/releases/tag/2.0.0) · [完整安装说明](thoughtgraph/README.md) · [English](README.md)

这版将核心从“在 Obsidian 存一条笔记”改为“在 Codex 中继续思考”。你引用模型回答里的一句话并追问，配套 Skill 通过本地 MCP 创建引用锚点；再次追问或明确说“值得单独研究”后，提升为长期旁支。后续只记录问题、假设、证据、反驳和判断变化，不同步整段聊天，也不自动拆解所有模型回答。

## 先在 Codex 用，不连接 Vault

1. 下载 **thoughtgraph-2.0.0.zip**，解压到长期保留的文件夹。完整包包含 MCP、Skill、安装辅助工具、许可证，以及可选 Obsidian 插件。
2. 安装 **Node 22.13 或更新版本**。在解压目录运行：

   ```sh
   node setup.mjs --write-skill
   ```

3. 将生成的 `thoughtgraph-config.toml` 内容添加到 `~/.codex/config.toml`，保留已有配置。也可按生成的路径在 Codex MCP 设置中添加本地 STDIO 服务。重启 Codex，确认 ThoughtGraph 工具可用。
4. 在对话里调用 **`$thoughtgraph`**，然后正常引用模型的一句话继续追问。Skill 激活时会调用 MCP，无须每次另点“保存”。新对话建议先显式调用一次 Skill；隐式识别不是必定发生。
5. 可以直接说：
   - “这个值得单独作为一个问题。”
   - “把这个提升为 active thread。”
   - “我现在不认同原先的判断，因为……”
   - “我之前关于 topology universality 想到哪里了？”
   - “关闭引用捕捉。”或“撤销最后一个引用锚点。”

记录默认保存在 `~/.thoughtgraph/thoughtgraph.sqlite`，不需要 Vault、账号或 API key。辅助工具生成配置但不会自动修改 Codex 设置，不覆盖已有 Skill。其他路径、更新与连接方式见[完整说明](thoughtgraph/README.md)。

## 当前自动捕捉的实际范围

这是 **Skill + MCP 半自动识别**，尚不能承诺监听 Codex App 的每一次 quote 点击。当前核实的官方接口中没有可直接接入的原生 quote event。捕捉依赖 Skill 激活，以及它能看到的引用和来源内容。

原句唯一匹配时保存精确位置与两侧各最多 160 个 UTF-16 单元的上下文；同句重复出现时标为“歧义”；原回复或真实消息 ID 不可见时标为“未定位/未知”，不伪造来源。不会读取 Codex 私有聊天数据库，不抓取 UI，不保存整条长回答或完整对话。公开接入依据：[MCP](https://learn.chatgpt.com/docs/extend/mcp)、[Skill](https://learn.chatgpt.com/docs/build-skills)、[Hooks](https://learn.chatgpt.com/docs/hooks)。

## 这版提供什么

- **引用锚点**：原句、初始问题、来源指针、定位可靠性，独立于整条消息。
- **线程演化**：临时引用 → 旁支 → 活跃线程 → 研究想法，保留历史与起点。支持分支和合并。
- **自己的判断**：模型建议与用户判断分开；判断改变时追加“之前 / 现在 / 原因”，保留旧版本。不会将模型回答自动当成用户已接受的知识。
- **来源图与推理图分开**：来源关系解释思想从哪来；支持、反驳、修订等逻辑关系仅在明确表达时记录，不能从时间顺序推断。
- **搜索与恢复**：找回起点、当前判断、待解决问题和分支，再继续讨论。
- **隐私控制**：捕捉开关、7 天临时引用、长期保留、撤销、删除、标记无价值、解除关联、合并重复引用。服务停止期间不执行定时清理，下次启动或访问时继续清理。

## 以后连接 Obsidian

完整包的 `obsidian/thought-inbox/` 中有三个插件文件。也可下载独立的 `thought-inbox.zip`。将它们放入当前 Vault **实际配置文件夹**下的 `plugins/thought-inbox/`，重启并在社区插件中启用 **ThoughtGraph**。

最低应用版本 **Obsidian 1.13.7**。插件继续使用原 ID `thought-inbox`，避免已安装版本变成另一个插件。原收件箱笔记与命令保留，不会凭空把旧笔记转成新的思想来源链。

为 MCP 配置一个 Vault 内的**新专用导出文件夹**，插件设置中的 **ThoughtGraph folder** 选择对应相对路径，然后在命令面板运行 **Open thought browser**。你可以浏览活跃线程、引用起点、待解决问题、判断变化和休眠旁支；复制“继续思考”指令回 Codex。生成的 `graph.json` 与 `ThoughtGraph.md` 是只读投影，修改通过 MCP 完成。没有硬编码 Vault 名称，不依赖外部 URI。

所有记录本地存储，工具无联网、遥测或上传。Codex 本身仍按其服务设置处理对话与工具结果；如果自行开启 Vault 同步，导出文件可能被同步服务上传。删除引用保留独立记录的长期问题与判断，备份另行管理。

[旧收件箱使用与升级说明](docs/legacy-inbox.zh-CN.md) · [测试范围](VALIDATION.md) · [发布/市场提交步骤](PUBLISHING.md)。本次未连接实际 Vault，自动化验收使用合成数据；安装后仍需确认你使用的 Codex quote 格式与 Skill 激活情况。
