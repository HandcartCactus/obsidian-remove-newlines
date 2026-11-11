// Syntax-aware blank-line detection for removeBlankLines.
// Design document: docs/useful-blank-lines-plan.md

export type LineKind =
	| "blank"
	| "text"
	| "tableRow"
	| "tableDelimiter"
	| "atxHeading"
	| "setextTitle"
	| "setextUnderline"
	| "fenceOpen"
	| "fenceClose"
	| "hr"
	| "blockquote"
	| "callout"
	| "listItem"
	| "frontmatterFence";

export type Region = "none" | "fencedCode" | "frontmatter" | "math" | "comment";

export interface ScannedLine {
	index: number;
	raw: string;
	kind: LineKind;
	region: Region;
}

export interface BlankRun {
	/** Index of the first blank line of the run. */
	start: number;
	/** Index just past the last blank line of the run. */
	end: number;
	/** Nearest non-blank line before the run (ignoring protected lines). */
	before: ScannedLine | null;
	/** Nearest non-blank line after the run (ignoring protected lines). */
	after: ScannedLine | null;
	/** True when any registered rule voted the run useful. */
	useful: boolean;
}

export interface ScannedDoc {
	lines: ScannedLine[];
	/** Maximal runs of unprotected blank lines that sit between content. */
	runs: BlankRun[];
}

export interface UsefulBlankLineRule {
	id: string;
	isUseful(run: BlankRun, doc: ScannedDoc): boolean;
}

