# GitHub 发布与 Obsidian Community 提交

核对日期：2026-10-05。此文件说明你需要执行的公开发布操作；本次交付没有创建远程仓库、Release 或市场条目。

## 1. 建立公开源码仓库

解压源码 ZIP，在 `thought-inbox/` 仓库根目录操作。先确认 `manifest.json` 的公开作者字段 `jqwang` 是你希望展示的名字，可以修改为你的真实公开名字或团队名。LICENSE 使用 MIT。名称 `Thought Inbox`、ID `thought-inbox` 已核对当前官方公开目录，无精确同名/同 ID 条目；提交时再确认一次，未公开或待审条目不能由目录镜像判断。

在 GitHub 创建**公开**仓库，建议名称 `thought-inbox`，不要初始化另一份 README 或 LICENSE。将以下命令里的 `YOUR_GITHUB_USERNAME` 替换为自己的 GitHub 账号。需要 Node.js 22+ 与 Git：

```sh
npm ci --ignore-scripts
npm run check
git init
git branch -M main
git add .
git commit -m "Initial release of Thought Inbox"
git remote add origin https://github.com/YOUR_GITHUB_USERNAME/thought-inbox.git
git push -u origin main
```

`.gitignore` 排除 `main.js`、`node_modules` 和临时测试构建。编译后的 main.js 用作 Release 附件，源码仓库仍保留根目录 manifest.json。提交后检查 GitHub 页面上确实有 `main.ts`、`src/`、README、LICENSE、manifest、versions、锁文件、测试和 workflows。

## 2. 本地实际验收

在独立测试 Vault 手动安装三个编译文件后，按 [VALIDATION.md](VALIDATION.md) 的验收表验证加载、剪贴板、选中文本、队列、讨论和重复导入。当前自动验证不等于已经完成桌面或手机的端到端测试。`isDesktopOnly: false` 基于使用浏览器与公开 Obsidian API；发布给手机用户前至少完成一台 iOS/Android 设备验收，并如实记录实际覆盖。

## 3. 发布 1.0.0

仓库包含 tag 触发的 `.github/workflows/release.yml`。确认仓库允许 GitHub Actions 运行。该 workflow 在通过检查后自动创建公开 Release，因此推 tag 前应已经完成上一步的人工验收。

```sh
git tag 1.0.0
git push origin 1.0.0
```

不要使用 `v1.0.0`。tag 必须与 `manifest.json.version` **完全一致**。等待 Actions 成功，然后打开 Releases 确认：

- Release tag 是 `1.0.0`，状态为已发布，非 draft、非 prerelease。
- **独立附件**包含 `main.js`、`manifest.json`、`styles.css`。
- 另有 `thought-inbox.zip` 可供手动安装。
- 根目录 manifest 和 Release 附件的 manifest 是同一版本，且版本映射为 `"1.0.0": "1.13.7"`。

只上传 ZIP 或只有 GitHub 自动生成的 Source code ZIP 不够，Obsidian 需要三个独立资产。

如果不用 Actions，在本地 `npm run check` 成功后，在 GitHub → Releases → Draft a new release，选择或创建 tag `1.0.0`，上传这三个文件，填初版说明并发布。不要再同时推 tag 触发自动创建同一个 Release；二选一即可。

## 4. 提交当前 Community 目录

**当前官方流程是网站提交，不是编辑 `obsidianmd/obsidian-releases` 的 `community-plugins.json` 并提 PR。** 官方 sample README 中仍出现旧 PR 指引，发布流程应以当前的 Submit your plugin 文档为准。

1. 打开 [Obsidian Community](https://community.obsidian.md)，使用 Obsidian 账号登录。
2. 在个人资料里关联 GitHub 账号，以便验证你拥有该源码仓库。
3. 选择添加插件（Add a plugin），填入 `https://github.com/YOUR_GITHUB_USERNAME/thought-inbox`，按页面要求填写说明。
4. 核对平台读取的 ID、名称、描述、作者与默认分支根目录 manifest 一致。它读取默认分支 HEAD，不能只把 manifest 放进 Release。
5. 查看自动扫描/审核结果。若有问题，修改源码，更新 CHANGELOG，递增版本，推源码并发布新的同号 Release；在后台继续按反馈处理。
6. 通过审核并发布后，在 Obsidian 的 Community plugins 搜索 Thought Inbox，确认能从 Release 下载并正常启用。

## 5. 后续版本

先修改源码、CHANGELOG；如新接口需要更高应用版本，同时修改 manifest.minAppVersion 和兼容性说明。使用 npm 的版本命令同步 package/manifest/versions，且不自动产生带 v 的 tag：

```sh
npm version patch --no-git-tag-version
npm run check
git add .
git commit -m "Release 1.0.1"
git push origin main
git tag 1.0.1
git push origin 1.0.1
```

其中示例 `1.0.1` 必须替换为实际新版本。保留 versions.json 中的历史映射与旧 Releases，供较旧应用版本选择兼容版本。提交和审核时仍需平台处理；本包不能保证自动审核一定通过。

## 官方依据

- [官方插件示例](https://github.com/obsidianmd/obsidian-sample-plugin)：构建、版本文件、命令/界面生命周期和 Release 附件约定。
- [Manifest](https://docs.obsidian.md/Reference/Manifest)：公开 ID、名称、版本与描述。
- [提交要求](https://docs.obsidian.md/community-directory/submission-requirements-for-plugins)：描述、最低版本、移动端和命令 ID。
- [开发者政策](https://docs.obsidian.md/community-directory/developer-policies)：许可、隐私与禁止客户端遥测。
- [Submit your plugin](https://docs.obsidian.md/Plugins/Releasing/Submit%20your%20plugin)：当前网站提交、GitHub 绑定、Release 和审核流程。
- [官方自检清单](https://docs.obsidian.md/oo/plugin)：Vault.process、配置目录、清理、CSS 与移动端检查。
- [Obsidian 1.13.7 发布说明](https://obsidian.md/changelog/2026-08-12-desktop-v1.13.7/)：目标应用版本。
