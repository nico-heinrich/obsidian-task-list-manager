import { App, PluginSettingTab, TFile, setIcon } from "obsidian";
import { confirmDelete } from "./confirm-delete-modal";
import type TaskListManagerPlugin from "./main";
import { ListFileSuggestModal } from "./list-file-suggest-modal";

const FILE_CONFIG_MIME = "application/x-obsidian-list-file-config";

export interface ListFileEntry {
	path: string;
	hidden?: boolean;
}

export interface TaskListManagerSettings {
	listFiles: ListFileEntry[];
}

export const DEFAULT_SETTINGS: TaskListManagerSettings = {
	listFiles: [{ path: "tasks.md" }],
};

export function normalizeSettings(raw: unknown): TaskListManagerSettings {
	if (
		raw &&
		typeof raw === "object" &&
		Array.isArray((raw as TaskListManagerSettings).listFiles) &&
		(raw as TaskListManagerSettings).listFiles.length > 0
	) {
		return { listFiles: (raw as TaskListManagerSettings).listFiles };
	}
	return { ...DEFAULT_SETTINGS };
}

export function getVisibleListPaths(settings: TaskListManagerSettings): string[] {
	return settings.listFiles.filter((f) => !f.hidden).map((f) => f.path);
}

export function getAllConfiguredPaths(settings: TaskListManagerSettings): string[] {
	return settings.listFiles.map((f) => f.path);
}

function displayName(path: string): string {
	return path.replace(/\.md$/i, "");
}

function relationFromPointer(row: HTMLElement, e: DragEvent): "before" | "after" {
	const r = row.getBoundingClientRect();
	const mid = r.top + r.height / 2;
	return e.clientY < mid ? "before" : "after";
}

export class TaskListManagerSettingTab extends PluginSettingTab {
	plugin: TaskListManagerPlugin;
	private fileDragIndex: number | null = null;
	private listEl: HTMLDivElement | null = null;
	private dropIndicator: HTMLDivElement | null = null;

	constructor(app: App, plugin: TaskListManagerPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createDiv({
			cls: "tlm-settings-desc",
			text: "Order here is the order shown in the task list view. Hidden files stay in the list but do not appear in the view.",
		});

		this.listEl = containerEl.createDiv({ cls: "tlm-settings-file-list" });
		this.dropIndicator = this.listEl.createDiv({ cls: "tlm-settings-drop-indicator" });
		this.renderFileList();

		const addBtn = containerEl.createEl("button", { cls: "mod-cta tlm-settings-add-btn", text: "Add file" });
		addBtn.addEventListener("click", () => this.openFilePicker());
	}

	private renderFileList(): void {
		if (!this.listEl) return;
		const indicator = this.dropIndicator;
		this.listEl.empty();
		if (indicator) {
			this.listEl.appendChild(indicator);
			this.dropIndicator = indicator;
		}

		const files = this.plugin.settings.listFiles;
		if (files.length === 0) {
			this.listEl.createDiv({
				cls: "tlm-settings-file-empty",
				text: "No files added yet. Add a markdown file to get started.",
			});
			return;
		}

		files.forEach((entry, index) => {
			this.renderFileRow(entry, index);
		});
	}

