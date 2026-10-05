# ThoughtGraph

**Quote → Anchor → Thread.** Track how ideas emerge, branch and evolve from specific moments in human–LLM conversations.

[中文说明](README.zh-CN.md) · [Complete install guide](thoughtgraph/README.md) · [Download 2.0.0](https://github.com/Wangjia7/thought-inbox/releases/tag/2.0.0)

Codex is the main interaction surface. A local MCP server and Skill turn the assistant sentence you quote plus your follow-up into a small, temporary anchor. Continued interest creates a side thread; meaningful thought events preserve hypotheses, challenges, evidence, explicit user judgments, and revisions. Obsidian browses the long-term evolution. No whole conversation synchronization, bulk claim extraction, or graph-scoring UI.

## What's in 2.0.0

- **Local SQLite thought store** with exact quoted spans, small context windows, real source pointers when available, independent questions, side/active threads, and research ideas.
- **Ten Codex MCP tools + Skill**, bundled as a standalone Node process. Capture, search/resume, branch/merge, judgment revisions, open questions and privacy controls.
- **Two distinct graphs**: provenance answers “where did it come from?”; reasoning records explicit support, challenges, forks, merges and revisions. Time order is never a logical edge.
- **Obsidian thought browser**: active threads, quote origins, open questions, belief revisions, dormant side threads; filter by text/project and copy a continue-in-Codex prompt.
- **Local-first controls**: capture ON/OFF, seven-day ephemeral anchors, keep, undo, delete, trivial, detach, exact deduplication. Model suggestions remain separate from user's own judgments. New judgment versions append rather than overwrite.

## Install without a Vault

Download **thoughtgraph-2.0.0.zip** from the release and unpack into a permanent folder. It includes the bundled MCP server, setup helper, Skill, licenses, guide, and `obsidian/thought-inbox/` plugin files.

Requires **Node 22.13+**. In the unpacked folder:

```sh
node setup.mjs --write-skill
```

Copy the generated configuration snippet into Codex's `~/.codex/config.toml` (preserve existing sections), restart Codex, and invoke **`$thoughtgraph`** in a conversation. Quote an assistant sentence and ask your question. No extra save-to-Obsidian action is needed when the Skill is active. Default data: `~/.thoughtgraph/thoughtgraph.sqlite`. No Vault connection is needed. The helper never edits Codex configuration automatically and refuses existing output/Skill overwrites. See the [complete guide](thoughtgraph/README.md) for optional export and alternate paths.

**Capture boundary:** this is model-driven Skill + MCP fallback, not a listener for every quote click. We did not verify a public native quote-event API. Capture depends on Skill activation and visible source context. Repeated quote matches are marked ambiguous; absent source text or IDs stay unresolved/null. Full source messages and private transcripts are not stored/read. Native event mode is reserved for a future verified adapter. [Official MCP](https://learn.chatgpt.com/docs/extend/mcp), [Skill](https://learn.chatgpt.com/docs/build-skills) and [hook](https://learn.chatgpt.com/docs/hooks) docs describe the supported integration surfaces.

## Optional Obsidian browsing

Use the `obsidian/thought-inbox` folder from the full package, or download `thought-inbox.zip`. Put it in your Vault's **actual config folder** `/plugins/thought-inbox/`, then enable **ThoughtGraph** in Community plugins. Minimum Obsidian app version: **1.13.7**. We use the published official `obsidian@1.13.1` API package; the npm API version and app patch version differ. Static API/build checks pass; real device usage remains an acceptance check.

Later configure the MCP companion's `THOUGHTGRAPH_EXPORT_DIR` to a new dedicated folder inside your Vault, e.g. `…/Vault/ThoughtGraph`. Set the plugin's **ThoughtGraph folder** to that vault-relative path and run **Open thought browser**. Projection files (`graph.json`, readable `ThoughtGraph.md`) are generated views; modify thoughts through Codex MCP. A preexisting foreign folder is refused. No hardcoded Vault name, external URI, API key or network service is required. The browser can run on mobile with a synced projection; the Node companion runs on a desktop.

The public plugin ID remains **`thought-inbox`** so existing installations/settings/notes keep working. The display name is now **ThoughtGraph**. Original manual inbox commands remain as legacy compatibility tools; their notes are not silently converted into thought ancestry or user beliefs. [Legacy English guide](docs/legacy-inbox.md) · [旧收件箱说明](docs/legacy-inbox.zh-CN.md).

## Privacy

The package opens no network listener, makes no API calls, and collects no telemetry. Database data and optional exports remain on your machine. Codex itself still processes prompts and tool results under its own service settings. A user-configured Vault sync can synchronize exports; the tool itself never uploads them. Expiration happens at startup, hourly while running, and on access; no cleanup runs while stopped. Independent thread questions/judgments survive anchor deletion. Backups and sync copies must be deleted separately if erasure is required. Details are in the [guide](thoughtgraph/README.md).

## Build and release

```sh
npm ci --ignore-scripts
npm run package
```

Includes lint, legacy/browser tests, scenarios A–E, real SDK STDIO integration against the bundled server, plugin/companion builds, release checks and archives. `release/` contains the full tool ZIP, plugin-only ZIP and checksums. Source and release workflows are MIT; third-party notices ship with the bundle. [Validation and limits](VALIDATION.md) · [GitHub/Community Plugins publication steps](PUBLISHING.md) · [Changelog](CHANGELOG.md).
