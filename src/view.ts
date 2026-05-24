import {
	App,
	ButtonComponent,
	ItemView,
	Menu,
	Modal,
	Platform,
	TFile,
	ToggleComponent,
	WorkspaceLeaf,
	setIcon,
} from "obsidian";
import { confirmDelete } from "./confirm-delete-modal";
import type TaskListManagerPlugin from "./main";
import { getVisibleListPaths } from "./settings";
import type { ParsedTask, TaskLink } from "./task-parser";
import {
	extractLinksFromTaskBody,
	indentDepthFromLeadingWhitespace,
	parseTasksFromContent,
	segmentTaskBodyByLinks,
} from "./task-parser";
import type { DropRelation } from "./task-manager";

export const TASK_LIST_VIEW_TYPE = "task-list-manager-view";

const TASK_DRAG_MIME = "application/x-obsidian-task-list-item";
const EDIT_SUBTASK_TOGGLE_ID = "tlm-edit-subtask-toggle";

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

class ConfirmDeleteAllModal extends Modal {
	private readonly message: string;
	private readonly resolvePromise: (confirmed: boolean) => void;
	private settled = false;

	constructor(app: App, message: string, resolvePromise: (confirmed: boolean) => void) {
		super(app);
		this.message = message;
		this.resolvePromise = resolvePromise;
	}

	private settle(confirmed: boolean): void {
		if (this.settled) return;
		this.settled = true;
		this.resolvePromise(confirmed);
	}

