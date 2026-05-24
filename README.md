# Task List Manager

An [Obsidian](https://obsidian.md/) plugin that lets you manage markdown task lists from a dedicated sidebar view. Work with multiple list files, check tasks off, reorder them with drag and drop, and keep everything synced with plain `- [ ]` / `- [x]` lines in your vault.

## Features

- **Sidebar view** — See all configured list files in one place, grouped by file.
- **Multiple lists** — Add any markdown files; reorder them in settings and hide lists you do not need in the view.
- **Standard task syntax** — Uses Obsidian-compatible checkboxes: `- [ ]` and `- [x]`, including indented subtasks.
- **Quick actions** — Toggle completion, edit open tasks, delete completed tasks, add new tasks inline.
- **Bulk operations** — Per list: check all, uncheck all, delete all completed.
- **Drag and drop** — Reorder tasks within a file or move them between lists (including into an empty list).
- **Live updates** — Changes in the sidebar write back to your notes; edits in the editor refresh the view automatically.
- **Desktop and mobile** — Works on both (`isDesktopOnly: false` in the manifest).

## Requirements

- Obsidian **1.5.0** or newer

## Installation

This plugin is not yet listed in Obsidian’s Community Plugins catalog. Install it manually from GitHub.

### From source (recommended)

1. Clone the repository into your vault’s plugins folder:

   ```bash
   cd /path/to/your-vault/.obsidian/plugins
   git clone https://github.com/nico-heinrich/todo-list-manager.git task-list-manager
   cd task-list-manager
   ```

2. Install dependencies and build:

   ```bash
   npm install
   npm run build
   ```

   (`pnpm install` / `pnpm run build` also work if you use pnpm.)

3. Enable the plugin in Obsidian: **Settings → Community plugins → Task List Manager**.

The built `main.js` is not committed to the repo; you need to run `npm run build` after cloning or pulling updates.

### Folder name

Obsidian loads plugins from `.obsidian/plugins/<folder-name>/`. The folder name can differ from the plugin id; what matters is that it contains `manifest.json`, `main.js`, and `styles.css`. Using `task-list-manager` (matching the plugin id) keeps things clear.

## Getting started

1. When the plugin is enabled, the task list view is added to the right sidebar automatically. You can also open it with the **list-todo** ribbon icon or the command **Open task lists** (`Ctrl/Cmd+P` → “Open task lists”).
2. Go to **Settings → Task List Manager**.
3. By default, one list is configured: `tasks.md` at the vault root. Create that file (or change the path) and add tasks:

   ```markdown
   - [ ] Buy groceries
   - [ ] Write report
     - [ ] Outline
     - [ ] Draft
   ```

4. Tasks appear in the sidebar under the file name. Click the file title to open the note.

## Using the sidebar

| Action | How |
|--------|-----|
| Complete / reopen | Click the checkbox |
| Edit | Pencil icon on open tasks (text + optional subtask indent) |
| Delete | Trash icon on completed tasks |
| Add task | Type in **New task …** at the bottom of a list and press Enter or **+** |
| Reorder / move | Drag a task; drop before, after, or on another list’s empty drop zone |
| Open note | Click the list title |
| Check all / uncheck all / delete checked | **⋯** menu on the list header |

Hidden lists (eye icon in settings) stay configured but do not show in the sidebar until you show them again.

## Settings

**Settings → Task List Manager**

- **Add file** — Pick a markdown file from your vault (suggest modal).
- **Drag** — Reorder how lists appear in the sidebar.
- **Eye** — Hide or show a list in the view without removing it from configuration.
- **Trash** — Remove a list from the plugin only; the file in your vault is **not** deleted.

Order in settings is the order in the sidebar.

## Task format

Only lines matching this pattern are managed:

```text
(optional indent)- [ ] or - [x] task text
```

Examples:

```markdown
- [ ] Top-level task
- [x] Done task
    - [ ] Subtask (4 spaces or tab indent)
```

Other list styles (e.g. `- item` without checkboxes) are ignored. The plugin reads and writes the actual file contents, so your data stays in normal markdown notes.

## Development

```bash
git clone https://github.com/nico-heinrich/todo-list-manager.git
cd todo-list-manager
npm install
npm run dev    # watch build → main.js
# or
npm run build  # production bundle
```

For local testing, symlink or copy the project into `.obsidian/plugins/task-list-manager` and reload Obsidian after changes.

| File / folder | Role |
|---------------|------|
| `src/main.ts` | Plugin entry, commands, vault refresh |
| `src/view.ts` | Sidebar UI |
| `src/task-manager.ts` | Vault read/write for tasks |
| `src/task-parser.ts` | Parse and format task lines |
| `src/settings.ts` | Settings tab |
| `manifest.json` | Plugin metadata for Obsidian |
| `styles.css` | Sidebar and settings styles |

## Releasing (Community Plugins)

To publish or update the plugin in Obsidian’s Community Plugins directory:

1. Bump `version` in `manifest.json` (semver, e.g. `1.0.0`).
2. Run `npm run build`.
3. [Create a GitHub release](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository#creating-a-release) whose **tag** matches that version exactly.
4. Attach these files to the release: `main.js`, `manifest.json`, `styles.css`.
5. Commit the updated `manifest.json` on the default branch.
6. Submit or update at [community.obsidian.md](https://community.obsidian.md) (**Plugins → New plugin**), linking your GitHub repo.

Official guide: [Submit your plugin](https://docs.obsidian.md/Plugins/Releasing/Submit+your+plugin).

## License

MIT — see [LICENSE](LICENSE).

## Contributing

Issues and pull requests are welcome on [GitHub](https://github.com/nico-heinrich/todo-list-manager).
