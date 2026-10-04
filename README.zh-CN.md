# Thought Inbox / 思考收件箱

把剪贴板或笔记选中的原文转为可追踪的问题，保留个人想法、来源、项目和状态，再按唯一 ID 回填讨论。模型结论和自己的判断分别记录，插件不调用任何模型服务。

## 下载后先安装

使用 **thought-inbox-1.1.0-install.zip**，无需安装开发工具或执行构建。

1. 解压得到 `thought-inbox` 文件夹。
2. 在当前 Obsidian 的 **Settings → Files and links → Override config folder** 查看实际配置目录。默认是 `.obsidian`，但以你的设置为准。
3. 将文件夹放进 `你的 Vault/实际配置目录/plugins/`。最终结构应为：

```text
你的 Vault/
└── 实际配置目录/
    └── plugins/
        └── thought-inbox/
            ├── main.js
            ├── manifest.json
            └── styles.css
```

4. 重新加载 Obsidian，在 **Settings → Community plugins** 启用 Thought Inbox。应用版本需为 **1.13.7 或更新版本**。
5. `⌘P`（Windows/Linux 为 `Ctrl+P`），搜索 **Thought Inbox**。

如果看不到命令，请检查：是否是当前 Vault 的配置目录、是否多套了一层文件夹、是否有 `main.js`、是否启用了插件、版本是否达到要求。源码 ZIP 也带编译好的文件，但安装时优先使用上面的安装 ZIP。

## 日常操作

| 命令 | 用途 |
| --- | --- |
| Capture selected text | 在笔记里先选中文字，再执行，自动记录原文与笔记来源。 |
| Capture clipboard | 执行时读取一次剪贴板；若系统拒绝访问，就直接粘贴到 Original text。 |
| Capture a thought | 手工输入一条想法。 |
| Open question queue | 打开问题队列，也可点左侧收件箱图标。 |
| Import discussion result | 粘贴讨论结果 JSON，预览后回填。 |
| Edit current thought | 编辑当前收件箱笔记。 |
| Upgrade legacy notes | 备份并升级旧笔记，保留原 ID 与个人判断。 |

界面字段：Original text＝原文；My thought＝我的想法；Source＝来源；Project＝项目；Status＝状态；Model conclusion＝模型结论；My judgment＝我的判断。公开版本界面使用英文，内容支持中文。

无需填写标题，自动使用 `思考 · 2026-10-05 14:30:05` 这样的日期时间标题，文件名也使用日期时间，不再显示随机 ID。同秒保存会加数字后缀避免覆盖。默认保存到 `Thought Inbox/`，每条思考是一篇普通 Markdown 笔记。可在插件设置搜索 **Inbox folder** 并修改路径，点 **Save folder** 保存。路径相对于 Vault 根目录，不能用绝对路径、隐藏目录、`..` 或 Vault 配置目录。换目录不会迁移已有笔记；切回旧路径可再次看到它们。

状态有 `inbox`（待整理）、`ready`（待讨论）、`discussing`（讨论中）、`resolved`（已解决）、`archived`（归档）。默认队列展示前三种，切换 All statuses 可看到全部。支持文本搜索、项目筛选和状态筛选。

## branch 回填

每条思考有独立 ID，队列可以复制。笔记在收件箱内重命名，ID 不变。

- 点 **Discussion**，录入 branch ID、模型结论、讨论来源以及自己的判断。新增 ID 新增 branch；要改已有 branch，先从下拉框选它。
- 同一条思考里的同一 branch ID 再次回填，会替换该 branch 当前的模型结论。插件不额外保存版本历史。
- JSON 导入不会修改原文、想法、项目、状态或个人判断。个人判断必须由你在 Discussion 表单里填写。

粘贴以下结构，替换为真实思考 ID，点击 **Preview** 核对目标，再点击 **Apply import**：

```json
{
  "thoughtId": "从问题队列复制的实际ID",
  "branchId": "branch-1",
  "modelConclusion": "模型讨论得出的结论，可以包含换行转义。",
  "discussionSource": "讨论标题或来源链接"
}
```

ID 仅可使用字母、数字、连字符和下划线，长度 1–100。不存在的 ID、数组、其他字段会报错。不能把 `userJudgment` 或 `status` 放进 JSON。`discussionSource` 可以省略，省略保留原来源；传入空字符串表示清空。

插件只做本地录入，不会自动读取 ChatGPT 分支或联网抓取链接。可从其他工具手动复制讨论结果。

## 数据保护与手工编辑

新版正文没有 `<!-- thought-inbox:... -->` 标记，也没有 Project/Status/ID 摘要行。ID、项目、状态、来源等保存在 Obsidian 笔记属性中；队列隐藏原始 ID，但可点 Copy ID 复制。

正文用标题和引用块显示原文、想法和讨论。手动修改时保留章节标题和引用格式（以 `> ` 开头）；也可以直接用插件表单编辑。在 **Personal notes** 下面自由写附注，更新时会保留。额外的笔记属性同样会保留。

**升级已有笔记：** 更新插件并重新启用后，按 `⌘P` 搜索 **Thought Inbox: Upgrade legacy notes**，运行一次。旧笔记先在旁边保存完整 `.v1.bak` 备份，再转成干净正文；随机 ID 文件名改为日期时间，自定义过的文件名保留。原文、想法、分支、自己的判断和 ID 不变。可重复运行；损坏或重复 ID 的笔记会报错并停止，不会猜测恢复。备份不出现在队列中。旧笔记在保存/导入时也会备份并升级正文。新版格式不能由 1.0.0 读取，降级前应恢复备份。

表单打开后若笔记被其他操作修改，保存会拒绝覆盖，重新打开表单即可。重复 ID、损坏的标记或不支持的格式会显示具体文件，修复前暂停更新。不要通过复制整篇收件箱笔记创建新条目；请重新捕捉以获取新 ID。

单个长文本字段上限 200,000 字符，整篇笔记上限 2,000,000 字符，导入 JSON 上限 500,000 字符，每条思考最多 100 个 branch。跨设备同步冲突仍按 Obsidian 常规方式处理。停用插件后，Markdown 笔记仍可阅读。

所有插件处理都在本地，不联网、不遥测、不自动监控剪贴板，不要求账号。你自己配置的 Obsidian 同步、备份或其他插件可能访问这些普通笔记，保持原有行为。

## 验证与发布

已通过 28 项自动测试、严格类型检查、官方 Obsidian ESLint 规则、构建与发布文件检查。最低版本为 1.13.7；API 包锁定为 1.13.1，使用的设置搜索接口从应用 1.13.0 提供。尚未完成桌面实机启用后的端到端验收和移动设备验收，详见 [VALIDATION.md](VALIDATION.md)。

[GitHub 发布与市场提交步骤](PUBLISHING.md)。本包准备好提交所需结构，但尚未在市场上架；官方当前使用 **community.obsidian.md 网站提交**，不再以给 `community-plugins.json` 提 PR 为操作指引。
