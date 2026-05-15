import { App, PluginSettingTab, Setting, Vault } from "obsidian";
import type TodoListManagerPlugin from "./main";

export interface TodoListManagerSettings {
	/** Comma-separated vault-relative paths to markdown files */
	todoFilePaths: string;
}

export const DEFAULT_SETTINGS: TodoListManagerSettings = {
	todoFilePaths: "todo.md",
};

export function parseConfiguredPaths(raw: string): string[] {
	return raw
		.split(/[,\n]/)
		.map((s) => s.trim())
		.filter((s) => s.length > 0);
}

/** Vault-relative paths from the comma- or newline-separated setting, in listed order. */
export function resolveTodoFilePaths(_vault: Vault, raw: string): string[] {
	return parseConfiguredPaths(raw);
}

export class TodoListManagerSettingTab extends PluginSettingTab {
	plugin: TodoListManagerPlugin;

	constructor(app: App, plugin: TodoListManagerPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl("h2", { text: "Todo List Manager" });

		new Setting(containerEl)
			.setName("Todo files")
			.setDesc(
				"Comma- or newline-separated vault-relative paths. Order here is the order shown in the todo view.",
			)
			.addTextArea((text) => {
				text
					.setPlaceholder("e.g. todo.md, backlog.md, projects/tasks.md")
					.setValue(this.plugin.settings.todoFilePaths)
					.onChange(async (value) => {
						this.plugin.settings.todoFilePaths = value;
						await this.plugin.saveSettings();
						this.plugin.refreshTodoView();
					});
				text.inputEl.rows = 4;
				text.inputEl.classList.add("tlm-todo-files-textarea");
				text.inputEl.style.width = "100%";
			});
	}
}
