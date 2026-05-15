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
const TASK_LINE_RE = /^(\s*)-\s*\[([ xX])\]\s*(.*)$/;

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
const INDENT_TAB_SIZE = 4;

/**
 * Visual indent depth from leading whitespace only (what the line shows).
 * One `\t` or each `tabSize` spaces → one prefix column; not relative to other tasks.
 */
export function indentDepthFromLeadingWhitespace(indent: string, tabSize = INDENT_TAB_SIZE): number {
	const columns = indent.replace(/\t/g, " ".repeat(tabSize)).length;
	return Math.floor(columns / tabSize);
}
