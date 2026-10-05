# ThoughtGraph — Codex local companion

Quote → Anchor → Thread: preserve the small quoted moment that starts a line of thought, then track questions, hypotheses, branches, user judgments and research ideas. Local SQLite is the source of truth; Obsidian is an optional read-only browser. This companion works without a Vault.

## 安装 / Install

1. Download **thoughtgraph-2.0.0.zip** from [Releases](https://github.com/Wangjia7/thought-inbox/releases/latest) and unpack it into a permanent folder. Node **22.13+** must be installed (`node --version`). The bundled server has no npm-install step and opens no network listener.
2. In that folder run `node setup.mjs --write-skill`. This creates `thoughtgraph-config.toml` and installs the Skill at `~/.agents/skills/thoughtgraph`. It refuses to overwrite an existing Skill or generated file. It does **not** modify Codex settings automatically.
3. Copy the generated `[mcp_servers.thoughtgraph]` and environment section into `~/.codex/config.toml`, preserving existing sections. Alternatively add a local STDIO server in Codex MCP settings using the exact Node executable, server path and environment from that file. Restart Codex. Check that `thoughtgraph` and its ten tools are available.
4. In a conversation invoke **`$thoughtgraph`** once (or select the Skill). Quote a sentence of the assistant's answer and ask a follow-up. The Skill calls MCP; there is no separate “save to Obsidian” click. For reliable activation, explicitly invoke the Skill when starting a new conversation; implicit selection is model-dependent.
5. Continue: “这个值得单独研究”, “把这个变成 active thread”, “我现在不认同这个判断，因为……”, or “我之前关于 topology 的问题想到哪里了？”

**No Vault connection is required.** Default records live at `~/.thoughtgraph/thoughtgraph.sqlite`. `--data-dir /absolute/folder` changes this. Keep the database outside public repositories. No API keys, accounts, private chat database access, telemetry or remote storage are used by this package. Codex itself still processes conversation context and tool results according to its own service/configuration; local storage does not make Codex an offline model.

### Optional Obsidian browser, later

Generate a new configuration with `node setup.mjs --output thoughtgraph-with-vault.toml --export-dir /absolute/path/to/Vault/ThoughtGraph`. Use a **new, dedicated folder**; an existing folder without the ownership marker is rejected. The server writes `graph.json` and readable `ThoughtGraph.md` atomically after each operation. Both are generated projections, not editable sources. Configure the Obsidian plugin's **ThoughtGraph folder** to the same vault-relative path (default `ThoughtGraph`), then run **Open thought browser**. There is no hardcoded vault name and no URI dependency.

If connecting a desktop-owned database to a synced Vault, that Vault's sync provider may synchronize the projection. The tool itself never uploads it. Obsidian mobile can browse a synchronized projection; the Node companion runs on a desktop, not inside the Obsidian mobile plugin.

## What capture can actually do

The implemented mode is **Skill + MCP fallback**, not a listener for every UI quote click. No documented native quote event was verified in the checked public Codex MCP/Skill/hook APIs. `UserPromptSubmit` exposes prompt text but does not guarantee exact selected-message metadata; this release installs no hook and does not parse private transcripts.

When the Skill sees an explicit quote and follow-up, it passes the exact selected text and (when available) transient public source text/real IDs. Matching is deterministic. Unique exact matches get UTF-16, end-exclusive offsets plus <=160 code units of context on each side. Repeated strings without verified selection offsets are **ambiguous**; missing source text is **unresolved**. Missing IDs remain null, never fabricated. `capture_method` is `quote_block_match` or `manual_anchor`; `native_quote_event` is reserved for a future verified adapter and cannot be asserted by this tool.

There is **no guarantee that every app quote is captured**: Skill activation, visible context and source metadata determine coverage. A selected quote whose source message is unavailable is still saved with honest unresolved provenance. No entire source message/conversation is stored. Attachments, implementation specifications, third-party quotations and routine code troubleshooting do not automatically become personal knowledge.

## Data and controls

- Conversation/Message = source pointers only. Anchor = exact quote + small context + follow-up. Question and Thread are independent objects; Idea points to its originating Thread. Thought Events are append-only except explicit privacy deletion of anchor references. No bulk claim extraction or semantic graph scoring.
- New quotes expire after **seven days** unless kept or promoted. A meaningful further follow-up or explicit user request produces a persistent side thread. Active/research-idea promotion records before/after stage history. Ephemeral cleanup occurs at startup, hourly while the server runs, and on tool access; a stopped server does not run a background scheduler. Exports are refreshed on next startup/access.
- `control_capture`: ON/OFF, keep, undo last, delete, trivial (delete), detach, merge exact duplicates, expire. Capture defaults ON. OFF prevents new anchors; existing threads can still be searched or edited. A deletion removes anchor text and pointers; independent thread questions and judgments remain. To erase all data, stop the MCP server, remove the database and optional generated export folder; delete backups separately. SQLite secure-delete is enabled, but external filesystem/sync backups are outside tool control.
- Provenance edges (`contains`, `extracted_from`, `triggered`, `originated_from`, `recorded_in`) and Reasoning edges (`supports`, `challenges`, `forks_from`, `merged_into`, `revises`) live in separate graph namespaces. An ordered timeline never invents support/causal edges.
- `record_judgment` requires explicit user's own statement; model suggestions retain `origin: model`. Revisions append before/after/reason. No automatic belief inference. This declaration and the Skill are safeguards, not cryptographic proof of who authored a statement; review important judgments.
- Merge preserves source histories and quote ancestry. Source thread judgments do not automatically replace the target's current judgment. A fork keeps `parent_thread`. Use the final merge target when continuing.

Ten tools: `capture_quote_anchor`, `create_thread`, `update_thread`, `fork_thread`, `merge_threads`, `get_thread_context`, `search_threads`, `record_judgment`, `list_open_questions`, `control_capture`. Stable knowledge IDs do **not** name/create/message Codex chats.

## Developer validation

From repository root: `npm ci --ignore-scripts`, `npm run check`. Includes store scenarios A–E, exact/ambiguous Unicode matching, seven-day retention, privacy controls, reopen persistence, separate graph edges, real SDK client/server STDIO tests against the **bundled** server, build, release metadata and legacy plugin regressions. Synthetic test fixtures are not proof of every Codex app quote format. Actual desktop Skill activation and live quote coverage need user acceptance testing after setup; no live Vault was connected during packaging.

Official integration references: [MCP](https://learn.chatgpt.com/docs/extend/mcp), [Skills](https://learn.chatgpt.com/docs/build-skills), [Hooks](https://learn.chatgpt.com/docs/hooks). MCP uses the official [TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk). Requires Node 22.13+ for built-in SQLite (Node 22 may print its experimental warning to stderr). MIT.
