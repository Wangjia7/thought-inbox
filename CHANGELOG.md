# Changelog

## 2.0.0 — 2026-10-05

- Introduce ThoughtGraph: Quote → Anchor → Thread with local SQLite, source pointers, short context, distinct provenance/reasoning edges and append-only thought events.
- Bundle a local STDIO MCP server and focused Codex Skill; exact/ambiguous/unresolved fallback capture, no claim of native quote-click monitoring.
- Add durable side/active threads, ideas, search/resume, open-question resolution, explicit user judgment revisions and history-preserving forks/merges.
- Add capture ON/OFF, seven-day ephemeral retention, keep/undo/delete/trivial/detach and exact duplicate controls.
- Add Obsidian thought browser with five views, text/project filters and continue-in-Codex prompts. Retain existing thought-inbox ID, settings and legacy commands.
- Ship complete companion + plugin ZIP, separate plugin ZIP, third-party notices and SHA-256 checksums. Node 22.13+ required for companion; Obsidian minAppVersion remains 1.13.7.
- Add synthetic scenarios A–E, Unicode/ambiguity/privacy/persistence/export and bundled MCP STDIO tests. Fix vulnerable development-only Moment dependency via compatible override.


## 1.1.0 — 2026-10-05

- Remove the title input and generate date/time titles automatically.
- Use readable date/time filenames with collision-safe numeric suffixes.
- Move metadata to YAML properties and remove internal HTML comments and summary lines from the body.
- Render original text, personal thoughts and discussions as readable Markdown blockquotes.
- Hide raw IDs from queue cards while preserving Copy ID and ID-based imports.
- Read legacy notes; add an upgrade command with exact local backups and safe renaming through Obsidian's file manager.
- Preserve stable IDs, original text, personal judgments, freeform notes and custom properties during conversion.
- Add regression tests for clean bodies, nested Markdown, properties, filename collisions and legacy migration (28 tests total).

## 1.0.0 — 2026-10-05

- Capture selected text, the clipboard, or a manually entered thought.
- Save original text, personal thought, source, project, and status in local Markdown notes.
- Review a searchable question queue with project and status filters.
- Update discussion branches using stable thought and branch IDs.
- Separate model conclusions from personal judgments; JSON imports preserve personal judgments.
- Preview JSON imports; protect against duplicate IDs, malformed notes, and stale edits.
- Configure a vault-relative inbox folder with configuration-folder and path-traversal protection.
- Register six commands and a ribbon shortcut; require no external URI.
- Use searchable settings definitions introduced in Obsidian 1.13.
- Include source, locked build tooling, 20 automated tests, CI, and tag-based releases.
