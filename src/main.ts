import { Plugin, TFile, WorkspaceLeaf } from "obsidian";
import {
	DEFAULT_SETTINGS,
	parseConfiguredPaths,
	TodoListManagerSettingTab,
	type TodoListManagerSettings,
} from "./settings";
import { TaskManager } from "./task-manager";
import { TODO_VIEW_TYPE, TodoListView } from "./view";

export default class TodoListManagerPlugin extends Plugin {
	settings: TodoListManagerSettings = DEFAULT_SETTINGS;
	taskManager!: TaskManager;
	private refreshPending = false;

	async onload(): Promise<void> {
		this.taskManager = new TaskManager(this.app);
		await this.loadSettings();

		this.registerView(TODO_VIEW_TYPE, (leaf) => new TodoListView(leaf, this));

		this.addSettingTab(new TodoListManagerSettingTab(this.app, this));

		this.addRibbonIcon("list-checks", "Open todo lists", () => {
			void this.activateView();
		});

		this.addCommand({
			id: "open-todo-view",
			name: "Open todo list manager",
			callback: () => {
				void this.activateView();
			},
		});

		const configuredPaths = (): Set<string> =>
			new Set(parseConfiguredPaths(this.settings.todoFilePaths));

		const refreshIfConfiguredMd = (file: unknown): void => {
			if (!(file instanceof TFile) || file.extension !== "md") return;
			if (configuredPaths().has(file.path)) this.scheduleRefresh();
		};

		this.registerEvent(this.app.vault.on("modify", refreshIfConfiguredMd));
		this.registerEvent(this.app.vault.on("create", refreshIfConfiguredMd));
		this.registerEvent(this.app.vault.on("delete", refreshIfConfiguredMd));
		this.registerEvent(this.app.vault.on("rename", refreshIfConfiguredMd));
	}

	onunload(): void {
		void this.app.workspace.detachLeavesOfType(TODO_VIEW_TYPE);
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData()) as TodoListManagerSettings;
		if (!this.settings.todoFilePaths.trim()) {
			this.settings.todoFilePaths = DEFAULT_SETTINGS.todoFilePaths;
		}
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	async activateView(): Promise<void> {
		const { workspace } = this.app;
		const existing = workspace.getLeavesOfType(TODO_VIEW_TYPE);
		if (existing.length > 0) {
			await workspace.revealLeaf(existing[0]);
			return;
		}

		let leaf: WorkspaceLeaf | null = workspace.getRightLeaf(false);
		if (!leaf) leaf = workspace.getRightLeaf(true);
		if (!leaf) {
			leaf = workspace.getLeaf("tab");
		}
		await leaf.setViewState({ type: TODO_VIEW_TYPE, active: true });
		await workspace.revealLeaf(leaf);
	}

	/** Debounced refresh of all todo manager views */
	scheduleRefresh(): void {
		if (this.refreshPending) return;
		this.refreshPending = true;
		window.setTimeout(() => {
			this.refreshPending = false;
			void this.refreshAllViews();
		}, 120);
	}

	/** Alias for settings tab */
	refreshTodoView(): void {
		this.scheduleRefresh();
	}

	private async refreshAllViews(): Promise<void> {
		for (const leaf of this.app.workspace.getLeavesOfType(TODO_VIEW_TYPE)) {
			const v = leaf.view;
			if (v instanceof TodoListView) await v.render();
		}
	}
}
