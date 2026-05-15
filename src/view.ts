import {
	App,
	ButtonComponent,
	ItemView,
	Modal,
	Platform,
	TFile,
	WorkspaceLeaf,
	setIcon,
} from "obsidian";
import type TodoListManagerPlugin from "./main";
import { resolveTodoFilePaths } from "./settings";
import type { ParsedTask } from "./task-parser";
import { indentDepthFromLeadingWhitespace, parseTasksFromContent } from "./task-parser";
import type { DropRelation } from "./task-manager";

export const TODO_VIEW_TYPE = "todo-list-manager-view";

const MIME = "application/x-obsidian-todo-task";

/** Mobile modal close animation is ~200–300ms; vault + full render during that window causes jank. */
const MOBILE_MODAL_CLOSE_MS = 300;
const MOBILE_DELETE_AFTER_MS = MOBILE_MODAL_CLOSE_MS + 40;

function afterModalCloseMobile(work: () => void): void {
	window.setTimeout(work, MOBILE_MODAL_CLOSE_MS);
}

function afterModalCloseMobileDelete(work: () => void): void {
	window.setTimeout(work, MOBILE_DELETE_AFTER_MS);
}

function afterModalCloseDesktop(work: () => void): void {
	window.requestAnimationFrame(() => {
		window.requestAnimationFrame(work);
	});
}

class ConfirmDeleteModal extends Modal {
	private taskPreview: string;
	private readonly resolvePromise: (confirmed: boolean) => void;
	private settled = false;

	constructor(app: App, taskPreview: string, resolvePromise: (confirmed: boolean) => void) {
		super(app);
		this.taskPreview = taskPreview;
		this.resolvePromise = resolvePromise;
	}

	private settle(confirmed: boolean): void {
		if (this.settled) return;
		this.settled = true;
		this.resolvePromise(confirmed);
	}

	onOpen(): void {
		this.modalEl.addClass("tlm-confirm-delete-modal");
		this.setTitle("Delete task?");
		const { contentEl } = this;
		contentEl.createEl("p", { text: this.taskPreview, cls: "tlm-delete-preview" });

		const btnRow = contentEl.createDiv({ cls: "modal-button-container" });
		new ButtonComponent(btnRow).setButtonText("Delete").setWarning().onClick(() => {
			this.settle(true);
			this.close();
		});
		new ButtonComponent(btnRow)
			.setButtonText("Cancel")
			.onClick(() => {
				this.settle(false);
				this.close();
			});
	}

	onClose(): void {
		this.settle(false);
		const { contentEl } = this;
		const empty = (): void => {
			contentEl.empty();
		};
		if (Platform.isMobile) {
			afterModalCloseMobile(empty);
		} else {
			empty();
		}
	}
}

