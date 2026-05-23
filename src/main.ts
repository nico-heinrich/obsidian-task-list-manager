import { Plugin, TFile, WorkspaceLeaf } from "obsidian";
import {
	DEFAULT_SETTINGS,
	getAllConfiguredPaths,
	normalizeSettings,
	TaskListManagerSettingTab,
	type TaskListManagerSettings,
} from "./settings";
import { TaskManager } from "./task-manager";
import { TASK_LIST_VIEW_TYPE, TaskListView } from "./view";

export default class TaskListManagerPlugin extends Plugin {
	settings: TaskListManagerSettings = DEFAULT_SETTINGS;
	taskManager!: TaskManager;
	private refreshPending = false;

	async onload(): Promise<void> {
		this.taskManager = new TaskManager(this.app);
		await this.loadSettings();

		this.registerView(TASK_LIST_VIEW_TYPE, (leaf) => new TaskListView(leaf, this));

		this.addSettingTab(new TaskListManagerSettingTab(this.app, this));

		this.addRibbonIcon("list-checks", "Open task lists", () => {
			void this.activateView();
		});

		this.addCommand({
			id: "open-task-lists",
			name: "Open task lists",
			callback: () => {
				void this.activateView();
			},
		});

		const configuredPaths = (): Set<string> => new Set(getAllConfiguredPaths(this.settings));

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
		void this.app.workspace.detachLeavesOfType(TASK_LIST_VIEW_TYPE);
	}

	async loadSettings(): Promise<void> {
		this.settings = normalizeSettings(await this.loadData());
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	async activateView(): Promise<void> {
		const { workspace } = this.app;
		const existing = workspace.getLeavesOfType(TASK_LIST_VIEW_TYPE);
		if (existing.length > 0) {
			await workspace.revealLeaf(existing[0]);
			return;
		}

		let leaf: WorkspaceLeaf | null = workspace.getRightLeaf(false);
		if (!leaf) leaf = workspace.getRightLeaf(true);
		if (!leaf) {
			leaf = workspace.getLeaf("tab");
		}
		await leaf.setViewState({ type: TASK_LIST_VIEW_TYPE, active: true });
		await workspace.revealLeaf(leaf);
	}

	/** Debounced refresh of all task list views */
	scheduleRefresh(): void {
		if (this.refreshPending) return;
		this.refreshPending = true;
		window.setTimeout(() => {
			this.refreshPending = false;
			void this.refreshAllViews();
		}, 120);
	}

	/** Alias for settings tab */
	refreshTaskListView(): void {
		this.scheduleRefresh();
	}

	private async refreshAllViews(): Promise<void> {
		for (const leaf of this.app.workspace.getLeavesOfType(TASK_LIST_VIEW_TYPE)) {
			const v = leaf.view;
			if (v instanceof TaskListView) await v.render();
		}
	}
}
