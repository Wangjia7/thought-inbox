> Legacy Thought Inbox workflow (retained for existing notes). New ThoughtGraph threads use SQLite and append-only judgments; these legacy branch imports keep their earlier behavior.

# Thought Inbox

Capture thoughts locally, review a question queue, and track discussion outcomes separately from your own judgments.

[中文使用与安装说明](../README.zh-CN.md) · [Publishing guide](../PUBLISHING.md) · [Validation report](../VALIDATION.md)

Thought Inbox turns a selected passage or a clipboard excerpt into a question you can revisit. Each thought has a stable ID and its own Markdown note. Add discussion branches, paste a model conclusion, and record your own judgment separately. No AI service is called by the plugin.

## Requirements and availability

- Obsidian **1.13.7 or newer**. `minAppVersion` is deliberately set to this validated API target, rather than claiming support for older releases.
- Desktop and mobile compatible public APIs; clipboard access depends on the host permissions. Manual paste is always available. Mobile device testing remains part of the release checklist.
- This source package is prepared for submission; it is **not yet listed** in Community Plugins.

## Installation before publication

1. Download and unzip `thought-inbox-1.1.0-install.zip`.
2. In Obsidian, open **Settings → Files and links → Override config folder** to check the actual configuration folder. Its default is `.obsidian`.
3. Put the extracted `thought-inbox` folder inside `<vault>/<actual-config-folder>/plugins/`. The final directory must contain `main.js`, `manifest.json`, and `styles.css` directly. Avoid a second nested `thought-inbox` folder.
4. Reload Obsidian. In **Settings → Community plugins**, enable community plugins if you choose to, then enable **Thought Inbox**.
5. Open the command palette and search `Thought Inbox`. If it is absent, check that the vault, configuration folder, and three compiled files are correct, and that the app is at least 1.13.7.

After directory approval, install normally through Settings → Community plugins → Browse → Thought Inbox.

## Capture and review

The following command names appear with the automatic `Thought Inbox:` prefix. No hotkeys are assigned; choose your own in Settings → Hotkeys.

| Command | What it does |
| --- | --- |
| Capture selected text | Opens a capture form with the editor selection and the active note as its source. Available when text is selected. |
| Capture clipboard | Reads clipboard text once after your command. If access fails, paste into the form. |
| Capture a thought | Opens a blank form. |
| Open question queue | Opens the queue; the inbox ribbon icon does the same. |
| Import discussion result | Opens the JSON preview and import form. |
| Edit current thought | Edits the current note if it is in the configured inbox. |
| Upgrade legacy notes | Backs up and converts 1.0.0 notes to the readable format, keeping IDs and judgments. |

The capture form records **Original text**, **My thought**, **Source**, **Project**, and **Status**. There is no title input. Titles are generated from the capture time, for example `思考 · 2026-10-05 14:30:05` (Thought · date and time). At least an excerpt or thought is required. A source may be a local note link, a URL, or a plain description; the plugin does not fetch it.

The default inbox is `Thought Inbox/`. Change it using the searchable **Inbox folder** setting and **Save folder**. Only that folder and its subfolders are scanned. Changing the folder does not move old notes. Switch back to access the previous inbox, or move the notes yourself in Obsidian. Absolute paths, hidden folders, traversal, and the actual vault configuration folder are rejected.

Statuses: `inbox`, `ready`, `discussing`, `resolved`, `archived`. The default **Open questions** filter includes the first three. Search text, filter by project, or choose **All statuses** to find resolved and archived items. Status changes are explicit edits; importing a model result never resolves a question for you.

## Discussion branches

In the queue, choose **Discussion**. Enter a branch ID such as `branch-1`, a model conclusion, the discussion source, and **My judgment**. Use a new branch ID to add a discussion. Select an existing branch from the dropdown before editing it. IDs allow letters, numbers, hyphens and underscores, with a maximum of 100 characters.

A branch is identified by `(thought ID, branch ID)`. Updating an existing branch replaces its current conclusion; this plugin does not maintain a separate revision history. Use Obsidian's file recovery or your own backups if you need previous versions.

### Import a branch result

Copy a thought ID from the queue. Paste one plain JSON object into **Import discussion result**:

```json
{
  "thoughtId": "paste-the-exact-id-from-your-queue",
  "branchId": "branch-1",
  "modelConclusion": "The discussion suggests testing this assumption with a control experiment.",
  "discussionSource": "Conversation title or URL"
}
```