const blankRE = /^[ \t]*$/;
const tableRowRE = /^[ \t]*\|/;
const tableDelimiterRE = /^[ \t]*\|?[ \t]*:?-+:?[ \t]*\|/;
const atxHeadingRE = /^ {0,3}#{1,6}(?:[ \t]|$)/;
const setextUnderlineRE = /^ {0,3}(=+|-+)[ \t]*$/;
const fenceRE = /^ {0,3}(`{3,}|~{3,})/;
const hrRE = /^ {0,3}((\*[ \t]*){3,}|(-[ \t]*){3,}|(_[ \t]*){3,})$/;
const blockquoteRE = /^ {0,3}>/;
const calloutRE = /^ {0,3}>[ \t]*\[[A-Za-z][A-Za-z0-9-]*[+-]?\][ \t]*/;
const listItemRE = /^(?: {0,3}[-*+][ \t]+| {0,3}\d{1,9}[.)][ \t]+)/;
const mathOpenRE = /^ {0,3}\$\$(?!.*\$\$)/;
const mathCloseRE = /\$\$[ \t]*$/;
const fmDashOpenRE = /^---[ \t]*$/;
const fmPlusOpenRE = /^\+\+\+[ \t]*$/;
const fmDashCloseRE = /^(---|\.\.\.)[ \t]*$/;
const fmPlusCloseRE = /^\+\+\+[ \t]*$/;

function classifyLine(raw: string, prev: ScannedLine | null, lines: ScannedLine[]): LineKind {
	if (blankRE.test(raw)) return "blank";
	if (fenceRE.test(raw)) return "fenceOpen"; // → fenceClose once matched as closer
	if (mathOpenRE.test(raw)) return "fenceOpen"; // $$ opener, same handling
	if (calloutRE.test(raw)) return "callout";
	if (blockquoteRE.test(raw)) return "blockquote";
	if (tableRowRE.test(raw)) {
		return tableDelimiterRE.test(raw) ? "tableDelimiter" : "tableRow";
	}
	if (atxHeadingRE.test(raw)) return "atxHeading";
	// A dash/equals line is the previous text line's setext underline when
	// they are adjacent, or separated only by blank lines. The latter stays
	// ambiguous, but keeping the heading reading is safe: R2/R3 preserve the
	// run either way, while misreading a real heading's underline as an hr
	// would delete it and split the heading from its title.
	if (setextUnderlineRE.test(raw)) {
		let p = prev;
		while (p && p.kind === "blank") p = lines[p.index - 1] ?? null;
		if (p && p.kind === "text") return "setextUnderline";
	}
	if (hrRE.test(raw)) return "hr";
	if (listItemRE.test(raw)) return "listItem";
	return "text";
}

export function scanDocument(text: string): ScannedDoc {
	const raws = text.split(/\r?\n/);
	const lines: ScannedLine[] = [];
	for (let i = 0; i < raws.length; i++) {
		const prev = lines.length ? lines[lines.length - 1] : null;
		lines.push({ index: i, raw: raws[i], kind: classifyLine(raws[i], prev, lines), region: "none" });
	}

	// YAML/TOML frontmatter: opener on line 0 with a matching closer below.
	if (raws.length > 1) {
		const isPlus = fmPlusOpenRE.test(raws[0]);
		if (isPlus || fmDashOpenRE.test(raws[0])) {
			const closeRE = isPlus ? fmPlusCloseRE : fmDashCloseRE;
			let closed = false;
			for (let i = 1; i < raws.length; i++) {
				if (closeRE.test(raws[i])) {
					for (let j = 0; j <= i; j++) {
						lines[j].region = "frontmatter";
						lines[j].kind = "frontmatterFence";
					}
					closed = true;
					break;
				}
			}
			// Unclosed "---" is just a thematic break, not frontmatter.
			if (!closed) lines[0].kind = classifyLine(raws[0], null, lines);
		}
	}

	// Protected regions; also resolves fenceOpen candidates to fenceClose.
	let code: { ch: string; len: number } | null = null;
	let inMath = false;
	let inComment = false;
	for (const line of lines) {
		if (line.region === "frontmatter") continue;
		if (code) {
			line.region = "fencedCode";
			const m = /^[ \t]*(`{3,}|~{3,})[ \t]*$/.exec(line.raw);
			if (m && m[1][0] === code.ch && m[1].length >= code.len) {
				line.kind = "fenceClose";
				code = null;
			} else if (fenceRE.test(line.raw) || mathOpenRE.test(line.raw)) {
				line.kind = "text"; // fence-like marker inside a code block
			}
			continue;
		}
		if (inMath) {
			line.region = "math";
			if (mathCloseRE.test(line.raw)) {
				line.kind = "fenceClose";
				inMath = false;
			}
			continue;
		}
		if (inComment) {
			line.region = "comment";
			if (line.raw.indexOf("%%") !== -1) inComment = false;
			continue;
		}
		if (line.kind === "fenceOpen") {
			const m = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line.raw);
			if (m) {
				code = { ch: m[1][0], len: m[1].length };
			} else {
				inMath = true; // $$ opener; its own line stays region "none"
			}
			continue;
		}
		if (line.kind === "blank") {
			const t = line.raw.trim();
			if (t === "%%") inComment = true;
		} else if (line.raw.indexOf("%%") !== -1 && line.raw.indexOf("%%", line.raw.indexOf("%%") + 2) === -1) {
			inComment = true; // opener token on a content line
		}
	}

	// A setext underline makes the text line above it (blank lines skipped) a
	// heading title. Marking titles lets R2 protect blank runs inside a
	// multi-line setext heading.
	for (const line of lines) {
		if (line.kind !== "setextUnderline") continue;
		const title = nearestContent(lines, line.index - 1, -1);
		if (title && title.kind === "text") title.kind = "setextTitle";
	}

	const runs: BlankRun[] = [];
	let i = 0;
	while (i < lines.length) {
		if (lines[i].kind !== "blank" || lines[i].region !== "none") {
			i++;
			continue;
		}
		const start = i;
		while (i < lines.length && lines[i].kind === "blank" && lines[i].region === "none") i++;
		const run: BlankRun = {
			start,
			end: i,
			before: nearestContent(lines, start - 1, -1),
			after: nearestContent(lines, i, +1),
			useful: false,
		};
		if (run.before && run.after) {
			run.useful = BUILTIN_RULES.some((rule) => rule.isUseful(run, { lines, runs }));
		}
		runs.push(run);
	}
	return { lines, runs };
}

