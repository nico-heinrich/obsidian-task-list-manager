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

export type TaskLinkKind = "wiki" | "url";

export interface TaskLink {
	kind: TaskLinkKind;
	/** Full matched substring */
	raw: string;
	/** Value passed to open handler */
	target: string;
	/** Menu item title when multiple links */
	label: string;
	/** Start index in task body */
	start: number;
	/** End index (exclusive) in task body */
	end: number;
}

export type TaskBodySegment =
	| { type: "text"; text: string }
	| { type: "link"; text: string; kind: TaskLinkKind };

const WIKI_LINK_RE = /\[\[([^\]]+)\]\]/g;
const URL_LINK_RE = /(?:https?:\/\/|www\.)[^\s<>\[\]()]+/gi;
const URL_TRAILING_PUNCT_RE = /[.,;:!?)]+$/;

function rangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
	return aStart < bEnd && bStart < aEnd;
}

/** Prepends `https://` for `www.` hosts so `window.open` works reliably. */
export function normalizeUrlTarget(target: string): string {
	if (/^www\./i.test(target)) {
		return `https://${target}`;
	}
	return target;
}

/** Wiki links `[[...]]` and bare `http(s)://` / `www.` URLs in task body text, in source order. */
export function extractLinksFromTaskBody(body: string): TaskLink[] {
	const found: { index: number; link: TaskLink }[] = [];

	let m: RegExpExecArray | null;
	WIKI_LINK_RE.lastIndex = 0;
	while ((m = WIKI_LINK_RE.exec(body)) !== null) {
		const inner = m[1];
		const pipe = inner.indexOf("|");
		const target = (pipe >= 0 ? inner.slice(0, pipe) : inner).trim();
		const label = (pipe >= 0 ? inner.slice(pipe + 1) : inner).trim() || target;
		const start = m.index;
		const end = start + m[0].length;
		found.push({
			index: start,
			link: { kind: "wiki", raw: m[0], target, label, start, end },
		});
	}

	const wikiRanges = found.map((f) => ({ start: f.index, end: f.index + f.link.raw.length }));

	URL_LINK_RE.lastIndex = 0;
	while ((m = URL_LINK_RE.exec(body)) !== null) {
		const start = m.index;
		const end = start + m[0].length;
		if (wikiRanges.some((w) => rangesOverlap(start, end, w.start, w.end))) {
			continue;
		}
		const raw = m[0];
		const target = normalizeUrlTarget(raw.replace(URL_TRAILING_PUNCT_RE, ""));
		found.push({
			index: start,
			link: { kind: "url", raw, target, label: raw.replace(URL_TRAILING_PUNCT_RE, ""), start, end },
		});
	}

	found.sort((a, b) => a.index - b.index);
	return found.map((f) => f.link);
}

/** Split task body into plain text and link spans for display. */
export function segmentTaskBodyByLinks(body: string): TaskBodySegment[] {
	const links = extractLinksFromTaskBody(body);
	if (links.length === 0) {
		return [{ type: "text", text: body || " " }];
	}

	const segments: TaskBodySegment[] = [];
	let pos = 0;
	for (const link of links) {
		if (link.start > pos) {
			segments.push({ type: "text", text: body.slice(pos, link.start) });
		}
		const displayText = link.kind === "wiki" ? link.label : link.raw;
		segments.push({ type: "link", text: displayText, kind: link.kind });
		pos = link.end;
	}
	if (pos < body.length) {
		segments.push({ type: "text", text: body.slice(pos) });
	}
	return segments.length > 0 ? segments : [{ type: "text", text: " " }];
}