	onOpen(): void {
		this.modalEl.addClass("tlm-confirm-delete-modal");
		this.setTitle("Delete all checked tasks?");
		const { contentEl } = this;
		contentEl.createEl("p", { text: this.message, cls: "tlm-delete-preview" });

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

export interface EditTaskResult {
	body: string;
	wantsSubtask: boolean;
}

class EditTaskModal extends Modal {
	private readonly initialBody: string;
	private readonly initialSubtask: boolean;
	private readonly resolvePromise: (result: EditTaskResult | null) => void;
	private settled = false;
	private wantsSubtask: boolean;

	constructor(
		app: App,
		initialBody: string,
		initialSubtask: boolean,
		resolvePromise: (result: EditTaskResult | null) => void,
	) {
		super(app);
		this.initialBody = initialBody;
		this.initialSubtask = initialSubtask;
		this.wantsSubtask = initialSubtask;
		this.resolvePromise = resolvePromise;
	}

	private settle(result: EditTaskResult | null): void {
		if (this.settled) return;
		this.settled = true;
		this.resolvePromise(result);
	}

	onOpen(): void {
		this.modalEl.addClass("tlm-edit-task-modal");
		this.setTitle("Edit task");
		const { contentEl } = this;

		const input = contentEl.createEl("input", {
			type: "text",
			cls: "tlm-edit-input",
		});
		input.value = this.initialBody;

		const subtaskRow = contentEl.createDiv({
			cls: "setting-item mod-toggle-setting tlm-edit-subtask-setting",
		});
		const subtaskLabel = subtaskRow.createEl("label", {
			cls: "setting-item-info",
			attr: { for: EDIT_SUBTASK_TOGGLE_ID },
		});
		subtaskLabel.createDiv({ cls: "setting-item-name", text: "Subtask" });
		const subtaskControl = subtaskRow.createDiv({ cls: "setting-item-control" });
		new ToggleComponent(subtaskControl)
			.setValue(this.initialSubtask)
			.onChange((v) => {
				this.wantsSubtask = v;
			});
		const toggleInput = subtaskControl.querySelector<HTMLInputElement>("input[type='checkbox']");
		if (toggleInput) {
			toggleInput.id = EDIT_SUBTASK_TOGGLE_ID;
		}

		const btnRow = contentEl.createDiv({ cls: "modal-button-container" });
		const updateBtn = new ButtonComponent(btnRow).setButtonText("Update").setCta();
		updateBtn.onClick(() => {
			const trimmed = input.value.trim();
			if (!trimmed) return;
			this.settle({ body: trimmed, wantsSubtask: this.wantsSubtask });
			this.close();
		});
		new ButtonComponent(btnRow).setButtonText("Cancel").onClick(() => {
			this.settle(null);
			this.close();
		});

		window.setTimeout(() => {
			input.focus();
			input.select();
		}, 0);
	}

	onClose(): void {
		this.settle(null);
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

export class TaskListView extends ItemView {
	plugin: TaskListManagerPlugin;
	private rootEl!: HTMLDivElement;
	private dragPayload: { path: string; line: number } | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: TaskListManagerPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return TASK_LIST_VIEW_TYPE;
	}

	getDisplayText(): string {
		return "Task lists";
	}

	getIcon(): string {
		return "list-todo";
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
		const allFiles = this.plugin.settings.listFiles;
		const paths = getVisibleListPaths(this.plugin.settings);

		if (paths.length === 0) {
			this.rootEl.empty();
			const text =
				allFiles.length === 0
					? "No lists configured. Add files in plugin settings."
					: "All lists are hidden. Show them in plugin settings.";
			this.rootEl.createDiv({ text, cls: "tlm-empty" });
			this.contentEl.scrollTop = scrollTop;
			return;
		}

		const showLoading = this.rootEl.childElementCount === 0;
		if (showLoading) {
			this.rootEl.empty();
			this.rootEl.createDiv({ cls: "tlm-loading" });
		}

		const sections = await Promise.all(
			paths.map(async (path) => {
				const file = this.app.vault.getAbstractFileByPath(path);
				if (!(file instanceof TFile)) {
					return { path, file: null as const, tasks: [] as ParsedTask[] };
				}
				const content = await this.app.vault.read(file);
				return { path, file, tasks: parseTasksFromContent(path, content) };
			}),
		);

		this.rootEl.empty();
		for (const { path, file, tasks } of sections) {
			const section = this.rootEl.createDiv({ cls: "tlm-file-section" });

			const head = section.createDiv({ cls: "tlm-file-head" });
			const displayName = path.replace(/\.md$/, "");
			const title = head.createEl("span", {
				cls: "tlm-file-title internal-link",
				attr: { "data-tlm-open": path },
				text: displayName,
			});
			if (!file) {
				title.addClass("tlm-missing");
				section.createDiv({
					cls: "tlm-file-missing-msg",
					text: "File not found. Create it or update settings.",
				});
				continue;
			}

			this.renderFileHeadMenu(head, path, displayName, tasks);

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

	private addClickableIcon(parent: HTMLElement, icon: string, label: string): HTMLElement {
		const el = parent.createDiv({ cls: "clickable-icon", attr: { "aria-label": label } });
		setIcon(el, icon);
		return el;
	}

	private openTaskLink(link: TaskLink, sourcePath: string): void {
		if (link.kind === "url") {
			window.open(link.target);
			return;
		}
		void this.app.workspace.openLinkText(link.target, sourcePath, false);
	}

	private renderTaskBody(parent: HTMLElement, body: string, completed: boolean): void {
		const bodyCls = completed ? "tlm-task-body tlm-task-body-done" : "tlm-task-body";
		const bodyEl = parent.createSpan({ cls: bodyCls });
		const segments = segmentTaskBodyByLinks(body);
		const hasLinks = segments.some((s) => s.type === "link");
		if (!hasLinks) {
			bodyEl.setText(body || " ");
			return;
		}
		for (const seg of segments) {
			if (seg.type === "text") {
				if (seg.text) bodyEl.appendText(seg.text);
			} else {
				bodyEl.createSpan({ cls: "tlm-task-body-link", text: seg.text });
			}
		}
	}

	private renderTaskLinkActions(actions: HTMLElement, task: ParsedTask): void {
		const links = extractLinksFromTaskBody(task.body);
		if (links.length === 0) return;

		const linkBtn = this.addClickableIcon(
			actions,
			"external-link",
			links.length === 1 ? "Open link" : "Open link…",
		);
		this.registerDomEvent(linkBtn, "click", (ev) => {
			ev.stopPropagation();
			if (links.length === 1) {
				this.openTaskLink(links[0], task.path);
				return;
			}
			const menu = new Menu();
			for (const link of links) {
				menu.addItem((item) =>
					item.setTitle(link.label).onClick(() => this.openTaskLink(link, task.path)),
				);
			}
			menu.showAtMouseEvent(ev);
		});
	}

	private renderFileHeadMenu(
		head: HTMLDivElement,
		path: string,
		displayName: string,
		tasks: ParsedTask[],
	): void {
		const allChecked = tasks.length > 0 && tasks.every((t) => t.completed);
		const allUnchecked = tasks.length === 0 || tasks.every((t) => !t.completed);
		const checkedCount = tasks.filter((t) => t.completed).length;
		const hasChecked = checkedCount > 0;

		const actions = head.createDiv({ cls: "view-actions" });
		const menuBtn = this.addClickableIcon(actions, "more-horizontal", "More options");
		if (tasks.length === 0) {
			menuBtn.addClass("is-disabled");
			return;
		}

		this.registerDomEvent(menuBtn, "click", (evt) => {
			evt.stopPropagation();
			const menu = new Menu();
			menu.addItem((item) =>
				item
					.setTitle("Check all")
					.setIcon("square-check")
					.setDisabled(allChecked)
					.onClick(() => {
						void this.plugin.taskManager.checkAllTasks(path).then(() => this.plugin.scheduleRefresh());
					}),
			);
			menu.addItem((item) =>
				item
					.setTitle("Uncheck all")
					.setIcon("square")
					.setDisabled(allUnchecked)
					.onClick(() => {
						void this.plugin.taskManager.uncheckAllTasks(path).then(() => this.plugin.scheduleRefresh());
					}),
			);
			menu.addSeparator();
			menu.addItem((item) =>
				item
					.setTitle("Delete all checked")
					.setIcon("trash")
					.setDisabled(!hasChecked)
					.onClick(() => {
						void this.confirmDeleteAllChecked(displayName, checkedCount).then((confirmed) => {
							if (!confirmed) return;
							const runDelete = (): void => {
								void this.plugin.taskManager
									.deleteCompletedTasks(path)
									.then(() => this.plugin.scheduleRefresh());
							};
							if (Platform.isMobile) {
								afterModalCloseMobileDelete(runDelete);
							} else {
								afterModalCloseDesktop(runDelete);
							}
						});
					}),
			);
			menu.showAtMouseEvent(evt);
		});
	}

	private async confirmDeleteAllChecked(displayName: string, count: number): Promise<boolean> {
		const taskWord = count === 1 ? "task" : "tasks";
		const message = `Delete ${count} completed ${taskWord} from ${displayName}?`;
		return new Promise((resolve) => {
			const modal = new ConfirmDeleteAllModal(this.app, message, resolve);
			modal.open();
		});
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

		this.renderTaskBody(hit, task.body, task.completed);

		const actions = main.createDiv({ cls: "view-actions" });
		this.renderTaskLinkActions(actions, task);
		if (task.completed) {
			const del = this.addClickableIcon(actions, "trash", "Delete task");
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
		} else {
			const edit = this.addClickableIcon(actions, "pencil", "Edit task");
			this.registerDomEvent(edit, "click", async (ev) => {
				ev.stopPropagation();
				const result = await this.openEditTask(task);
				if (!result) return;
				const { path, line } = task;
				const runUpdate = (): void => {
					void this.plugin.taskManager
						.updateTask(path, line, result.body, result.wantsSubtask)
						.then(() => this.plugin.scheduleRefresh());
				};
				if (Platform.isMobile) {
					afterModalCloseMobile(runUpdate);
				} else {
					afterModalCloseDesktop(runUpdate);
				}
			});
		}

		this.registerDomEvent(main, "dragstart", (e) => {
			this.dragPayload = { path: task.path, line: task.line };
			e.dataTransfer?.setData(TASK_DRAG_MIME, JSON.stringify(this.dragPayload));
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
		return confirmDelete(this.app, "Delete task?", preview);
	}

	private async openEditTask(task: ParsedTask): Promise<EditTaskResult | null> {
		const initialSubtask = indentDepthFromLeadingWhitespace(task.indent) >= 1;
		return new Promise((resolve) => {
			const modal = new EditTaskModal(this.app, task.body, initialSubtask, resolve);
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
		const btn = wrap.createEl("button", { cls: "tlm-add-btn mod-cta" });
		setIcon(btn, "plus");
		btn.setAttribute("aria-label", "Add task");
		const syncAddEnabled = () => {
			btn.disabled = !input.value.trim();
		};
		syncAddEnabled();
		const submit = async () => {
			const v = input.value;
			if (!v.trim()) return;
			input.value = "";
			syncAddEnabled();
			await this.plugin.taskManager.addTask(path, v);
			this.plugin.scheduleRefresh();
		};
		this.registerDomEvent(btn, "click", () => void submit());
		this.registerDomEvent(input, "input", syncAddEnabled);
		this.registerDomEvent(input, "keydown", (ev) => {
			if (ev.key === "Enter") void submit();
		});
	}

	private hasTaskDrag(e: DragEvent): boolean {
		return Boolean(e.dataTransfer?.types.includes(TASK_DRAG_MIME));
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
			e.dataTransfer?.getData(TASK_DRAG_MIME) ||
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
			e.dataTransfer?.getData(TASK_DRAG_MIME) ||
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