	private renderFileRow(entry: ListFileEntry, index: number): void {
		if (!this.listEl) return;

		const row = this.listEl.createDiv({ cls: "tlm-settings-file-row" });
		if (entry.hidden) row.addClass("tlm-settings-file-row-hidden");

		const main = row.createDiv({ cls: "tlm-settings-file-row-main" });
		main.setAttr("draggable", "true");
		main.setAttr("aria-label", "Drag to reorder");

		const hit = main.createDiv({ cls: "tlm-settings-file-hit" });
		const grip = hit.createDiv({ cls: "tlm-settings-file-grip" });
		setIcon(grip, "grip-vertical");

		const labelWrap = hit.createDiv({ cls: "tlm-settings-file-label" });
		const file = this.app.vault.getAbstractFileByPath(entry.path);
		const missing = !(file instanceof TFile);
		const title = labelWrap.createDiv({ cls: "tlm-settings-file-title" });
		const nameEl = title.createSpan({ text: displayName(entry.path) });
		if (missing) {
			nameEl.addClass("tlm-missing");
			title.createSpan({ cls: "tlm-settings-file-not-found", text: " (file not found)" });
		}
		labelWrap.createDiv({ cls: "tlm-settings-file-path", text: entry.path });

		const actions = row.createDiv({ cls: "tlm-settings-file-actions" });

		const hideBtn = actions.createEl("button", {
			cls: "clickable-icon tlm-settings-file-action",
			attr: { "aria-label": entry.hidden ? "Show in task list view" : "Hide from task list view" },
		});
		setIcon(hideBtn, entry.hidden ? "eye-off" : "eye");
		hideBtn.addEventListener("click", () => {
			entry.hidden = !entry.hidden;
			void this.persistAndRefresh();
		});

		const removeBtn = actions.createEl("button", {
			cls: "clickable-icon tlm-settings-file-action",
			attr: { "aria-label": "Remove from list" },
		});
		setIcon(removeBtn, "trash-2");
		removeBtn.addEventListener("click", () => {
			void this.confirmAndRemove(index, entry.path);
		});

		main.addEventListener("dragstart", (e) => {
			this.fileDragIndex = index;
			const dt = e.dataTransfer;
			if (dt) {
				dt.setData(FILE_CONFIG_MIME, String(index));
				dt.effectAllowed = "move";
				const rowRect = row.getBoundingClientRect();
				dt.setDragImage(row, e.clientX - rowRect.left, e.clientY - rowRect.top);
			}
			row.addClass("tlm-dragging");
		});
		main.addEventListener("dragend", () => {
			this.fileDragIndex = null;
			row.removeClass("tlm-dragging");
			this.clearFileDropHighlights();
		});

		row.addEventListener("dragover", (e) => {
			if (!this.hasFileConfigDrag(e)) return;
			if (this.fileDragIndex === index) return;
			e.preventDefault();
			if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
			const rel = relationFromPointer(row, e);
			this.showDropIndicator(row, rel);
		});
		row.addEventListener("dragleave", (e) => {
			if (e.relatedTarget instanceof Node && row.contains(e.relatedTarget)) return;
			this.hideDropIndicator();
		});
		row.addEventListener("drop", (e) => {
			if (!this.hasFileConfigDrag(e)) return;
			e.preventDefault();
			const rel = relationFromPointer(row, e);
			this.hideDropIndicator();
			void this.handleFileRowDrop(e, index, rel);
		});
	}

	private hasFileConfigDrag(e: DragEvent): boolean {
		return Boolean(e.dataTransfer?.types.includes(FILE_CONFIG_MIME));
	}

	private showDropIndicator(row: HTMLElement, rel: "before" | "after"): void {
		if (!this.dropIndicator || !this.listEl) return;
		const top = rel === "before" ? row.offsetTop : row.offsetTop + row.offsetHeight;
		this.dropIndicator.style.top = `${top - 1}px`;
		this.dropIndicator.addClass("is-active");
	}

	private hideDropIndicator(): void {
		this.dropIndicator?.removeClass("is-active");
	}

	private clearFileDropHighlights(): void {
		this.hideDropIndicator();
	}

	private async confirmAndRemove(index: number, path: string): Promise<void> {
		const name = displayName(path);
		const confirmed = await confirmDelete(this.app, "Remove file?", (el) => {
			el.appendText(`Remove "${name}" from your lists? The file will `);
			el.createEl("u", { text: "not" });
			el.appendText(" be deleted from your vault.");
		});
		if (!confirmed) return;
		this.plugin.settings.listFiles.splice(index, 1);
		await this.persistAndRefresh();
	}

	private async handleFileRowDrop(
		e: DragEvent,
		targetIndex: number,
		edge: "before" | "after",
	): Promise<void> {
		const raw =
			e.dataTransfer?.getData(FILE_CONFIG_MIME) ??
			(this.fileDragIndex !== null ? String(this.fileDragIndex) : "");
		if (raw === "") return;
		const fromIndex = Number(raw);
		if (!Number.isFinite(fromIndex) || fromIndex < 0) return;
		if (fromIndex === targetIndex) return;

		const files = this.plugin.settings.listFiles;
		const [moved] = files.splice(fromIndex, 1);
		let insertIndex = edge === "before" ? targetIndex : targetIndex + 1;
		if (fromIndex < targetIndex) insertIndex -= 1;
		insertIndex = Math.max(0, Math.min(insertIndex, files.length));
		files.splice(insertIndex, 0, moved);

		await this.persistAndRefresh();
	}

	private openFilePicker(): void {
		new ListFileSuggestModal(this.plugin, () => this.renderFileList()).open();
	}

	private async persistAndRefresh(): Promise<void> {
		await this.plugin.saveSettings();
		this.plugin.refreshTaskListView();
		this.renderFileList();
	}
}
