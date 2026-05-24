# Task List Manager

An [Obsidian](https://obsidian.md/) plugin for managing markdown task lists in a sidebar view. Work with multiple list files, check tasks off, reorder them with drag and drop, and keep everything synced with `- [ ]` / `- [x]` lines in your vault.

## Features

- **Sidebar view** — All configured list files in one place, grouped by file.
- **Multiple lists** — Add any markdown files; reorder and hide lists in settings.
- **Standard task syntax** — `- [ ]` and `- [x]`, including indented subtasks.
- **Links in tasks** — Wiki links, markdown links, and bare URLs are highlighted; use the link icon to open them.
- **Quick actions** — Toggle, edit, delete completed tasks, add tasks inline.
- **Bulk operations** — Per list: check all, uncheck all, delete completed.
- **Drag and drop** — Reorder within a file or move tasks between lists.
- **Live updates** — Sidebar edits write to your notes; editor changes refresh the view.
- **Desktop and mobile** — Supported on both platforms.

## Requirements

- Obsidian **1.5.0** or newer

## Installation

This plugin is not yet in the Community Plugins catalog. Install from GitHub:

1. Clone into your vault’s plugins folder:

   ```bash
   cd /path/to/your-vault/.obsidian/plugins
   git clone https://github.com/nico-heinrich/todo-list-manager.git task-list-manager
   cd task-list-manager
   npm install && npm run build
   ```

   (`pnpm` works too.) `main.js` is not in the repo — rebuild after pulling updates.

2. Enable **Settings → Community plugins → Task List Manager**.

## Getting started

1. Open the view via the **list-todo** ribbon icon or **Open task lists** in the command palette (it also opens in the right sidebar when enabled).
2. Configure lists under **Settings → Task List Manager** (default: `tasks.md` at the vault root).
3. Add tasks to your list files:

   ```markdown
   - [ ] Buy groceries
   - [ ] Read [[Project notes]]
   - [ ] Write report
     - [ ] Outline
   ```

Click a list title in the sidebar to open that note.

## Using the sidebar

| Action | How |
|--------|-----|
| Complete / reopen | Checkbox |
| Open link | Link icon (menu when there are several) |
| Edit | Pencil on open tasks |
| Delete | Trash on completed tasks |
| Add task | **New task …** + Enter or **+** |
| Reorder / move | Drag a task |
| Open note | List title |
| Bulk actions | **⋯** on the list header |

Hidden lists (eye in settings) stay configured but are omitted from the view until shown again.

## Settings

- **Add file** — Pick a markdown file from the vault.
- **Drag** — Reorder lists in the sidebar.
- **Eye** — Hide or show a list without removing it.
- **Trash** — Remove from the plugin only (vault file is kept).

## Task format

Managed lines match:

```text
(optional indent)- [ ] or - [x] task text
```

Task text can include `[[wiki links]]`, `[markdown](links)`, and bare `https://` URLs. Other list styles (e.g. `- item` without checkboxes) are ignored.

## Development

```bash
git clone https://github.com/nico-heinrich/todo-list-manager.git
cd todo-list-manager
npm install
npm run dev    # watch build
npm run build  # production
```

Symlink or copy the project into `.obsidian/plugins/task-list-manager` and reload Obsidian after changes.

## Releasing

1. Bump `version` in `manifest.json`.
2. Run `npm run build`.
3. Create a GitHub release with the same tag; attach `main.js`, `manifest.json`, and `styles.css`.
4. Submit or update via [Obsidian’s plugin guide](https://docs.obsidian.md/Plugins/Releasing/Submit+your+plugin).

## License

MIT — see [LICENSE](LICENSE).

## Contributing

Issues and pull requests welcome on [GitHub](https://github.com/nico-heinrich/todo-list-manager).
