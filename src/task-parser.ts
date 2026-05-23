export interface ParsedTask {
	/** Vault-relative path */
	path: string;
	/** 1-based line number in the file */
	line: number;
	indent: string;
	completed: boolean;
	/** Text after `- [ ]` / `- [x]` */
	body: string;
	rawLine: string;
}

// Markdown task: optional indent, -, space, [ ], space, rest
export const TASK_LINE_RE = /^(\s*)-\s*\[([ xX])\]\s*(.*)$/;

export function parseTasksFromContent(path: string, content: string): ParsedTask[] {
	const lines = content.split(/\r?\n/);
	const tasks: ParsedTask[] = [];
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const m = line.match(TASK_LINE_RE);
		if (!m) continue;
		const indent = m[1] ?? "";
		const mark = (m[2] ?? " ").toLowerCase();
		const body = m[3] ?? "";
		tasks.push({
			path,
			line: i + 1,
			indent,
			completed: mark === "x",
			body,
			rawLine: line,
		});
	}
	return tasks;
}

/** Obsidian default tab width; each tab or block of this many spaces is one guide column. */
export const INDENT_TAB_SIZE = 4;

/** One visual indent level (4 spaces). */
export const INDENT_ONE_LEVEL = " ".repeat(INDENT_TAB_SIZE);

/**
 * Visual indent depth from leading whitespace only (what the line shows).
 * One `\t` or each `tabSize` spaces → one prefix column; not relative to other tasks.
 */
export function indentDepthFromLeadingWhitespace(indent: string, tabSize = INDENT_TAB_SIZE): number {
	const columns = indent.replace(/\t/g, " ".repeat(tabSize)).length;
	return Math.floor(columns / tabSize);
}

/**
 * Resolve leading whitespace when editing a task's subtask toggle.
 * Depth 0↔1 via toggle; depth ≥2 unchanged if subtask on, stripped to top-level if off.
 */
export function resolveIndentForEdit(originalIndent: string, wantsSubtask: boolean): string {
	const depth = indentDepthFromLeadingWhitespace(originalIndent);
	if (depth >= 2) {
		return wantsSubtask ? originalIndent : "";
	}
	if (depth === 1) {
		return wantsSubtask ? originalIndent : "";
	}
	return wantsSubtask ? INDENT_ONE_LEVEL : "";
}

export function formatTaskLine(indent: string, completed: boolean, body: string): string {
	const mark = completed ? "x" : " ";
	return `${indent}- [${mark}] ${body}`;
}
