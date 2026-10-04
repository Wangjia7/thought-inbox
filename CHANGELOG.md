# Changelog

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