export class TodoListView extends ItemView {
	plugin: TodoListManagerPlugin;
	private rootEl!: HTMLDivElement;
	private dragPayload: { path: string; line: number } | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: TodoListManagerPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return TODO_VIEW_TYPE;
	}

	getDisplayText(): string {
		return "Todo lists";
	}

	getIcon(): string {
		return "list-checks";
	}

	async onOpen(): Promise<void> {
		this.rootEl = this.contentEl.createDiv({ cls: "tlm-root" });
		this.registerDomEvent(this.rootEl, "click", (evt) => {
			const t = evt.target as HTMLElement | null;
			if (!t) return;
			const open = t.closest("[data-tlm-open]");
			if (open) {
				const path = open.getAttribute("data-tlm-open");
				if (path) void this.app.workspace.openLinkText(path, "", false);
			}
		});
		await this.render();
	}

	async onClose(): Promise<void> {
		this.contentEl.empty();
	}

	async render(): Promise<void> {
		const scrollTop = this.contentEl.scrollTop;
		this.rootEl.empty();
		const paths = resolveTodoFilePaths(this.app.vault, this.plugin.settings.todoFilePaths);
		if (paths.length === 0) {
			this.rootEl.createDiv({
				text: "No todo files configured. Add paths in plugin settings.",
				cls: "tlm-empty",
			});
			this.contentEl.scrollTop = scrollTop;
			return;
		}

		for (const path of paths) {
			const file = this.app.vault.getAbstractFileByPath(path);
			const section = this.rootEl.createDiv({ cls: "tlm-file-section" });

			const head = section.createDiv({ cls: "tlm-file-head" });
			const displayName = path.replace(/\.md$/, "");
			const title = head.createEl("span", {
				cls: "tlm-file-title internal-link",
				attr: { "data-tlm-open": path },
				text: displayName,
			});
			if (!(file instanceof TFile)) {
				title.addClass("tlm-missing");
				section.createDiv({
					cls: "tlm-file-missing-msg",
					text: "File not found. Create it or update settings.",
				});
				continue;
			}

			const content = await this.app.vault.read(file);
			const tasks = parseTasksFromContent(path, content);

			const listEl = section.createDiv({ cls: "tlm-task-list" });
			for (const task of tasks) {
				this.renderTaskRow(listEl, task, indentDepthFromLeadingWhitespace(task.indent));
			}
			if (tasks.length === 0) {
				this.renderEmptyListDropZone(listEl, path);
			}

			this.renderAddRow(section, path);
		}
		this.contentEl.scrollTop = scrollTop;
	}

	private renderEmptyListDropZone(listEl: HTMLDivElement, path: string): void {
		const zone = listEl.createDiv({ cls: "tlm-empty-list-drop" });
		zone.createSpan({
			cls: "tlm-empty-list-drop-label",
			text: "No tasks — drop here to move from another list",
		});

		this.registerDomEvent(zone, "dragover", (e) => {
			if (!this.hasTaskDrag(e)) return;
			e.preventDefault();
			if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
			zone.addClass("tlm-empty-list-drop-active");
		});
		this.registerDomEvent(zone, "dragleave", () => {
			zone.removeClass("tlm-empty-list-drop-active");
		});
		this.registerDomEvent(zone, "drop", (e) => {
			if (!this.hasTaskDrag(e)) return;
			e.preventDefault();
			zone.removeClass("tlm-empty-list-drop-active");
			void this.handleDropOnEmptyList(e, path);
		});
	}

	private renderTaskRow(parent: HTMLDivElement, task: ParsedTask, depth: number): void {
		const row = parent.createDiv({ cls: "tlm-task-row" });
		row.dataset.tlmPath = task.path;
		row.dataset.tlmLine = String(task.line);

		const main = row.createDiv({ cls: "tlm-task-row-main" });
		main.setAttr("draggable", "true");

		if (depth > 0) {
			const prefix = main.createDiv({ cls: "tlm-task-prefix" });
			for (let d = 0; d < depth; d++) {
				const cell = prefix.createDiv({ cls: "tlm-depth-cell" });
				if (d === depth - 1) {
					cell.addClass("tlm-depth-arrow");
					setIcon(cell, "corner-down-right");
				}
			}
		}

		const hit = main.createEl("label", { cls: "tlm-task-hit" });
		const check = hit.createEl("input", { type: "checkbox" });
		check.checked = task.completed;
		check.addClass("tlm-checkbox");
		this.registerDomEvent(check, "click", (ev) => {
			ev.preventDefault();
			void this.plugin.taskManager.toggleTask(task.path, task.line).then(() => this.plugin.scheduleRefresh());
		});

		const bodyCls = task.completed ? "tlm-task-body tlm-task-body-done" : "tlm-task-body";
		hit.createSpan({ cls: bodyCls, text: task.body || " " });

		const del = main.createEl("button", { cls: "tlm-icon-btn" });
		setIcon(del, "trash");
		del.setAttr("aria-label", "Delete task");
		this.registerDomEvent(del, "click", async (ev) => {
			ev.stopPropagation();
			const confirmed = await this.confirmDelete(task.body);
			if (!confirmed) return;
			const { path, line } = task;
			const runDelete = (): void => {
				void this.plugin.taskManager.deleteTask(path, line).then(() => this.plugin.scheduleRefresh());
			};
			if (Platform.isMobile) {
				afterModalCloseMobileDelete(runDelete);
			} else {
				afterModalCloseDesktop(runDelete);
			}
		});

		this.registerDomEvent(main, "dragstart", (e) => {
			this.dragPayload = { path: task.path, line: task.line };
			e.dataTransfer?.setData(MIME, JSON.stringify(this.dragPayload));
			e.dataTransfer?.setData("text/plain", task.rawLine);
			if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
			main.addClass("tlm-dragging");
		});
		this.registerDomEvent(main, "dragend", () => {
			main.removeClass("tlm-dragging");
			this.dragPayload = null;
			this.clearDropHighlights();
		});

		this.registerDomEvent(row, "dragover", (e) => {
			if (!this.hasTaskDrag(e)) return;
			if (this.dragPayload && this.dragPayload.path === task.path && this.dragPayload.line === task.line) {
				return;
			}
			e.preventDefault();
			if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
			const rel = this.relationFromPointer(row, e);
			row.toggleClass("tlm-drop-before", rel === "before");
			row.toggleClass("tlm-drop-after", rel === "after");
		});
		this.registerDomEvent(row, "dragleave", () => {
			row.removeClass("tlm-drop-before");
			row.removeClass("tlm-drop-after");
		});
		this.registerDomEvent(row, "drop", (e) => {
			if (!this.hasTaskDrag(e)) return;
			e.preventDefault();
			const rel = this.relationFromPointer(row, e);
			row.removeClass("tlm-drop-before");
			row.removeClass("tlm-drop-after");
			void this.handleDropOnTask(e, task, rel);
		});
	}

	private async confirmDelete(taskBody: string): Promise<boolean> {
		const preview = taskBody.length > 50 ? taskBody.substring(0, 50) + "..." : taskBody;
		return new Promise((resolve) => {
			const modal = new ConfirmDeleteModal(this.app, preview, resolve);
			modal.open();
		});
	}

	private renderAddRow(section: HTMLDivElement, path: string): void {
		const wrap = section.createDiv({ cls: "tlm-add-row" });
		const input = wrap.createEl("input", {
			type: "text",
			placeholder: "New task …",
			cls: "tlm-add-input",
		});
		const btn = wrap.createEl("button", { cls: "tlm-add-btn" });
		setIcon(btn, "plus");
		btn.setAttribute("aria-label", "Add task");
		const submit = async () => {
			const v = input.value;
			if (!v.trim()) return;
			input.value = "";
			await this.plugin.taskManager.addTask(path, v);
			this.plugin.scheduleRefresh();
		};
		this.registerDomEvent(btn, "click", () => void submit());
		this.registerDomEvent(input, "keydown", (ev) => {
			if (ev.key === "Enter") void submit();
		});
	}

	private hasTaskDrag(e: DragEvent): boolean {
		return Boolean(e.dataTransfer?.types.includes(MIME));
	}

	private relationFromPointer(row: HTMLElement, e: DragEvent): "before" | "after" {
		const r = row.getBoundingClientRect();
		const mid = r.top + r.height / 2;
		return e.clientY < mid ? "before" : "after";
	}

	private clearDropHighlights(): void {
		this.rootEl.querySelectorAll(".tlm-drop-before, .tlm-drop-after, .tlm-empty-list-drop-active").forEach((el) => {
			el.classList.remove("tlm-drop-before", "tlm-drop-after", "tlm-empty-list-drop-active");
		});
	}

	private async handleDropOnEmptyList(e: DragEvent, dropPath: string): Promise<void> {
		const raw =
			e.dataTransfer?.getData(MIME) ||
			(this.dragPayload ? JSON.stringify(this.dragPayload) : "");
		if (!raw) return;
		let parsed: { path: string; line: number };
		try {
			parsed = JSON.parse(raw) as { path: string; line: number };
		} catch {
			return;
		}
		if (parsed.path === dropPath) return;

		await this.plugin.taskManager.moveTaskLine(parsed.path, parsed.line, dropPath, null, "append-end");
		this.plugin.scheduleRefresh();
	}

	private async handleDropOnTask(
		e: DragEvent,
		target: ParsedTask,
		edge: "before" | "after",
	): Promise<void> {
		const raw =
			e.dataTransfer?.getData(MIME) ||
			(this.dragPayload ? JSON.stringify(this.dragPayload) : "");
		if (!raw) return;
		let parsed: { path: string; line: number };
		try {
			parsed = JSON.parse(raw) as { path: string; line: number };
		} catch {
			return;
		}
		const relation: DropRelation = edge === "before" ? "before" : "after";
		const anchorLine = target.line;

		if (parsed.path === target.path && parsed.line === target.line) return;

		await this.plugin.taskManager.moveTaskLine(parsed.path, parsed.line, target.path, anchorLine, relation);
		this.plugin.scheduleRefresh();
	}
}