Choose **Preview**, verify the target note and branch, then **Apply import**. Unknown IDs are rejected. The source is optional: omitting it preserves the current branch source; explicitly passing an empty string clears it. A repeated branch ID updates in place, while a new one adds a branch. Your judgment, original text, thought, project and status are preserved. Unknown keys, arrays, and attempts to import `userJudgment` or `status` are rejected. Record your own judgment through the Discussion form.

This is a local paste/import workflow. It does not connect to ChatGPT, detect branches automatically, or send excerpts to a model. There is no `obsidian://thought-inbox` handler; old launcher apps are not needed.

## Storage and safe editing

New filenames use `思考 YYYY-MM-DD HH-MM-SS.md`. Same-second captures receive a numeric suffix rather than overwriting one another. The stable ID is stored in YAML properties, along with title, project, status, source, timestamps and branch metadata. The queue hides the raw ID; **Copy ID** still copies it for imports. Renaming a note inside the inbox does not change its identity.

The body contains readable headings and blockquotes, with no internal HTML markers or Project/Status/ID summary lines. Keep the original/thought/discussion headings and the blockquote structure intact when editing by hand, or use the plugin forms. Add freeform writing under **Personal notes**. Extra YAML properties are preserved. Both body and metadata are updated atomically using `Vault.process` to avoid partial record updates.

Version 1.0.0 notes remain readable by the plugin. To clean existing notes, run **Upgrade legacy notes**. Each legacy note receives an exact `.v1.bak` backup alongside the original before conversion. UUID filenames are renamed through Obsidian's file manager; custom filenames are kept. IDs, original text, personal thought, branches, judgments, and extra writing are preserved. Saving or importing into a legacy note also upgrades its content with a backup; run the upgrade command to convert remaining UUID filenames. The command is safe to run again. Damaged or duplicate notes abort conversion rather than being guessed or overwritten. Backups are excluded from the queue. A 1.0.0 plugin cannot read the new format; restore the backup before downgrading.

Each text field is limited to 200,000 characters, each note to 2,000,000 characters, an import to 500,000 characters, and a thought to 100 branches. These are text-length limits, not byte limits. Missing sections or unsupported schemas reject updates. Duplicate IDs block updates; capture a new thought rather than duplicating an entire note.

Edits compare the original form snapshot with the latest note inside `Vault.process`. If the note changed while a form was open, reopen it instead of overwriting that change. Plugin-initiated writes are serialized. Sync conflicts between devices still require normal Obsidian conflict resolution.

Disabling or uninstalling the plugin leaves all thought notes readable in the vault. Only the inbox-folder preference is stored in plugin `data.json` using `loadData`/`saveData`.

## Privacy

All plugin processing is local. No accounts, payments, network requests, external file access, ads, analytics, telemetry, background clipboard monitoring, or automatic updates are implemented. Clipboard reads happen only when you invoke the clipboard command. Queue previews use plain text, including sources and model outputs, with no remote rendering. The plugin has no runtime dependencies beyond Obsidian.

Thoughts are ordinary files in your vault. Any sync, backup, publishing, remote-media rendering when opening Markdown, or other plugin access configured in Obsidian remains subject to your existing host settings.

## Development

Use Node.js 22 or newer:

```sh
npm ci --ignore-scripts
npm run check
npm run dev
```

`check` runs Obsidian's recommended ESLint rules, 28 automated tests, a strict TypeScript check, a minified CommonJS build, and release-metadata/bundle validation. `dev` watches source files. Runtime imports are externalized only for `obsidian`; no Node or Electron APIs are used by the plugin.

Build tooling follows the [official sample plugin](https://github.com/obsidianmd/obsidian-sample-plugin), with a root `main.ts` entry and a locked API package (`obsidian@1.13.1`). The public API package version and app patch version need not match. Tests use a minimal host fixture for vault writes and command registration; they are not a substitute for loading the plugin in the actual app. See [VALIDATION.md](../VALIDATION.md).

## License and maintenance

MIT. New implementation of the Thought Inbox idea, with build conventions informed by the official sample (0BSD); no code from the previous installer is required. Maintainer attribution in the manifest is `jqwang`; verify this public author name before publishing. Report problems through the publishing repository's GitHub Issues without including private vault contents.
