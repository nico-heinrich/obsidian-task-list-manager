import { FuzzySuggestModal, TFile } from "obsidian";
import type TaskListManagerPlugin from "./main";
import { getAllConfiguredPaths } from "./settings";

export class ListFileSuggestModal extends FuzzySuggestModal<TFile> {
	private readonly plugin: TaskListManagerPlugin;
	private readonly onAdded: () => void;

	constructor(plugin: TaskListManagerPlugin, onAdded: () => void) {
		super(plugin.app);
		this.plugin = plugin;
		this.onAdded = onAdded;
	}

	getItems(): TFile[] {
		const configured = new Set(getAllConfiguredPaths(this.plugin.settings));
		return this.app.vault.getMarkdownFiles().filter((f) => !configured.has(f.path));
	}

	getItemText(file: TFile): string {
		return file.path;
	}

	onChooseItem(file: TFile): void {
		this.plugin.settings.listFiles.push({ path: file.path });
		void this.plugin.saveSettings().then(() => {
			this.plugin.refreshTaskListView();
			this.onAdded();
		});
	}
}
