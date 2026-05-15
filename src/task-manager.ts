import type { App, TFile } from "obsidian";

function splitLines(content: string): string[] {
	return content.split(/\r?\n/);
}

function joinLines(lines: string[]): string {
	return lines.join("\n");
}

export type DropRelation = "before" | "after" | "append-end";

export class TaskManager {
	constructor(private readonly app: App) {}

	private getFile(path: string): TFile | null {
		const f = this.app.vault.getAbstractFileByPath(path);
		if (f && "extension" in f && f.extension === "md") return f as TFile;
		return null;
	}

	async toggleTask(path: string, line: number): Promise<void> {
		const file = this.getFile(path);
		if (!file) return;
		await this.app.vault.process(file, (data) => {
			const lines = splitLines(data);
			const idx = line - 1;
			if (idx < 0 || idx >= lines.length) return data;
			const raw = lines[idx];
			if (/\[ \]/.test(raw)) lines[idx] = raw.replace(/\[ \]/, "[x]");
			else if (/\[[xX]\]/.test(raw)) lines[idx] = raw.replace(/\[[xX]\]/, "[ ]");
			return joinLines(lines);
		});
	}

	async deleteTask(path: string, line: number): Promise<void> {
		const file = this.getFile(path);
		if (!file) return;
		await this.app.vault.process(file, (data) => {
			const lines = splitLines(data);
			const idx = line - 1;
			if (idx < 0 || idx >= lines.length) return data;
			lines.splice(idx, 1);
			return joinLines(lines);
		});
	}

	async addTask(path: string, body: string): Promise<void> {
		const file = this.getFile(path);
		if (!file) return;
		const trimmed = body.trim();
		if (!trimmed) return;
		await this.app.vault.process(file, (data) => {
			const line = `- [ ] ${trimmed}`;
			if (!data) return line;
			return data.endsWith("\n") ? `${data}${line}` : `${data}\n${line}`;
		});
	}

	/**
	 * Move task line between files or reorder within one file.
	 * @param anchorLine 1-based line in dropPath when relation is before/after; ignored for append-end
	 */
	async moveTaskLine(
		dragPath: string,
		dragLine: number,
		dropPath: string,
		anchorLine: number | null,
		relation: DropRelation,
	): Promise<void> {
		if (relation !== "append-end" && anchorLine == null) return;

		if (dragPath === dropPath) {
			await this.reorderSameFile(dragPath, dragLine, anchorLine, relation);
			return;
		}

		const fromFile = this.getFile(dragPath);
		const toFile = this.getFile(dropPath);
		if (!fromFile || !toFile) return;

		let lineToMove = "";
		await this.app.vault.process(fromFile, (data) => {
			const lines = splitLines(data);
			const idx = dragLine - 1;
			if (idx < 0 || idx >= lines.length) return data;
			lineToMove = lines[idx];
			lines.splice(idx, 1);
			return joinLines(lines);
		});

		if (!lineToMove) return;

		await this.app.vault.process(toFile, (data) => {
			const lines = splitLines(data);
			let insertIdx: number;
			if (relation === "append-end") {
				insertIdx = lines.length;
			} else {
				const anchorIdx = (anchorLine as number) - 1;
				if (anchorIdx < 0 || anchorIdx > lines.length) insertIdx = lines.length;
				else insertIdx = relation === "before" ? anchorIdx : anchorIdx + 1;
			}
			insertIdx = Math.max(0, Math.min(insertIdx, lines.length));
			lines.splice(insertIdx, 0, lineToMove);
			return joinLines(lines);
		});
	}

	private async reorderSameFile(
		path: string,
		dragLine: number,
		anchorLine: number | null,
		relation: DropRelation,
	): Promise<void> {
		const file = this.getFile(path);
		if (!file) return;

		await this.app.vault.process(file, (data) => {
			const lines = splitLines(data);
			const dragIdx = dragLine - 1;
			if (dragIdx < 0 || dragIdx >= lines.length) return data;

			if (relation !== "append-end") {
				const anchorIdx = (anchorLine as number) - 1;
				if (anchorIdx < 0 || anchorIdx >= lines.length) return data;
				if (dragIdx === anchorIdx) return data;
			}

			const [row] = lines.splice(dragIdx, 1);

			let insertIdx: number;
			if (relation === "append-end") {
				insertIdx = lines.length;
			} else {
				let anchorIdx = (anchorLine as number) - 1;
				// Anchor referred to pre-removal indices; adjust if we removed a line above it
				if (dragIdx < anchorIdx) anchorIdx -= 1;
				insertIdx = relation === "before" ? anchorIdx : anchorIdx + 1;
			}

			insertIdx = Math.max(0, Math.min(insertIdx, lines.length));
			lines.splice(insertIdx, 0, row);
			return joinLines(lines);
		});
	}
}