function nearestContent(lines: ScannedLine[], from: number, dir: number): ScannedLine | null {
	for (let i = from; i >= 0 && i < lines.length; i += dir) {
		if (lines[i].kind !== "blank") return lines[i];
	}
	return null;
}

const isTable = (l: ScannedLine | null): boolean =>
	!!l && (l.kind === "tableRow" || l.kind === "tableDelimiter");
const isHeading = (l: ScannedLine | null): boolean =>
	!!l && (l.kind === "atxHeading" || l.kind === "setextTitle" || l.kind === "setextUnderline");

const tableBoundaryRule: UsefulBlankLineRule = {
	id: "table-boundary",
	isUseful: (run) => {
		// Both sides table rows: a break inside one table → delete (repair).
		// One side table, other side text: block boundary → keep.
		// Both sides table but not a repairable seam: two adjacent tables → keep.
		const { before, after } = run;
		if (!before || !after) return false;
		if (!isTable(before) && !isTable(after)) return false;
		if (isTable(before) && isTable(after)) {
			return !isTableRepairSeam(before, after);
		}
		return true;
	},
};

// A blank line between two rows may be deleted (rows merged) only when the
// seam can still form a pipe-table: header | delimiter, or delimiter | body.
// Row|row seams are NOT repairable — merging them would splice two adjacent
// tables into one bogus table.
function isTableRepairSeam(before: ScannedLine, after: ScannedLine): boolean {
	if (before.kind === "tableDelimiter") return after.kind === "tableRow";
	return before.kind === "tableRow" && after.kind === "tableDelimiter";
}

const headingBoundaryRule: UsefulBlankLineRule = {
	id: "heading-boundary",
	isUseful: (run) => isHeading(run.before) || isHeading(run.after),
};

const thematicBreakBoundaryRule: UsefulBlankLineRule = {
	id: "thematic-break-boundary",
	isUseful: (run) => run.before?.kind === "hr" || run.after?.kind === "hr",
};

const calloutBoundaryRule: UsefulBlankLineRule = {
	id: "callout-boundary",
	isUseful: (run) => run.before?.kind === "callout" || run.after?.kind === "callout",
};

const frontmatterBoundaryRule: UsefulBlankLineRule = {
	id: "frontmatter-boundary",
	// The run right after a closed frontmatter block must survive, or the
	// first body line fuses into the closing fence.
	isUseful: (run) => run.before?.kind === "frontmatterFence",
};

const blockquoteBoundaryRule: UsefulBlankLineRule = {
	id: "blockquote-boundary",
	isUseful: (run) => {
		const b = run.before;
		const a = run.after;
		if (!b || !a || b.kind === "callout" || a.kind === "callout") return false;
		return (
			(b.kind === "blockquote" && a.kind !== "blockquote") ||
			(b.kind !== "blockquote" && a.kind === "blockquote")
		);
	},
};

/** Registry; push more rules to extend. Evaluated top-down, any-vote. */
export const BUILTIN_RULES: UsefulBlankLineRule[] = [
	tableBoundaryRule,
	headingBoundaryRule,
	thematicBreakBoundaryRule,
	calloutBoundaryRule,
	frontmatterBoundaryRule,
	blockquoteBoundaryRule,
];

/** Blank-line cleanup that keeps runs voted useful by BUILTIN_RULES. */
export function removeBlankLinesWithDetector(text: string): string {
	const doc = scanDocument(text);
	const runsByStart = new Map(doc.runs.map((r) => [r.start, r]));
	const out: string[] = [];
	let i = 0;
	while (i < doc.lines.length) {
		const line = doc.lines[i];
		if (line.kind !== "blank" || line.region !== "none") {
			out.push(line.raw);
			i++;
			continue;
		}
		const run = runsByStart.get(i)!;
		if (run.useful) out.push("");
		i = run.end;
	}
	return out.join("\n");
}
